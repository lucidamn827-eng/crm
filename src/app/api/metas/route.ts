import { db } from "@/lib/db";
import { exigir } from "@/lib/auth";
import { devengado, semanaDe } from "@/lib/finanzas";

/** Proyección hacia la meta de utilidad. Se guarda en Config. */
export async function GET() {
  try {
    await exigir("ADMIN");
    const cfg = await db.config.findMany({ where: { clave: { in: ["meta_utilidad", "meta_fecha"] } } });
    const val = (k: string) => cfg.find((c) => c.clave === k)?.valor ?? "";

    const metaUtilidad = Number(val("meta_utilidad")) || 1_000_000;
    const metaFecha = val("meta_fecha") || null;

    const { filas, ventas } = await devengado();
    const totalGastos = (await db.gasto.findMany({ select: { monto: true } })).reduce((n, g) => n + g.monto, 0);

    const semanas = new Map<string, number>();
    ventas.forEach((v) => semanas.set(semanaDe(v.creadoEn), (semanas.get(semanaDe(v.creadoEn)) ?? 0) + (v.monto ?? 0)));

    const vendidoTotal = ventas.reduce((n, v) => n + (v.monto ?? 0), 0);
    const ganadoTotal = filas.reduce((n, f) => n + f.ganado, 0);
    const tasaPago = vendidoTotal ? ganadoTotal / vendidoTotal : 0;

    const series = [...semanas.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([sem, vendido]) => {
      const utilidad = vendido - vendido * tasaPago;
      return { semana: sem, vendido, utilidad, margen: vendido ? utilidad / vendido : 0 };
    });

    const utilidadAcumulada = vendidoTotal - ganadoTotal - totalGastos;
    const margenActual = vendidoTotal ? utilidadAcumulada / vendidoTotal : 0;

    const ultimas = series.slice(-4);
    const ritmoSemanal = ultimas.length ? ultimas.reduce((n, s) => n + s.utilidad, 0) / ultimas.length : 0;

    const falta = Math.max(0, metaUtilidad - utilidadAcumulada);
    const semanasRestantes = ritmoSemanal > 0 ? Math.ceil(falta / ritmoSemanal) : null;

    let ventaSemanalNecesaria = null, utilidadSemanalNecesaria = null, semanasHastaFecha = null;
    if (metaFecha) {
      const dias = Math.ceil((new Date(metaFecha).getTime() - Date.now()) / 86400000);
      semanasHastaFecha = Math.max(1, Math.ceil(dias / 7));
      utilidadSemanalNecesaria = falta / semanasHastaFecha;
      ventaSemanalNecesaria = margenActual > 0 ? utilidadSemanalNecesaria / margenActual : null;
    }

    return Response.json({
      metaUtilidad, metaFecha,
      utilidadAcumulada, margenActual, ritmoSemanal, falta,
      semanasRestantes, semanasHastaFecha, utilidadSemanalNecesaria, ventaSemanalNecesaria,
      enCamino: semanasHastaFecha && semanasRestantes ? semanasRestantes <= semanasHastaFecha : null,
      series: series.slice(-12),
    });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const s = await exigir("ADMIN");
    const { metaUtilidad, metaFecha } = await req.json();
    const set = async (clave: string, valor: string) =>
      db.config.upsert({ where: { clave }, create: { clave, valor }, update: { valor } });
    if (metaUtilidad !== undefined) await set("meta_utilidad", String(metaUtilidad));
    if (metaFecha !== undefined) await set("meta_fecha", String(metaFecha));
    await db.auditoria.create({ data: { usuario: s.usuario, rol: s.rol, accion: "Meta actualizada", detalle: `${metaUtilidad} / ${metaFecha}` } });
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}
