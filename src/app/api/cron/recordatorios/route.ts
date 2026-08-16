import { correrRecordatorios, reiniciarContadores } from "@/lib/notificaciones";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Lo dispara Vercel Cron (o un cron externo) con:
 *   Authorization: Bearer <CRON_SECRET>
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return new Response("No autorizado", { status: 401 });

  const hora = new Date().getUTCHours();
  const minuto = new Date().getUTCMinutes();
  if (hora === 3 && minuto < 10) await reiniciarContadores(); // limpieza diaria del tope

  const r = await correrRecordatorios();
  return Response.json({ ok: true, ...r, corridoEn: new Date().toISOString() });
}
