import { db } from "@/lib/db";
import { exigir } from "@/lib/auth";

/** El panel lo llama cada minuto: marca presencia y corta si la sesión fue desplazada. */
export async function POST() {
  try {
    const s = await exigir("ADMIN", "CARGADOR", "CALLER");
    await db.usuario.update({ where: { id: s.id }, data: { ultimoLatido: new Date() } }).catch(() => {});
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: "latido" }, { status: 500 });
  }
}
