import { db } from "@/lib/db";
import { exigir, auditar } from "@/lib/auth";

/** Solo el admin corrige datos de una ficha (errores de carga, reasignaciones, estado). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await exigir("ADMIN", "CARGADOR");
    const id = Number((await ctx.params).id);
    const b = await req.json();

    const actual = await db.lead.findUnique({ where: { id } });
    if (!actual) return Response.json({ error: "La ficha no existe." }, { status: 404 });

    // El spamer solo toca lo que cargó él, y solo si el caller todavía no la trabajó.
    if (s.rol === "CARGADOR") {
      if (actual.cargadoPorId !== s.id)
        return Response.json({ error: "Esa ficha la cargó otra persona." }, { status: 403 });
      if (actual.intentos > 0)
        return Response.json({ error: "Ya fue llamada: pedile la corrección al administrador." }, { status: 409 });
    }

    const permitidos = s.rol === "ADMIN"
      ? ["nombre", "dni", "telefono", "nota", "asignadoAId", "estado"]
      : ["nombre", "dni", "telefono", "nota"];
    const data: any = {};
    for (const k of permitidos) if (b[k] !== undefined && b[k] !== "") data[k] = b[k];
    if (b.liberar && s.rol === "ADMIN") data.enLlamadaDesde = null;

    const lead = await db.lead.update({ where: { id }, data });
    await auditar(s, "Ficha corregida por admin", `Ficha ${id}: ${Object.keys(data).join(", ")}`);
    return Response.json({ ok: true, lead });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await exigir("ADMIN", "CARGADOR");
    const id = Number((await ctx.params).id);
    const actual = await db.lead.findUnique({ where: { id } });
    if (!actual) return Response.json({ error: "La ficha no existe." }, { status: 404 });
    if (s.rol === "CARGADOR") {
      if (actual.cargadoPorId !== s.id)
        return Response.json({ error: "Esa ficha la cargó otra persona." }, { status: 403 });
      if (actual.intentos > 0)
        return Response.json({ error: "Ya fue llamada: no se puede borrar, pedíselo al administrador." }, { status: 409 });
    }
    const lead = await db.lead.delete({ where: { id } });
    await auditar(s, "Ficha eliminada", `${lead.nombre} · ${lead.dni}`);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}
