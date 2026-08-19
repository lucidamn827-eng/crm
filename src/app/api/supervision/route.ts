import { db } from "@/lib/db";
import { exigir } from "@/lib/auth";

const SOSPECHOSA = 20; // segundos: por debajo de esto, no hubo llamada real

/** Todo lo que el admin necesita para supervisar sin depender de lo que diga el caller. */
export async function GET(req: Request) {
  try {
    await exigir("ADMIN");
    const url = new URL(req.url);
    const desdeDias = Number(url.searchParams.get("dias") ?? 7);
    const desde = new Date(Date.now() - desdeDias * 24 * 60 * 60 * 1000);

    const callers = await db.usuario.findMany({
      where: { rol: "CALLER" },
      select: { id: true, nombre: true, usuario: true, activo: true, ultimoLatido: true,
                _count: { select: { suscripciones: true } } },
    });

    const llamadas = await db.llamada.findMany({
      where: { creadoEn: { gte: desde } },
      include: { lead: { select: { nombre: true, dni: true, telefono: true } }, caller: { select: { nombre: true } } },
      orderBy: { creadoEn: "desc" },
    });

    const descartes = await db.evento.groupBy({
      by: ["usuarioId"],
      where: { tipo: "descarto_ficha", creadoEn: { gte: desde } },
      _count: { _all: true },
    });

    const zonaOp = process.env.TZ_OPERACION ?? "America/Lima";
    const diaDe = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: zonaOp }).format(d);
    const diasLlamadas = [...new Set(llamadas.map((l) => diaDe(l.creadoEn)))].sort().reverse().slice(0, 7);

    const porCaller = callers.map((c) => {
      const mias = llamadas.filter((l) => l.callerId === c.id);
      const stat = (r: string) => {
        const ls = mias.filter((l) => l.resultado === r);
        const seg = ls.reduce((n, l) => n + l.duracion, 0);
        return { n: ls.length, prom: ls.length ? Math.round(seg / ls.length) : 0, total: seg };
      };
      const cortas = mias.filter((l) => l.duracion < SOSPECHOSA).length;
      return {
        id: c.id, nombre: c.nombre, usuario: c.usuario, activo: c.activo,
        ultimoLatido: c.ultimoLatido, pushActivo: c._count.suscripciones > 0,
        total: mias.length,
        tiempoTotal: mias.reduce((n, l) => n + l.duracion, 0),
        acepto: stat("ACEPTO"), noQuiso: stat("NO_QUISO"),
        noContesto: stat("NO_CONTESTO"), volver: stat("VOLVER_A_LLAMAR"),
        cortas,
        descartes: descartes.find((d) => d.usuarioId === c.id)?._count._all ?? 0,
        // Aceptados día por día, para ver la constancia y no solo el total.
        aceptadosPorDia: diasLlamadas.map((dia) => ({
          dia,
          n: mias.filter((l) => l.resultado === "ACEPTO" && !l.anulada && diaDe(l.creadoEn) === dia).length,
        })),
      };
    });

    // Rendimiento de cada spamer: cuánta data subió y en qué terminó.
    const spamers = await db.usuario.findMany({ where: { rol: "CARGADOR" }, select: { id: true, nombre: true, usuario: true, activo: true } });
    const subidas = await db.lead.findMany({
      where: { creadoEn: { gte: desde } },
      select: { cargadoPorId: true, estado: true, intentos: true, creadoEn: true },
    });

    // Corte del día en la zona horaria de la operación.
    // diaDe ya está definido arriba con la zona de la operación.
    const hoy = diaDe(new Date());
    const dias = [...new Set(subidas.map((l) => diaDe(l.creadoEn)))].sort().reverse().slice(0, 7);
    const porSpamer = spamers.map((sp) => {
      const suyas = subidas.filter((l) => l.cargadoPorId === sp.id);
      const cuenta = (e: string) => suyas.filter((l) => l.estado === e).length;
      const trabajadas = suyas.filter((l) => l.intentos > 0).length;
      return {
        id: sp.id, nombre: sp.nombre, usuario: sp.usuario, activo: sp.activo,
        subidas: suyas.length, trabajadas, sinTocar: suyas.length - trabajadas,
        acepto: cuenta("ACEPTO"), noQuiso: cuenta("NO_QUISO"),
        conversion: trabajadas ? Math.round((cuenta("ACEPTO") / trabajadas) * 100) : 0,
        hoy: suyas.filter((l) => diaDe(l.creadoEn) === hoy).length,
        porDia: dias.map((d) => ({ dia: d, n: suyas.filter((l) => diaDe(l.creadoEn) === d).length })),
      };
    });

    const bitacora = await db.evento.findMany({
      where: { creadoEn: { gte: desde } },
      include: { usuario: { select: { nombre: true, rol: true } } },
      orderBy: { creadoEn: "desc" },
      take: 300,
    });

    return Response.json({
      porCaller,
      porSpamer,
      diasLlamadas,
      dias,
      sospechosas: llamadas.filter((l) => l.duracion < SOSPECHOSA).slice(0, 100),
      llamadas: llamadas.slice(0, 200),
      bitacora,
      umbral: SOSPECHOSA,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}
