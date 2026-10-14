import { db } from "@/lib/db";
import { exigir } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Monitor "En vivo" liviano: quién está en llamada ahora y la actividad de los callers.
 * Lo pueden ver admin, encargados y procesadores (solo lectura, datos mínimos).
 */
export async function GET() {
  try {
    await exigir("ADMIN", "ENCARGADO", "PROCESADOR");
    const MIN_INACTIVIDAD = 60; // minutos

    const [callers, enLlamada] = await Promise.all([
      db.usuario.findMany({
        where: { rol: "CALLER", activo: true },
        select: { id: true, nombre: true, ultimoLatido: true, sesionActual: true },
      }),
      db.lead.findMany({
        where: { enLlamadaDesde: { not: null } },
        select: {
          id: true, nombre: true, enLlamadaDesde: true,
          asignadoA: { select: { id: true, nombre: true } },
          cargadoPor: { select: { nombre: true } },
        },
        orderBy: { enLlamadaDesde: "asc" },
      }),
    ]);

    const ahora = Date.now();
    const lista = callers.map((c) => {
      const conectado = !!c.sesionActual && !!c.ultimoLatido &&
        (ahora - new Date(c.ultimoLatido).getTime()) < MIN_INACTIVIDAD * 60000;
      const llamada = enLlamada.find((l) => l.asignadoA?.id === c.id);
      return {
        id: c.id, nombre: c.nombre, conectado,
        enLlamada: !!llamada,
        cliente: llamada?.nombre ?? null,
        spamer: llamada?.cargadoPor?.nombre ?? null,
        desde: llamada?.enLlamadaDesde ?? null,
      };
    }).sort((a, b) => Number(b.enLlamada) - Number(a.enLlamada) || Number(b.conectado) - Number(a.conectado));

    return Response.json({
      callers: lista,
      enLlamada: lista.filter((c) => c.enLlamada).length,
      conectados: lista.filter((c) => c.conectado).length,
      total: lista.length,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}
