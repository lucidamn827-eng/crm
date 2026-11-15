import { db } from "@/lib/db";
import { exigir, auditar } from "@/lib/auth";
import { registrar, ipDe } from "@/lib/eventos";
import { avisarInicioLlamada } from "@/lib/notificaciones";
import { enviarAviso } from "@/lib/avisos";
import { POSPONER_MIN } from "@/lib/cola";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await exigir("ADMIN", "CALLER");
    const id = Number((await ctx.params).id);
    const { tomar, motivo } = await req.json();
    const ip = ipDe(req) ?? undefined;

    const lead = await db.lead.findUnique({ where: { id } });
    if (!lead) return Response.json({ error: "La ficha no existe." }, { status: 404 });
    if (s.rol === "CALLER" && lead.asignadoAId !== s.id)
      return Response.json({ error: "Esa ficha ya no es tuya." }, { status: 403 });

    if (tomar) {
      // "Llamar ahora": cierra cualquier otra colgada y marca ésta en llamada.
      await db.lead.updateMany({ where: { asignadoAId: s.id, enLlamadaDesde: { not: null }, id: { not: id } }, data: { enLlamadaDesde: null } });
      await db.lead.update({ where: { id }, data: { enLlamadaDesde: new Date(), reservadoEn: null } });
      await registrar(s, "abrio_ficha", { leadId: id, detalle: `${lead.nombre} · ${lead.telefono}`, ip });
      await avisarInicioLlamada(id, s.nombre).catch(() => {});
      await auditar(s, "Inició llamada", `Ficha ${id} · ${lead.nombre}`);
    } else {
      // "Aún no": libera la ficha al pool (con un respiro para que no reaparezca al toque),
      // registra el motivo y NOTIFICA al admin.
      const raz = String(motivo ?? "").trim().slice(0, 200) || "sin motivo";
      const reactiva = new Date(Date.now() + POSPONER_MIN * 60000);
      await db.lead.update({ where: { id }, data: { asignadoAId: null, reservadoEn: null, enLlamadaDesde: null, reactivaEn: reactiva } });
      await registrar(s, "pospuso_llamada", { leadId: id, detalle: `aún no llama: ${raz}`, ip });
      await auditar(s, "Pospuso llamada", `Ficha ${id}: ${raz}`);
      const admins = await db.usuario.findMany({
        where: { rol: "ADMIN" },
        select: { id: true, nombre: true, telegramId: true, telefono: true, ventanaHasta: true, notificar: true },
      });
      for (const a of admins) {
        await enviarAviso({
          destinatario: a, tipo: "caller_pospuso",
          cuerpo: `⏸️ ${s.nombre} eligió "Aún no" en un cliente. Motivo: ${raz}.`,
          parametros: [a.nombre, s.nombre, raz],
        }).catch(() => {});
      }
    }
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}
