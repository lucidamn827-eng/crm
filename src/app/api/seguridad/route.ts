import { db } from "@/lib/db";
import { exigir } from "@/lib/auth";

const zona = () => process.env.TZ_OPERACION ?? "America/Lima";
const hora = (d: Date) => new Intl.DateTimeFormat("es-PE", { timeZone: zona(), hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
const fechaHora = (d: Date) => new Intl.DateTimeFormat("es-PE", { timeZone: zona(), day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);

/**
 * Detección de "cosecha" de data: callers que abren muchas fichas sin llamar.
 * Todo sale de eventos que ya se registran (abrio_ficha) cruzados con llamadas reales.
 * No frena a nadie: solo informa al admin.
 */
export async function GET(req: Request) {
  try {
    await exigir("ADMIN");
    const dias = Math.min(30, Math.max(1, Number(new URL(req.url).searchParams.get("dias")) || 7));
    const desde = new Date(Date.now() - dias * 86400000);

    const callers = await db.usuario.findMany({ where: { rol: "CALLER" }, select: { id: true, nombre: true, activo: true } });
    const ids = callers.map((c) => c.id);

    const [aperturas, llamadas] = await Promise.all([
      db.evento.findMany({
        where: { usuarioId: { in: ids }, tipo: "abrio_ficha", creadoEn: { gte: desde } },
        select: { usuarioId: true, leadId: true, creadoEn: true }, orderBy: { creadoEn: "asc" },
      }),
      db.llamada.findMany({
        where: { callerId: { in: ids }, creadoEn: { gte: desde } },
        select: { callerId: true, leadId: true, creadoEn: true },
      }),
    ]);

    const porCaller = callers.map((c) => {
      const abrio = aperturas.filter((a) => a.usuarioId === c.id);
      const llamo = llamadas.filter((l) => l.callerId === c.id);
      const totalAbiertas = abrio.length;
      const totalLlamadas = llamo.length;

      // Fichas que abrió pero NUNCA registró una llamada: señal principal de cosecha.
      const leadsLlamados = new Set(llamo.map((l) => l.leadId));
      const abiertasSinLlamar = new Set(abrio.filter((a) => a.leadId && !leadsLlamados.has(a.leadId)).map((a) => a.leadId)).size;

      // Máximo de aperturas en una ventana de 60 min (ritmo de cosecha).
      const tiempos = abrio.map((a) => new Date(a.creadoEn).getTime()).sort((x, y) => x - y);
      let picoPorHora = 0, picoInicio: Date | null = null;
      for (let i = 0; i < tiempos.length; i++) {
        let j = i;
        while (j < tiempos.length && tiempos[j] - tiempos[i] <= 3600000) j++;
        if (j - i > picoPorHora) { picoPorHora = j - i; picoInicio = new Date(tiempos[i]); }
      }

      // Ráfagas: 5+ aperturas en 5 minutos sin ninguna llamada en esa ventana.
      const rafagas: { desde: string; aperturas: number }[] = [];
      for (let i = 0; i < tiempos.length; i++) {
        let j = i;
        while (j < tiempos.length && tiempos[j] - tiempos[i] <= 300000) j++;
        const n = j - i;
        if (n >= 5) {
          const huboLlamada = llamo.some((l) => {
            const t = new Date(l.creadoEn).getTime();
            return t >= tiempos[i] && t <= tiempos[i] + 300000;
          });
          if (!huboLlamada) { rafagas.push({ desde: fechaHora(new Date(tiempos[i])), aperturas: n }); i = j - 1; }
        }
      }

      const ratio = totalAbiertas ? Math.round((totalLlamadas / totalAbiertas) * 100) : 100;
      // Bandera de sospecha: abre mucho y llama poco, o tuvo ráfagas.
      const sospechoso = (totalAbiertas >= 20 && ratio < 50) || rafagas.length > 0 || abiertasSinLlamar >= 15;

      return {
        id: c.id, nombre: c.nombre, activo: c.activo,
        totalAbiertas, totalLlamadas, ratio, abiertasSinLlamar,
        picoPorHora, picoInicio: picoInicio ? fechaHora(picoInicio) : null,
        rafagas, sospechoso,
      };
    }).sort((a, b) => Number(b.sospechoso) - Number(a.sospechoso) || b.abiertasSinLlamar - a.abiertasSinLlamar);

    return Response.json({
      callers: porCaller,
      sospechosos: porCaller.filter((c) => c.sospechoso).map((c) => c.nombre),
      dias,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}
