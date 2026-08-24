import { db } from "@/lib/db";
import { exigir, auditar } from "@/lib/auth";
import { resumenCarga, diaHoy, LIMITE_DIARIO } from "@/lib/carga";

/** Estado de carga de hoy + pedidos pendientes (para spamer y admin). */
export async function GET() {
  try {
    const s = await exigir("ADMIN", "CARGADOR");
    const carga = await resumenCarga();
    const dia = diaHoy();
    const pedidos = await db.pedidoCarga.findMany({
      where: { dia, estado: "PENDIENTE" },
      orderBy: { creadoEn: "asc" },
    });
    // Nombres para mostrar.
    const ids = [...new Set(pedidos.flatMap((p) => [p.callerId, p.spamerId]))];
    const gente = await db.usuario.findMany({ where: { id: { in: ids } }, select: { id: true, nombre: true } });
    const nombre = (id: string) => gente.find((g) => g.id === id)?.nombre ?? "—";
    const pedidosVista = pedidos.map((p) => ({ id: p.id, caller: nombre(p.callerId), spamer: nombre(p.spamerId), callerId: p.callerId }));

    return Response.json({ carga, pedidos: pedidosVista, limite: LIMITE_DIARIO, esAdmin: s.rol === "ADMIN" });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}

/** El spamer pide permiso para subirle más a un caller lleno. */
export async function POST(req: Request) {
  try {
    const s = await exigir("CARGADOR", "ADMIN");
    const { callerId } = await req.json();
    if (!callerId) return Response.json({ error: "Falta el caller." }, { status: 400 });
    const dia = diaHoy();
    // Evita pedidos duplicados del mismo spamer para el mismo caller hoy.
    const existe = await db.pedidoCarga.findFirst({ where: { callerId, spamerId: s.id, dia, estado: "PENDIENTE" } });
    if (existe) return Response.json({ ok: true, yaEstaba: true });
    await db.pedidoCarga.create({ data: { callerId, spamerId: s.id, dia } });
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}

/** El admin resuelve un pedido: sube el tope de ese caller por hoy, o lo rechaza. */
export async function PATCH(req: Request) {
  try {
    const s = await exigir("ADMIN");
    const { pedidoId, callerId, aprobar, nuevoTope } = await req.json();
    const dia = diaHoy();

    if (aprobar) {
      const tope = Number(nuevoTope) || (LIMITE_DIARIO + 10);
      await db.topeCarga.upsert({
        where: { callerId_dia: { callerId, dia } },
        create: { callerId, dia, tope, puestoPor: s.usuario },
        update: { tope, puestoPor: s.usuario },
      });
    }
    if (pedidoId) {
      await db.pedidoCarga.update({ where: { id: Number(pedidoId) }, data: { estado: aprobar ? "APROBADO" : "RECHAZADO", resueltoEn: new Date() } });
    }
    await auditar(s, aprobar ? "Tope de carga ampliado" : "Pedido de carga rechazado", `caller ${callerId}`);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}
