import { db } from "@/lib/db";

/** Verificación del webhook (la hace Meta una sola vez al configurarlo). */
export async function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get("hub.verify_token") === process.env.WA_VERIFY_TOKEN)
    return new Response(u.searchParams.get("hub.challenge") ?? "");
  return new Response("Token inválido", { status: 403 });
}

/**
 * Cada vez que un caller le escribe al número:
 *  - se abre la ventana de servicio de 24 h (a partir de ahí los recordatorios
 *    salen como texto libre y no como plantilla paga);
 *  - "BAJA" apaga sus notificaciones, "ALTA" las vuelve a prender.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const mensajes = body?.entry?.[0]?.changes?.[0]?.value?.messages ?? [];
  for (const m of mensajes) {
    const desde = String(m.from ?? "").replace(/\D/g, "");
    const texto = String(m.text?.body ?? "").trim().toUpperCase();
    const u = await db.usuario.findFirst({ where: { telefono: desde } });
    if (!u) continue;
    await db.usuario.update({
      where: { id: u.id },
      data: {
        ventanaHasta: new Date(Date.now() + 24 * 60 * 60 * 1000),
        ...(texto === "BAJA" ? { notificar: false } : {}),
        ...(texto === "ALTA" ? { notificar: true } : {}),
      },
    });
  }
  return Response.json({ ok: true });
}
