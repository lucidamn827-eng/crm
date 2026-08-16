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
