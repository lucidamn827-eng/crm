import { db } from "@/lib/db";
import { exigir } from "@/lib/auth";

const digitos = (t: string) => t.replace(/\D/g, "");

/**
 * El caller busca un contacto guardado (no contestó / no quiso) que ya le contestó,
 * para ponerlo como "a llamar". Busca por teléfono, DNI o nombre.
 */
export async function GET(req: Request) {
  try {
    await exigir("CALLER", "ADMIN");
    const q = String(new URL(req.url).searchParams.get("q") ?? "").trim();
    if (q.length < 3) return Response.json({ leads: [] });
    const soloDigitos = digitos(q);

    const or: any[] = [{ nombre: { contains: q, mode: "insensitive" } }];
    if (soloDigitos.length >= 3) {
      or.push({ telefono: { contains: soloDigitos } });
      or.push({ dni: { contains: soloDigitos } });
    }
    const leads = await db.lead.findMany({
      where: {
        archivadoEn: null,
        estado: { in: ["NO_CONTESTO", "NO_QUISO"] as any },
        enLlamadaDesde: null,
        OR: or,
      },
      select: { id: true, nombre: true, telefono: true, dni: true, estado: true, intentos: true, reservadoEn: true, asignadoAId: true },
      orderBy: { creadoEn: "desc" }, take: 20,
    });
    return Response.json({ leads });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}
