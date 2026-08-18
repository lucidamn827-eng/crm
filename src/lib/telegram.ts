/**
 * Telegram Bot API. Sin costo por mensaje, sin plantillas y sin aprobación previa.
 * Único requisito: el caller tiene que abrirle chat al bot una vez (/start CODIGO);
 * los bots no pueden escribirle primero a alguien que nunca los saludó.
 *
 * Límites: ~30 mensajes/segundo en total y ~1 por segundo al mismo chat.
 * Para un call center de decenas de callers eso sobra de lejos.
 */
const API = () => `https://api.telegram.org/bot${process.env.TG_TOKEN}`;

export async function tg(metodo: string, cuerpo: Record<string, unknown>) {
  const r = await fetch(`${API()}/${metodo}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  const d = await r.json();
  if (!d.ok) throw new Error(d.description ?? `HTTP ${r.status}`);
  return d.result;
}

export const enviarTexto = (chatId: string, texto: string, teclado?: unknown) =>
  tg("sendMessage", {
    chat_id: chatId,
    text: texto,
    parse_mode: "HTML",
    ...(teclado ? { reply_markup: { inline_keyboard: teclado } } : {}),
  });

/** Ficha completa con botones: el caller llama y marca el resultado sin salir del chat. */
export function fichaTelegram(lead: { id: number; nombre: string; dni?: string; telefono: string; nota?: string | null; intentos: number }) {
  const texto =
    `<b>Ficha ${String(lead.id).padStart(4, "0")}</b>\n` +
    `${lead.nombre}${lead.dni ? ` · DNI ${lead.dni}` : ""}\n` +
    `<a href="tel:${lead.telefono.replace(/\D/g, "")}">${lead.telefono}</a>\n` +
    (lead.nota ? `\n<i>${lead.nota}</i>\n` : "") +
    (lead.intentos ? `\nIntentos previos: ${lead.intentos}` : "");
  const teclado = [
    [{ text: "📞 Llamar", url: `tel:${lead.telefono.replace(/\D/g, "")}` }],
    [
      { text: "✅ Aceptó", callback_data: `r:${lead.id}:ACEPTO` },
      { text: "📵 No contestó", callback_data: `r:${lead.id}:NO_CONTESTO` },
    ],
    [
      { text: "❌ No quiso", callback_data: `r:${lead.id}:NO_QUISO` },
      { text: "🔁 Volver a llamar", callback_data: `r:${lead.id}:VOLVER_A_LLAMAR` },
    ],
  ];
  return { texto, teclado };
}

export const responderBoton = (id: string, texto: string) =>
  tg("answerCallbackQuery", { callback_query_id: id, text: texto });

export const editarMensaje = (chatId: string, messageId: number, texto: string) =>
  tg("editMessageText", { chat_id: chatId, message_id: messageId, text: texto, parse_mode: "HTML" });
