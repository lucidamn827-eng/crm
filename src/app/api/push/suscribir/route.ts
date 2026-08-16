import { db } from "@/lib/db";
import { exigir } from "@/lib/auth";

/** Guarda el dispositivo del usuario que acaba de aceptar los avisos. */
export async function POST(req: Request) {
  try {
    const s = await exigir("ADMIN", "CARGADOR", "CALLER");
    const { endpoint, keys, agente } = await req.json();
    if (!endpoint || !keys?.p256dh || !keys?.auth)
      return Response.json({ error: "Suscripción incompleta." }, { status: 400 });

    await db.suscripcion.upsert({
      where: { endpoint },
      update: { usuarioId: s.id, p256dh: keys.p256dh, auth: keys.auth },
      create: { endpoint, p256dh: keys.p256dh, auth: keys.auth, usuarioId: s.id, agente: agente ?? null },
    });
    return Response.json({ ok: true });
  } catch (e) { return e as Response; }
}

/** El usuario apagó los avisos en ese dispositivo. */
export async function DELETE(req: Request) {
  try {
    await exigir("ADMIN", "CARGADOR", "CALLER");
    const { endpoint } = await req.json();
    await db.suscripcion.deleteMany({ where: { endpoint } });
    return Response.json({ ok: true });
  } catch (e) { return e as Response; }
}
