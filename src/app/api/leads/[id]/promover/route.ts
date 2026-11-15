import { db } from "@/lib/db";
import { exigir, auditar } from "@/lib/auth";
import { registrar, ipDe } from "@/lib/eventos";

/**
 * El caller pone un contacto guardado como "a llamar": se lo reserva a él y
 * libera al pool la ficha que tenía reservada (no la que está en llamada).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await exigir("CALLER", "ADMIN");
    const id = Number((await ctx.params).id);
    const ip = ipDe(req) ?? undefined;

    const lead = await db.lead.findUnique({ where: { id }, select: { id: true, nombre: true, estado: true, asignadoAId: true, enLlamadaDesde: true, archivadoEn: true } });
    if (!lead || lead.archivadoEn) return Response.json({ error: "La ficha no existe o está archivada." }, { status: 404 });
    if (lead.enLlamadaDesde) return Response.json({ error: "Ese contacto está en llamada por otra persona." }, { status: 409 });
    if (!["NO_CONTESTO", "NO_QUISO"].includes(lead.estado)) return Response.json({ error: "Ese contacto no se puede promover." }, { status: 409 });

    // Libero mi ficha reservada (si tengo una sin llamar) para no acumular.
    await db.lead.updateMany({
      where: { asignadoAId: s.id, reservadoEn: { not: null }, enLlamadaDesde: null, id: { not: id } },
      data: { asignadoAId: null, reservadoEn: null },
    });
    // Reservo la buscada para mí.
    await db.lead.update({ where: { id }, data: { asignadoAId: s.id, reservadoEn: new Date() } });
    await registrar(s, "promovio_ficha", { leadId: id, detalle: `${lead.nombre}: la puso a llamar`, ip });
    await auditar(s, "Promovió contacto a llamar", `Ficha ${id} · ${lead.nombre}`);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}
