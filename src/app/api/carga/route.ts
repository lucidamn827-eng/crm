import { db } from "@/lib/db";
import { exigir } from "@/lib/auth";
import { resumenSubida, resumenPool, dataSubidaHoy, topeSubidaDe, getPrioridadCola, setPrioridadCola } from "@/lib/carga";
import { enviarAviso } from "@/lib/avisos";

/** Estado de subida de hoy. El spamer ve lo suyo; el admin ve a todos + el pool. */
export async function GET() {
  try {
    const s = await exigir("ADMIN", "CARGADOR");
    if (s.rol === "ADMIN") {
      const [spamers, pool, prioridad] = await Promise.all([resumenSubida(), resumenPool(), getPrioridadCola()]);
      return Response.json({ esAdmin: true, spamers, pool, prioridad });
    }
    // Spamer: su propio estado de subida.
    const [hoy, tope] = await Promise.all([dataSubidaHoy(s.id), topeSubidaDe(s.id)]);
    const faltan = tope !== null ? Math.max(0, tope - hoy) : null;
    return Response.json({
      esAdmin: false,
      hoy, tope, faltan,
      lleno: tope !== null && hoy >= tope,
      porLlegar: tope !== null && faltan !== null && faltan > 0 && faltan <= 5, // aviso 5 antes
    });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}

/** El admin cambia qué prioriza la cola: data nueva o data reposada (volver a llamar). */
export async function PATCH(req: Request) {
  try {
    await exigir("ADMIN");
    const { prioridad } = await req.json();
    if (prioridad !== "nueva" && prioridad !== "reposada") return Response.json({ error: "Prioridad inválida." }, { status: 400 });
    await setPrioridadCola(prioridad);
    return Response.json({ ok: true, prioridad });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}

/** El spamer llegó a su tope y pide al admin que le habilite más subida por hoy. */
export async function POST() {
  try {
    const s = await exigir("CARGADOR");
    const admins = await db.usuario.findMany({
      where: { rol: "ADMIN" },
      select: { id: true, nombre: true, telegramId: true, telefono: true, ventanaHasta: true, notificar: true },
    });
    for (const a of admins) {
      await enviarAviso({
        destinatario: a,
        tipo: "pedido_subida",
        cuerpo: `📥 ${s.nombre} llegó a su tope de subida de hoy y pide que le habilites más data. Ajustá su tope en Supervisión.`,
        parametros: [a.nombre, s.nombre],
      }).catch(() => {});
    }
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}
