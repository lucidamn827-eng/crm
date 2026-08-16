/**
 * Envío por WhatsApp Cloud API (Meta).
 *
 * Regla de negocio importante:
 *  - Si el caller le escribió algo al número en las últimas 24 h, hay una
 *    "ventana de servicio" abierta y se puede mandar texto libre (hoy sin costo).
 *  - Si la ventana está cerrada, Meta sólo deja mandar PLANTILLAS aprobadas,
 *    y cada envío se cobra. Por eso cada caller debería escribir "hola" al
 *    número al empezar el turno: abre la ventana y los recordatorios salen gratis.
 */
import { db } from "./db";

const API = "https://graph.facebook.com/v21.0";

async function llamarApi(cuerpo: Record<string, unknown>) {
  const r = await fetch(`${API}/${process.env.WA_PHONE_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WA_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", ...cuerpo }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error?.message ?? `HTTP ${r.status}`);
  return data;
}

export const ventanaAbierta = (hasta?: Date | null) => !!hasta && hasta.getTime() > Date.now();

/** Manda el aviso por el canal que corresponda y lo deja registrado. */
export async function avisar(opts: {
  usuarioId: string;
  telefono?: string | null;
  ventanaHasta?: Date | null;
  notificar: boolean;
  tipo: string;
  cuerpo: string;
  /** Parámetros de la plantilla, en el orden {{1}}, {{2}}, ... */
  parametros: string[];
}) {
  const { usuarioId, telefono, ventanaHasta, notificar, tipo, cuerpo, parametros } = opts;
  if (!notificar || !telefono) return { enviado: false, motivo: "sin teléfono o notificaciones apagadas" };

  const canal = ventanaAbierta(ventanaHasta) ? "ventana" : "plantilla";
  try {
    if (canal === "ventana") {
      await llamarApi({ to: telefono, type: "text", text: { preview_url: false, body: cuerpo } });
    } else {
      await llamarApi({
        to: telefono,
        type: "template",
        template: {
          name: process.env.WA_PLANTILLA_AVISO,
          language: { code: process.env.WA_IDIOMA_PLANTILLA ?? "es" },
          components: [{ type: "body", parameters: parametros.map((p) => ({ type: "text", text: p })) }],
        },
      });
    }
    await db.aviso.create({ data: { usuarioId, tipo, canal, cuerpo, entregado: true } });
    return { enviado: true, canal };
  } catch (e: any) {
    await db.aviso.create({
      data: { usuarioId, tipo, canal, cuerpo, entregado: false, error: String(e?.message ?? e).slice(0, 300) },
    });
    return { enviado: false, motivo: String(e?.message ?? e) };
  }
}
