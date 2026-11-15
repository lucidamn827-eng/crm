import { db } from "@/lib/db";
import { exigir } from "@/lib/auth";
import { reservarSiguiente } from "@/lib/cola";

/** El caller pide el siguiente contacto del pool. Se le reserva a ciegas. */
export async function POST() {
  try {
    const s = await exigir("CALLER", "ADMIN");
    const id = await reservarSiguiente(s.id);
    if (!id) return Response.json({ vacio: true });
    // A ciegas: solo id, estado y cuándo se cargó la data.
    const lead = await db.lead.findUnique({ where: { id }, select: { id: true, estado: true, creadoEn: true, reservadoEn: true } });
    return Response.json({ ok: true, lead });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}
