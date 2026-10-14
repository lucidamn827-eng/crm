import { db } from "@/lib/db";
import { exigir } from "@/lib/auth";
import { archivarViejas, DIAS_ARCHIVO } from "@/lib/notificaciones";

export const dynamic = "force-dynamic";

/** Lista las fichas archivadas (admin). */
export async function GET() {
  try {
    await exigir("ADMIN");
    const leads = await db.lead.findMany({
      where: { archivadoEn: { not: null } },
      include: { asignadoA: { select: { nombre: true } }, cargadoPor: { select: { nombre: true } } },
      orderBy: { archivadoEn: "desc" },
      take: 1000,
    });
    return Response.json({ leads, dias: DIAS_ARCHIVO, total: leads.length });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}

/** Acciones del admin: archivar ahora (todas las viejas), o recuperar una ficha. */
export async function POST(req: Request) {
  try {
    const s = await exigir("ADMIN");
    const { accion, id } = await req.json();

    if (accion === "archivar_ahora") {
      const r = await archivarViejas();
      return Response.json({ ok: true, ...r });
    }
    if (accion === "recuperar" && id) {
      await db.lead.update({
        where: { id: Number(id) },
        data: { archivadoEn: null, reactivaEn: new Date(), agendadoPara: null },
      });
      await db.auditoria.create({
        data: { usuario: s.usuario, rol: s.rol, accion: "Ficha recuperada del archivo", detalle: `Ficha ${id}` },
      });
      return Response.json({ ok: true });
    }
    return Response.json({ error: "Acción inválida." }, { status: 400 });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}
