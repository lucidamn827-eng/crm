import { db } from "@/lib/db";
import { exigir } from "@/lib/auth";

/** El caller ve solo sus propias llamadas; el admin las ve todas. */
export async function GET() {
  try {
    const s = await exigir("ADMIN", "CALLER");
    const llamadas = await db.llamada.findMany({
      where: s.rol === "CALLER" ? { callerId: s.id } : {},
      include: { lead: { select: { nombre: true, dni: true, telefono: true, cargadoPor: { select: { nombre: true } } } },
                 caller: { select: { nombre: true } } },
      orderBy: { creadoEn: "desc" },
      take: 300,
    });
    return Response.json({ llamadas });
  } catch (e) { return e as Response; }
}

/** El admin corrige un resultado mal cargado por un caller. */
export async function PATCH(req: Request) {
  try {
    const s = await exigir(); // admin o caller (con restricciones)
    const { id, resultado, nota, monto, reabrir } = await req.json();
    const llamada = await db.llamada.findUnique({ where: { id: Number(id) } });
    if (!llamada) return Response.json({ error: "La llamada no existe." }, { status: 404 });

    // El CALLER solo puede tocar SUS propias llamadas, y solo dos cosas:
    //  (a) modificar el monto de una venta aceptada (el cliente pidió más después)
    //  (b) reabrir un "no quiso" para volver a llamar
    if (s.rol === "CALLER") {
      if (llamada.callerId !== s.id) return Response.json({ error: "Esa llamada no es tuya." }, { status: 403 });
      if (llamada.validada || llamada.anulada) return Response.json({ error: "Esa venta ya fue revisada por el admin; pedile a él el cambio." }, { status: 409 });

      // (b) Reabrir "no quiso": la ficha vuelve a la cola para volver a llamar.
      if (reabrir) {
        if (llamada.resultado !== "NO_QUISO") return Response.json({ error: "Solo se puede reabrir un “no quiso”." }, { status: 400 });
        await db.lead.update({ where: { id: llamada.leadId }, data: { estado: "VOLVER_A_LLAMAR" as any, agendadoPara: new Date(), reactivaEn: null } });
        return Response.json({ ok: true });
      }
      // (a) Modificar el monto de un aceptado.
      if (monto !== undefined) {
        if (llamada.resultado !== "ACEPTO") return Response.json({ error: "Solo se puede editar el monto de una venta aceptada." }, { status: 400 });
        const m = Number(monto);
        if (!Number.isFinite(m) || m < 0) return Response.json({ error: "Monto inválido." }, { status: 400 });
        await db.llamada.update({ where: { id: Number(id) }, data: { monto: m } });
        // Si tenía seguimiento (se fue a 0 / no banca) y ahora pagó, se cierra el seguimiento.
        if (m > 0) await db.lead.update({ where: { id: llamada.leadId }, data: { seguimiento: null } });
        return Response.json({ ok: true });
      }
      return Response.json({ error: "Nada para cambiar." }, { status: 400 });
    }

    // ADMIN: corrección completa (como antes).
    await db.llamada.update({
      where: { id: Number(id) },
      data: { ...(resultado ? { resultado } : {}), ...(nota !== undefined ? { nota } : {}), ...(monto !== undefined ? { monto: Number(monto) } : {}) },
    });
    if (resultado) await db.lead.update({ where: { id: llamada.leadId }, data: { estado: resultado } });
    await db.auditoria.create({
      data: { usuario: s.usuario, rol: s.rol, accion: "Llamada corregida por admin", detalle: `Llamada ${id} -> ${resultado ?? (monto !== undefined ? "monto" : "nota")}` },
    });
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}
