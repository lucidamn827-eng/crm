import { db } from "@/lib/db";
import { exigir } from "@/lib/auth";
import { lunesDeEstaSemana, bonoDe, siguienteMeta } from "@/lib/semana";

const COMISION_BASE = 0.10;
const COMISION_PRIMERO = 0.12;

/** Liquidación de la semana: comisión por ventas + bono de escalón + 12% si le toca. */
export async function GET(req: Request) {
  try {
    const s = await exigir("ADMIN", "CARGADOR", "CALLER");
    const url = new URL(req.url);
    const verTodos = url.searchParams.get("todos") === "1" && s.rol === "ADMIN";

    const desde = lunesDeEstaSemana();
    const semanaPasada = new Date(desde); semanaPasada.setDate(semanaPasada.getDate() - 7);

    // Quién ganó la semana pasada: cobra 12% esta semana.
    const prev = await db.llamada.findMany({
      where: { resultado: "ACEPTO", anulada: false, creadoEn: { gte: semanaPasada, lt: desde } },
      select: { callerId: true },
    });
    const conteoPrev = new Map<string, number>();
    prev.forEach((l) => conteoPrev.set(l.callerId, (conteoPrev.get(l.callerId) ?? 0) + 1));
    const campeonPrevio = [...conteoPrev.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    const ventas = await db.llamada.findMany({
      where: { resultado: "ACEPTO", creadoEn: { gte: desde } },
      include: { lead: { select: { nombre: true, dni: true, telefono: true } }, caller: { select: { nombre: true } } },
      orderBy: { creadoEn: "desc" },
    });

    const armar = (usuarioId: string, nombre: string) => {
      const mias = ventas.filter((v) => v.callerId === usuarioId && !v.anulada);
      const anuladas = ventas.filter((v) => v.callerId === usuarioId && v.anulada);
      const vendido = mias.reduce((n, v) => n + (v.monto ?? 0), 0);
      const tasa = campeonPrevio === usuarioId ? COMISION_PRIMERO : COMISION_BASE;
      const bono = bonoDe("CALLER", mias.length);
      return {
        id: usuarioId, nombre,
        ventas: mias.length,
        anuladas: anuladas.length,
        pendientesValidar: mias.filter((v) => !v.validada).length,
        vendido,
        tasa,
        comision: vendido * tasa,
        bono,
        siguiente: siguienteMeta("CALLER", mias.length),
        total: vendido * tasa + bono,
        ticket: mias.length ? vendido / mias.length : 0,
      };
    };

    if (verTodos) {
      const callers = await db.usuario.findMany({ where: { rol: "CALLER" }, select: { id: true, nombre: true } });
      const filas = callers.map((c) => armar(c.id, c.nombre));
      return Response.json({
        desde, filas,
        totales: {
          vendido: filas.reduce((n, f) => n + f.vendido, 0),
          comision: filas.reduce((n, f) => n + f.comision, 0),
          bonos: filas.reduce((n, f) => n + f.bono, 0),
          aPagar: filas.reduce((n, f) => n + f.total, 0),
          ventas: filas.reduce((n, f) => n + f.ventas, 0),
        },
        ventas: ventas.map((v) => ({
          id: v.id, monto: v.monto, referencia: v.referencia, validada: v.validada, anulada: v.anulada,
          creadoEn: v.creadoEn, caller: v.caller?.nombre, lead: v.lead,
        })),
      });
    }

    const mio = armar(s.id, s.nombre);
    return Response.json({
      desde, mio,
      detalle: ventas.filter((v) => v.callerId === s.id).map((v) => ({
        id: v.id, monto: v.monto, referencia: v.referencia, validada: v.validada, anulada: v.anulada,
        creadoEn: v.creadoEn, lead: v.lead,
      })),
    });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}

/** El admin valida o anula una venta. */
export async function PATCH(req: Request) {
  try {
    const s = await exigir("ADMIN");
    const { id, validada, anulada, monto } = await req.json();
    const data: any = { revisadoPor: s.usuario, revisadoEn: new Date() };
    if (validada !== undefined) data.validada = !!validada;
    if (anulada !== undefined) data.anulada = !!anulada;
    if (monto !== undefined && Number.isFinite(Number(monto))) data.monto = Number(monto);

    const v = await db.llamada.update({ where: { id: Number(id) }, data });
    await db.auditoria.create({
      data: { usuario: s.usuario, rol: s.rol, accion: "Venta revisada", detalle: `Llamada ${id}: ${JSON.stringify({ validada, anulada, monto })}` },
    });
    return Response.json({ ok: true, venta: v });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}
