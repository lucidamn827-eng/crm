import { db } from "@/lib/db";
import { exigir } from "@/lib/auth";

const zona = () => process.env.TZ_OPERACION ?? "America/Lima";
const HORA_ENTRADA = 9; // hora de ingreso esperada
const TOLERANCIA_MIN = 5; // minutos de gracia
const LIBRE_MIN = 15; // conectado sin llamar por más de esto = "call libre"

const dia = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: zona(), year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const horaLocal = (d: Date) => new Intl.DateTimeFormat("es-PE", { timeZone: zona(), hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
// Minutos desde medianoche (hora Perú) de una fecha.
function minutosDelDia(d: Date): number {
  const s = new Intl.DateTimeFormat("en-US", { timeZone: zona(), hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  const [h, m] = s.split(":").map(Number);
  return (h % 24) * 60 + m;
}

/**
 * Asistencia de un rango de días + estado "call libre" en vivo.
 * Todo sale de la tabla Evento (login) y Llamada (resultados), que ya se registran.
 */
export async function GET(req: Request) {
  try {
    await exigir("ADMIN", "ENCARGADO");
    const dias = Math.min(30, Math.max(1, Number(new URL(req.url).searchParams.get("dias")) || 7));
    const desde = new Date(Date.now() - dias * 86400000);

    const callers = await db.usuario.findMany({ where: { rol: "CALLER", activo: true }, select: { id: true, nombre: true, ultimoLatido: true, encargadoId: true } });
    const ids = callers.map((c) => c.id);

    const [logins, llamadas] = await Promise.all([
      db.evento.findMany({
        where: { usuarioId: { in: ids }, tipo: { in: ["login", "desplazo_sesion"] }, creadoEn: { gte: desde } },
        select: { usuarioId: true, creadoEn: true }, orderBy: { creadoEn: "asc" },
      }),
      db.llamada.findMany({
        where: { callerId: { in: ids }, creadoEn: { gte: desde } },
        select: { callerId: true, creadoEn: true }, orderBy: { creadoEn: "asc" },
      }),
    ]);

    const esperado = HORA_ENTRADA * 60 + TOLERANCIA_MIN;

    // Por cada caller y cada día con actividad: primera entrada y primera llamada.
    const porCaller = callers.map((c) => {
      const misLogins = logins.filter((l) => l.usuarioId === c.id);
      const misLlam = llamadas.filter((l) => l.callerId === c.id);
      const dias = new Map<string, { primerLogin?: Date; primeraLlamada?: Date; llamadas: number }>();
      misLogins.forEach((l) => {
        const k = dia(l.creadoEn); const r = dias.get(k) ?? { llamadas: 0 };
        if (!r.primerLogin || l.creadoEn < r.primerLogin) r.primerLogin = l.creadoEn;
        dias.set(k, r);
      });
      misLlam.forEach((l) => {
        const k = dia(l.creadoEn); const r = dias.get(k) ?? { llamadas: 0 };
        if (!r.primeraLlamada || l.creadoEn < r.primeraLlamada) r.primeraLlamada = l.creadoEn;
        r.llamadas++; dias.set(k, r);
      });

      const filas = [...dias.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([d, r]) => {
        const minLogin = r.primerLogin ? minutosDelDia(r.primerLogin) : null;
        const tarde = minLogin !== null && minLogin > esperado;
        return {
          dia: d,
          entrada: r.primerLogin ? horaLocal(r.primerLogin) : "—",
          primeraLlamada: r.primeraLlamada ? horaLocal(r.primeraLlamada) : "—",
          llamadas: r.llamadas,
          tarde, minutosTarde: tarde && minLogin !== null ? minLogin - (HORA_ENTRADA * 60) : 0,
        };
      });

      const diasConEntrada = filas.filter((f) => f.entrada !== "—");
      const tardanzas = diasConEntrada.filter((f) => f.tarde).length;
      const promEntrada = diasConEntrada.length
        ? Math.round(diasConEntrada.reduce((n, f) => n + (Number(f.entrada.split(":")[0]) * 60 + Number(f.entrada.split(":")[1])), 0) / diasConEntrada.length)
        : null;

      // ¿Está "call libre" ahora? Logueado hace poco pero sin llamadas recientes.
      const activoAhora = c.ultimoLatido && (Date.now() - new Date(c.ultimoLatido).getTime()) < 5 * 60000;
      const ultimaLlamada = misLlam.length ? misLlam[misLlam.length - 1].creadoEn : null;
      const minSinLlamar = ultimaLlamada ? Math.floor((Date.now() - new Date(ultimaLlamada).getTime()) / 60000) : null;
      const callLibre = !!activoAhora && (minSinLlamar === null || minSinLlamar >= LIBRE_MIN);

      return {
        id: c.id, nombre: c.nombre,
        tardanzas, diasTrabajados: diasConEntrada.length,
        promedioEntrada: promEntrada !== null ? `${String(Math.floor(promEntrada / 60)).padStart(2, "0")}:${String(promEntrada % 60).padStart(2, "0")}` : "—",
        activoAhora: !!activoAhora, callLibre, minSinLlamar,
        filas,
      };
    });

    return Response.json({
      callers: porCaller,
      horaEntrada: `${String(HORA_ENTRADA).padStart(2, "0")}:00`,
      tolerancia: TOLERANCIA_MIN, libreMin: LIBRE_MIN,
      libresAhora: porCaller.filter((c) => c.callLibre).map((c) => c.nombre),
    });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}
