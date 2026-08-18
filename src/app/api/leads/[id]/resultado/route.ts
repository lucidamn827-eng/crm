import { db } from "@/lib/db";
import { exigir, auditar } from "@/lib/auth";
import { programarSiguiente, avisarAceptado } from "@/lib/notificaciones";
import { registrar, ipDe } from "@/lib/eventos";

const VALIDOS = ["ACEPTO", "NO_QUISO", "NO_CONTESTO", "VOLVER_A_LLAMAR"];

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await exigir("ADMIN", "CALLER");
    const id = Number((await ctx.params).id);
    const { resultado, nota } = await req.json();
    if (!VALIDOS.includes(resultado)) return Response.json({ error: "Resultado inválido." }, { status: 400 });

    const lead = await db.lead.findUnique({ where: { id } });
    if (!lead) return Response.json({ error: "La ficha no existe." }, { status: 404 });
    if (s.rol === "CALLER" && lead.asignadoAId !== s.id)
      return Response.json({ error: "Esa ficha no es tuya." }, { status: 403 });

    // El tiempo lo calcula el servidor con la hora de apertura: el caller no puede falsearlo.
    const abiertoEn = lead.enLlamadaDesde ?? new Date();
    const duracion = Math.max(0, Math.floor((Date.now() - abiertoEn.getTime()) / 1000));
    const ip = ipDe(req) ?? undefined;

    await db.llamada.create({
      data: {
        leadId: id, callerId: s.id, resultado, nota: nota || null, duracion, abiertoEn,
        desdeIp: ip ?? null, agente: req.headers.get("user-agent")?.slice(0, 160) ?? null,
      },
    });
    await db.lead.update({ where: { id }, data: { estado: resultado, intentos: { increment: 1 }, enLlamadaDesde: null } });
    await programarSiguiente(id, resultado);
    // El spamer que cargó la data se entera del cierre en el momento.
    if (resultado === "ACEPTO") await avisarAceptado(id, s.nombre);
    await registrar(s, "resultado", { leadId: id, detalle: `${resultado} · ${lead.nombre}`, segundos: duracion, ip });
    await auditar(s, "Resultado de llamada", `Ficha ${id} (${lead.telefono}): ${resultado} en ${duracion}s`);
    return Response.json({ ok: true, duracion });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}
