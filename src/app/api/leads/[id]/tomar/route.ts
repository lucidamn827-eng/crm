import { db } from "@/lib/db";
import { exigir, auditar } from "@/lib/auth";
import { registrar, ipDe } from "@/lib/eventos";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await exigir("ADMIN", "CALLER");
    const id = Number((await ctx.params).id);
    const { tomar } = await req.json();
    const ip = ipDe(req) ?? undefined;

    const lead = await db.lead.findUnique({ where: { id } });
    if (!lead) return Response.json({ error: "La ficha no existe." }, { status: 404 });
    if (s.rol === "CALLER" && lead.asignadoAId !== s.id)
      return Response.json({ error: "Esa ficha no es tuya." }, { status: 403 });

    if (tomar) {
      await db.lead.update({ where: { id }, data: { enLlamadaDesde: new Date() } });
      await registrar(s, "abrio_ficha", { leadId: id, detalle: `${lead.nombre} · ${lead.telefono}`, ip });
    } else {
      // Abrió y se arrepintió: queda registrado con cuánto la tuvo abierta.
      const seg = lead.enLlamadaDesde ? Math.floor((Date.now() - lead.enLlamadaDesde.getTime()) / 1000) : 0;
      await db.lead.update({ where: { id }, data: { enLlamadaDesde: null } });
      await registrar(s, "descarto_ficha", { leadId: id, detalle: `${lead.nombre}: abrió y no llamó`, segundos: seg, ip });
    }
    await auditar(s, tomar ? "Inició llamada" : "Descartó ficha sin llamar", `Ficha ${id} · ${lead.nombre}`);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}
