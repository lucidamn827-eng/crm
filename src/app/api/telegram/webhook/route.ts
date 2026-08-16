import { db } from "@/lib/db";
import { enviarTexto, responderBoton, fichaTelegram, tg } from "@/lib/telegram";
import { programarSiguiente } from "@/lib/notificaciones";

const ETI: Record<string, string> = {
  ACEPTO: "✅ Aceptó", NO_CONTESTO: "📵 No contestó",
  NO_QUISO: "❌ No quiso", VOLVER_A_LLAMAR: "🔁 Volver a llamar",
};

export async function POST(req: Request) {
  // Telegram manda este header si configuraste secret_token en setWebhook.
  if (req.headers.get("x-telegram-bot-api-secret-token") !== process.env.TG_SECRETO)
    return new Response("No autorizado", { status: 401 });

  const up = await req.json().catch(() => ({}));

  /* ---- 1. Botones de resultado ---- */
  if (up.callback_query) {
    const cb = up.callback_query;
    const chatId = String(cb.from.id);
    const [, leadId, resultado] = String(cb.data ?? "").split(":");
    const usuario = await db.usuario.findFirst({ where: { telegramId: chatId, activo: true } });
    if (!usuario) return responderYSalir(cb.id, "Tu cuenta no está vinculada.");

    const lead = await db.lead.findUnique({ where: { id: Number(leadId) } });
    if (!lead) return responderYSalir(cb.id, "La ficha ya no existe.");
    if (lead.asignadoAId !== usuario.id && usuario.rol !== "ADMIN")
      return responderYSalir(cb.id, "Esa ficha no es tuya.");

    await db.llamada.create({ data: { leadId: lead.id, callerId: usuario.id, resultado: resultado as any } });
    await db.lead.update({ where: { id: lead.id }, data: { estado: resultado as any, intentos: { increment: 1 } } });
    await programarSiguiente(lead.id, resultado);
    await db.auditoria.create({
      data: { usuario: usuario.usuario, rol: usuario.rol, accion: "Resultado por Telegram", detalle: `Ficha ${lead.id}: ${resultado}` },
    });

    await responderBoton(cb.id, `Registrado: ${ETI[resultado] ?? resultado}`);
    await tg("editMessageReplyMarkup", { chat_id: chatId, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] } });
    await enviarTexto(chatId, `Guardado: <b>${ETI[resultado]}</b> en la ficha ${String(lead.id).padStart(4, "0")}.\nSi querés dejar una nota, respondé este mensaje con el texto.`);
    return Response.json({ ok: true });
  }

  /* ---- 2. Mensajes de texto ---- */
  const m = up.message;
  if (!m?.text) return Response.json({ ok: true });
  const chatId = String(m.chat.id);
  const texto = String(m.text).trim();

  // Vinculación: /start CODIGO (el admin genera el código desde el panel)
  if (texto.startsWith("/start")) {
    const codigo = texto.split(/\s+/)[1];
    if (!codigo) return responderTexto(chatId, "Pedile a tu administrador el código de vinculación y mandá:\n<code>/start TUCODIGO</code>");
    const u = await db.usuario.findFirst({ where: { codigoTg: codigo, activo: true } });
    if (!u) return responderTexto(chatId, "Ese código no sirve o ya se usó. Pedí uno nuevo.");
    await db.usuario.update({ where: { id: u.id }, data: { telegramId: chatId, codigoTg: null } });
    return responderTexto(chatId, `Listo ${u.nombre}, quedaste vinculado. Desde ahora te llegan acá los contactos para llamar.\n\n/cola — ver lo que tenés pendiente\n/pausa — dejar de recibir avisos\n/activar — volver a recibirlos`);
  }

  const usuario = await db.usuario.findFirst({ where: { telegramId: chatId, activo: true } });
  if (!usuario) return responderTexto(chatId, "No te reconozco. Mandá <code>/start TUCODIGO</code> con el código que te dio tu administrador.");

  if (texto === "/pausa") {
    await db.usuario.update({ where: { id: usuario.id }, data: { notificar: false } });
    return responderTexto(chatId, "Avisos pausados. Mandá /activar cuando vuelvas.");
  }
  if (texto === "/activar") {
    await db.usuario.update({ where: { id: usuario.id }, data: { notificar: true } });
    return responderTexto(chatId, "Avisos activados de nuevo.");
  }
  if (texto === "/cola") {
    const fichas = await db.lead.findMany({
      where: { asignadoAId: usuario.id, estado: { in: ["PENDIENTE", "NO_CONTESTO", "VOLVER_A_LLAMAR"] } },
      orderBy: { id: "asc" }, take: 5,
    });
    if (!fichas.length) return responderTexto(chatId, "No tenés nada pendiente. 👌");
    for (const f of fichas) {
      const { texto: t, teclado } = fichaTelegram(f);
      await enviarTexto(chatId, t, teclado);
    }
    return Response.json({ ok: true });
  }

  // Cualquier otro texto que responda a un resultado se guarda como nota de la última llamada.
  if (m.reply_to_message) {
    const ultima = await db.llamada.findFirst({ where: { callerId: usuario.id }, orderBy: { creadoEn: "desc" } });
    if (ultima) {
      await db.llamada.update({ where: { id: ultima.id }, data: { nota: texto.slice(0, 500) } });
      return responderTexto(chatId, "Nota guardada en la ficha.");
    }
  }
  return responderTexto(chatId, "Comandos: /cola · /pausa · /activar");
}

async function responderTexto(chatId: string, texto: string) {
  await enviarTexto(chatId, texto);
  return Response.json({ ok: true });
}
async function responderYSalir(cbId: string, texto: string) {
  await responderBoton(cbId, texto);
  return Response.json({ ok: true });
}
