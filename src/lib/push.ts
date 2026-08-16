/**
 * Web Push (el mismo estándar que usan Gmail o Slack en el navegador).
 * Gratis, sin intermediarios y funciona con la app cerrada.
 *
 * Android/Chrome/Edge/Firefox: alcanza con dar permiso.
 * iPhone: hay que instalar la web en la pantalla de inicio (Compartir →
 * "Agregar a inicio") y recién ahí aparece el permiso. Es iOS 16.4 o superior.
 */
import webpush from "web-push";
import { db } from "./db";

let listo = false;
function configurar() {
  if (listo) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:avisos@example.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  listo = true;
}

export async function enviarPush(usuarioId: string, carga: { titulo: string; cuerpo: string; url?: string; tag?: string }) {
  configurar();
  const subs = await db.suscripcion.findMany({ where: { usuarioId } });
  if (!subs.length) return { enviado: false, motivo: "sin dispositivos registrados" };

  let ok = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(carga)
        );
        ok++;
      } catch (e: any) {
        // 404/410 = el navegador borró la suscripción (desinstaló o limpió datos)
        if (e?.statusCode === 404 || e?.statusCode === 410)
          await db.suscripcion.delete({ where: { id: s.id } }).catch(() => {});
      }
    })
  );
  return { enviado: ok > 0, dispositivos: ok };
}
