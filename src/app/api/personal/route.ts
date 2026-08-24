import { db } from "@/lib/db";
import { exigir } from "@/lib/auth";

const zona = () => process.env.TZ_OPERACION ?? "America/Lima";
const mesDe = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: zona(), year: "numeric", month: "2-digit" }).format(d).slice(0, 7);

/** Todo el tablero personal: saldo, mes actual, presupuestos y alertas. */
export async function GET(req: Request) {
  try {
    await exigir("ADMIN"); // solo el dueño
    const mes = new URL(req.url).searchParams.get("mes") || mesDe(new Date());

    const [movs, presupuestos, ajustes] = await Promise.all([
      db.movimientoPersonal.findMany({ orderBy: { fecha: "desc" } }),
      db.presupuestoPersonal.findMany(),
      db.ajustePersonal.findMany(),
    ]);
    const val = (k: string) => ajustes.find((a) => a.clave === k)?.valor ?? "";
    const saldoInicial = Number(val("saldo_inicial")) || 0;
    const metaAhorro = Number(val("meta_ahorro")) || 0;

    // Saldo global = saldo inicial + todos los ingresos − todos los gastos.
    const totIngresos = movs.filter((m) => m.tipo === "ingreso").reduce((n, m) => n + m.monto, 0);
    const totGastos = movs.filter((m) => m.tipo === "gasto").reduce((n, m) => n + m.monto, 0);
    const saldoActual = saldoInicial + totIngresos - totGastos;

    // Movimientos del mes elegido.
    const delMes = movs.filter((m) => mesDe(m.fecha) === mes);
    const ingresosMes = delMes.filter((m) => m.tipo === "ingreso").reduce((n, m) => n + m.monto, 0);
    const gastosMes = delMes.filter((m) => m.tipo === "gasto").reduce((n, m) => n + m.monto, 0);
    const ahorroMes = ingresosMes - gastosMes;

    // Gasto por categoría este mes, cruzado con su presupuesto.
    const catMap = new Map<string, number>();
    delMes.filter((m) => m.tipo === "gasto").forEach((m) => catMap.set(m.categoria, (catMap.get(m.categoria) ?? 0) + m.monto));
    const categorias = [...new Set([...catMap.keys(), ...presupuestos.map((p) => p.categoria)])].map((cat) => {
      const gastado = catMap.get(cat) ?? 0;
      const p = presupuestos.find((x) => x.categoria === cat);
      const limite = p?.limite ?? 0;
      return {
        categoria: cat, gastado, limite, color: p?.color ?? null,
        pct: limite ? Math.round((gastado / limite) * 100) : null,
        excedido: limite > 0 && gastado > limite,
        cerca: limite > 0 && gastado >= limite * 0.8 && gastado <= limite,
      };
    }).sort((a, b) => b.gastado - a.gastado);

    // Serie de los últimos 6 meses para ver la tendencia.
    const meses = [...new Set(movs.map((m) => mesDe(m.fecha)))].sort().slice(-6);
    const tendencia = meses.map((mm) => {
      const g = movs.filter((m) => m.tipo === "gasto" && mesDe(m.fecha) === mm).reduce((n, m) => n + m.monto, 0);
      const i = movs.filter((m) => m.tipo === "ingreso" && mesDe(m.fecha) === mm).reduce((n, m) => n + m.monto, 0);
      return { mes: mm, gastos: g, ingresos: i, ahorro: i - g };
    });

    const alertas = categorias.filter((c) => c.excedido || c.cerca).map((c) => ({
      categoria: c.categoria, excedido: c.excedido, gastado: c.gastado, limite: c.limite,
    }));

    return Response.json({
      mes, saldoInicial, saldoActual, metaAhorro,
      ingresosMes, gastosMes, ahorroMes,
      cumpleAhorro: metaAhorro > 0 ? ahorroMes >= metaAhorro : null,
      categorias, presupuestos, tendencia, alertas,
      movimientos: delMes.slice(0, 100),
      mesesDisponibles: [...new Set(movs.map((m) => mesDe(m.fecha)))].sort().reverse(),
    });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await exigir("ADMIN");
    const b = await req.json();

    if (b.accion === "movimiento") {
      const monto = Number(b.monto);
      if (!b.categoria?.trim() || !Number.isFinite(monto) || monto <= 0)
        return Response.json({ error: "Poné categoría y monto válido." }, { status: 400 });
      await db.movimientoPersonal.create({
        data: { tipo: b.tipo === "ingreso" ? "ingreso" : "gasto", monto, categoria: b.categoria.trim(),
                nota: b.nota || null, fecha: b.fecha ? new Date(b.fecha + "T12:00:00") : new Date() },
      });
      return Response.json({ ok: true });
    }
    if (b.accion === "presupuesto") {
      await db.presupuestoPersonal.upsert({
        where: { categoria: b.categoria },
        create: { categoria: b.categoria, limite: Number(b.limite) || 0, color: b.color || null },
        update: { limite: Number(b.limite) || 0, color: b.color || null },
      });
      return Response.json({ ok: true });
    }
    if (b.accion === "ajuste") {
      const set = (clave: string, valor: string) =>
        db.ajustePersonal.upsert({ where: { clave }, create: { clave, valor }, update: { valor } });
      if (b.saldoInicial !== undefined) await set("saldo_inicial", String(b.saldoInicial));
      if (b.metaAhorro !== undefined) await set("meta_ahorro", String(b.metaAhorro));
      return Response.json({ ok: true });
    }
    return Response.json({ error: "Acción desconocida." }, { status: 400 });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    await exigir("ADMIN");
    const { id, categoria } = await req.json();
    if (categoria) await db.presupuestoPersonal.delete({ where: { categoria } });
    else if (id) await db.movimientoPersonal.delete({ where: { id: Number(id) } });
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}
