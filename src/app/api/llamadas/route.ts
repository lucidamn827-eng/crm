import { db } from "@/lib/db";
import { exigir } from "@/lib/auth";

/** El caller ve solo sus propias llamadas; el admin las ve todas. */
export async function GET() {
  try {
    const s = await exigir("ADMIN", "CALLER");
    const llamadas = await db.llamada.findMany({
      where: s.rol === "CALLER" ? { callerId: s.id } : {},
      include: { lead: { select: { nombre: true, dni: true, telefono: true } } },
      orderBy: { creadoEn: "desc" },
      take: 300,
    });
    return Response.json({ llamadas });
  } catch (e) { return e as Response; }
}
