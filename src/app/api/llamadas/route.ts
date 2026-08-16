import { db } from "@/lib/db";
import { exigir } from "@/lib/auth";

/** El caller ve solo sus propias llamadas; el admin las ve todas. */
export async function GET() {
  try {
    const s = await exigir("ADMIN", "CALLER");
    const llamadas = await db.llamada.findMany({
      where: s.rol === "CALLER" ? { callerId: s.id } : {},
      include: { lead: { select: { nombre: true, dni: true, telefono: true } } },
      orderBy: { creadoEn: "desc" },
      take: 300,
    });
    return Response.json({ llamadas });
  } catch (e) { return e as Response; }
}

/** El admin corrige un resultado mal cargado por un caller. */
export async function PATCH(req: Request) {
  try {
    const s = await exigir("ADMIN");
    const { id, resultado, nota } = await req.json();
    const llamada = await db.llamada.update({
      where: { id: Number(id) },
      data: { ...(resultado ? { resultado } : {}), ...(nota !== undefined ? { nota } : {}) },
    });
    if (resultado) await db.lead.update({ where: { id: llamada.leadId }, data: { estado: resultado } });
    await db.auditoria.create({
      data: { usuario: s.usuario, rol: s.rol, accion: "Llamada corregida por admin", detalle: `Llamada ${id} -> ${resultado ?? "nota"}` },
    });
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}
