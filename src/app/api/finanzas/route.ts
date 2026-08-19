import { db } from "@/lib/db";
import { exigir } from "@/lib/auth";
import { devengado, diaDe, INVERSION } from "@/lib/finanzas";

/** Panel de finanzas: ventas por día, saldos por trabajador, gastos y pagos. */
export async function GET(req: Request) {
  try {
    await exigir("ADMIN");
    const url = new URL(req.url);
    const desde = url.searchParams.get("desde");
    const hasta = url.searchParams.get("hasta");

    const { filas, ventas, pagos, usuarios } = await devengado();

    // Ventas agrupadas por día, para el gráfico y el selector de fecha.
    const porDia = new Map<string, { dia: string; ventas: number; monto: number; validadas: number }>();
    ventas.forEach((v) => {
      const d = diaDe(v.creadoEn);
      const r = porDia.get(d) ?? { dia: d, ventas: 0, monto: 0, validadas: 0 };
      r.ventas++; r.monto += v.monto ?? 0; if (v.validada) r.validadas++;
      porDia.set(d, r);
    });
    const dias = [...porDia.values()].sort((a, b) => b.dia.localeCompare(a.dia));

    // Rango elegido (por defecto, todo).
    const enRango = (d: string) => (!desde || d >= desde) && (!hasta || d <= hasta);
    const diasRango = dias.filter((d) => enRango(d.dia));
    const vendidoRango = diasRango.reduce((n, d) => n + d.monto, 0);

    const nombre = (id: string) => usuarios.find((u) => u.id === id)?.nombre ?? "—";
    const totalGanado = filas.reduce((n, f) => n + f.ganado, 0);
    const totalPagado = filas.reduce((n, f) => n + f.pagado, 0);
    const vendidoTotal = ventas.reduce((n, v) => n + (v.monto ?? 0), 0);
    const inversion = vendidoTotal * INVERSION;

    return Response.json({
      dias, diasRango, vendidoRango,
      resumen: {
        vendidoTotal,
        ventas: ventas.length,
        inversion,
        comisiones: filas.reduce((n, f) => n + f.comision, 0),
        fijos: filas.reduce((n, f) => n + f.fijo, 0),
        bonos: filas.reduce((n, f) => n + f.bono, 0),
        totalGanado,
        totalPagado,
        porPagar: totalGanado - totalPagado,
        gastos: totalGanado + inversion,
        utilidad: vendidoTotal - totalGanado - inversion,
        porcentajeInversion: INVERSION,
      },
      trabajadores: filas,
      pagos: pagos.map((p) => ({ ...p, nombre: nombre(p.usuarioId) })),
    });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}

/** Registra uno o varios pagos y devuelve la boleta. */
export async function POST(req: Request) {
  try {
    const s = await exigir("ADMIN");
    const { pagos, metodo, nota } = await req.json();
    if (!Array.isArray(pagos) || !pagos.length)
      return Response.json({ error: "No hay pagos para registrar." }, { status: 400 });

    const lote = `L${Date.now().toString(36).toUpperCase()}`;
    const { filas } = await devengado();

    const creados = [];
    for (const p of pagos) {
      const monto = Number(p.monto);
      if (!Number.isFinite(monto) || monto <= 0) continue;
      const f = filas.find((x) => x.id === p.usuarioId);
      const nuevo = await db.pago.create({
        data: {
          usuarioId: p.usuarioId, monto, metodo: metodo || null, referencia: p.referencia || null,
          concepto: p.concepto || "Pago de comisiones", lote, creadoPor: s.usuario,
          // Guardo cómo estaba la cuenta al momento de pagar, para poder auditarlo después.
          detalle: JSON.stringify({
            ganado: f?.ganado ?? 0, pagadoAntes: f?.pagado ?? 0, saldoAntes: f?.saldo ?? 0,
            comision: f?.comision ?? 0, fijo: f?.fijo ?? 0, bono: f?.bono ?? 0,
            operaciones: f?.operaciones ?? 0, validadas: f?.validadas ?? 0, nota: nota || null,
          }),
        },
      });
      creados.push(nuevo);
    }

    await db.auditoria.create({
      data: { usuario: s.usuario, rol: s.rol, accion: "Pago a trabajadores",
              detalle: `Lote ${lote}: ${creados.length} pago(s) por S/ ${creados.reduce((n, p) => n + p.monto, 0).toFixed(2)}` },
    });
    return Response.json({ ok: true, lote, creados: creados.length });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}

/** Anular un pago mal cargado. */
export async function DELETE(req: Request) {
  try {
    const s = await exigir("ADMIN");
    const { id } = await req.json();
    const p = await db.pago.delete({ where: { id: Number(id) } });
    await db.auditoria.create({
      data: { usuario: s.usuario, rol: s.rol, accion: "Pago anulado", detalle: `Pago ${id} de S/ ${p.monto}` },
    });
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}
