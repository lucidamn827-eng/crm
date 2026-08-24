import { db } from "@/lib/db";
import { exigir } from "@/lib/auth";

export async function GET() {
  try {
    await exigir("ADMIN");
    const gastos = await db.gasto.findMany({ orderBy: { fecha: "desc" } });
    return Response.json({ gastos, total: gastos.reduce((n, g) => n + g.monto, 0) });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const s = await exigir("ADMIN");
    const { concepto, monto, fecha, categoria } = await req.json();
    const importe = Number(monto);
    if (!concepto?.trim() || !Number.isFinite(importe) || importe <= 0)
      return Response.json({ error: "Poné un concepto y un monto válido." }, { status: 400 });
    const g = await db.gasto.create({
      data: {
        concepto: concepto.trim(), monto: importe, categoria: categoria || null,
        fecha: fecha ? new Date(fecha + "T12:00:00") : new Date(), creadoPor: s.usuario,
      },
    });
    return Response.json({ ok: true, id: g.id });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const s = await exigir("ADMIN");
    const { id } = await req.json();
    await db.gasto.delete({ where: { id: Number(id) } });
    await db.auditoria.create({ data: { usuario: s.usuario, rol: s.rol, accion: "Gasto eliminado", detalle: `Gasto ${id}` } });
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}
