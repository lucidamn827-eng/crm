import { correrRecordatorios, reiniciarContadores, archivarViejas, sancionarDesconectados } from "@/lib/notificaciones";

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
  let archivado = null;
  if (hora === 3 && minuto < 10) {
    await reiniciarContadores();          // limpieza diaria del tope
    archivado = await archivarViejas();   // archiva volver-a-llamar/no-contestó de +7 días
  }

  const r = await correrRecordatorios();
  // Control de presencia: restringe a los callers desconectados +20 min en horario laboral.
  const sancion = await sancionarDesconectados().catch((e) => ({ error: String(e?.message ?? e) }));
  return Response.json({ ok: true, ...r, archivado, sancion, corridoEn: new Date().toISOString() });
}
