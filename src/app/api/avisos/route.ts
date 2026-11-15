import { db } from "@/lib/db";
import { exigir } from "@/lib/auth";

/** Notificaciones del usuario actual para la campanita + cuántas sin leer. */
export async function GET() {
  try {
    const s = await exigir("ADMIN", "CARGADOR", "CALLER", "ENCARGADO", "PROCESADOR");
    const [avisos, usuario] = await Promise.all([
      db.aviso.findMany({ where: { usuarioId: s.id }, orderBy: { creadoEn: "desc" }, take: 40,
        select: { id: true, tipo: true, cuerpo: true, creadoEn: true } }),
      db.usuario.findUnique({ where: { id: s.id }, select: { avisosVistosEn: true } }),
    ]);
    const corte = usuario?.avisosVistosEn ?? new Date(0);
    const sinLeer = avisos.filter((a) => a.creadoEn > corte).length;
    return Response.json({ avisos, sinLeer, vistosEn: corte });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}

/** Marcar todas como leídas. */
export async function POST() {
  try {
    const s = await exigir("ADMIN", "CARGADOR", "CALLER", "ENCARGADO", "PROCESADOR");
    await db.usuario.update({ where: { id: s.id }, data: { avisosVistosEn: new Date() } });
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}
