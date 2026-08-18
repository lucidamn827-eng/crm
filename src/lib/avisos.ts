import { db } from "./db";
import { avisar as avisarWhatsapp } from "./whatsapp";
import { enviarTexto, fichaTelegram } from "./telegram";
import { enviarPush } from "./push";

type Destinatario = {
  id: string; nombre: string; telegramId?: string | null; telefono?: string | null;
  ventanaHasta?: Date | null; notificar: boolean;
};

/**
 * Un solo punto de salida para todos los avisos.
 * Prioridad: push de la app (gratis) → Telegram (gratis) → WhatsApp (se cobra).
 */
export async function enviarAviso(opts: {
  destinatario: Destinatario;
  tipo: string;
  cuerpo: string;
  parametros: string[];
  /** Si viene una ficha, en Telegram se manda con los botones de resultado. */
  ficha?: { id: number; nombre: string; dni?: string; telefono: string; nota?: string | null; intentos: number };
}) {
  const { destinatario: d, tipo, cuerpo, parametros, ficha } = opts;
  if (!d.notificar) return { enviado: false, motivo: "notificaciones apagadas" };

  const push = await enviarPush(d.id, {
    titulo: ficha ? `Contacto para llamar: ${ficha.nombre}` : "Lima Limón",
    cuerpo: ficha ? `${ficha.telefono}${ficha.dni ? ` · DNI ${ficha.dni}` : ""}` : cuerpo,
    url: "/panel",
    tag: `caller-${d.id}`,
  }).catch(() => ({ enviado: false }));
  if (push.enviado) {
    await db.aviso.create({ data: { usuarioId: d.id, tipo, canal: "push", cuerpo, entregado: true } });
    return { enviado: true, canal: "push" };
  }

  if (d.telegramId) {
    try {
      if (ficha) {
        const { texto, teclado } = fichaTelegram(ficha);
        await enviarTexto(d.telegramId, `${cuerpo}\n\n${texto}`, teclado);
      } else {
        await enviarTexto(d.telegramId, cuerpo);
      }
      await db.aviso.create({ data: { usuarioId: d.id, tipo, canal: "telegram", cuerpo, entregado: true } });
      return { enviado: true, canal: "telegram" };
    } catch (e: any) {
      await db.aviso.create({
        data: { usuarioId: d.id, tipo, canal: "telegram", cuerpo, entregado: false, error: String(e?.message ?? e).slice(0, 300) },
      });
    }
  }

  if (d.telefono && process.env.WA_TOKEN) {
    return avisarWhatsapp({
      usuarioId: d.id, telefono: d.telefono, ventanaHasta: d.ventanaHasta,
      notificar: d.notificar, tipo, cuerpo, parametros,
    });
  }
  return { enviado: false, motivo: "el usuario no tiene Telegram vinculado ni WhatsApp cargado" };
}
