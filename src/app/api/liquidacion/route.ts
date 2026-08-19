import { db } from "@/lib/db";
import { exigir } from "@/lib/auth";
import { lunesDeEstaSemana, bonoDe, siguienteMeta } from "@/lib/semana";

const BASE = 0.10;        // comisión normal del caller
const PRIMERO = 0.12;     // caller que ganó el ranking la semana pasada
const PROCESADOR = 0.10;  // quien procesa el pago
const ENCARGADO = 0.10;   // jefe, sobre las ventas de su gente
const POR_VALIDADA = 10;  // soles fijos por cada venta validada, para caller y spamer

/**
 * Liquidación semanal. Cada rol cobra distinto:
 *  - CALLER: 10% (12% si ganó el ranking) de lo que vendió + bono de escalón
 *  - PROCESADOR: 10% de las ventas que procesó
 *  - ENCARGADO: 10% de las ventas de la gente a su cargo
 *  - CARGADOR (spamer): bono de escalón por data subida
 */
export async function GET(req: Request) {
  try {
    const s = await exigir("ADMIN", "CARGADOR", "CALLER", "ENCARGADO", "PROCESADOR");
    const verTodos = new URL(req.url).searchParams.get("todos") === "1" && s.rol === "ADMIN";

    const desde = lunesDeEstaSemana();
    const anterior = new Date(desde); anterior.setDate(anterior.getDate() - 7);

    const [usuarios, ventas, prev, leadsSemana] = await Promise.all([
      db.usuario.findMany({ select: { id: true, nombre: true, usuario: true, rol: true, encargadoId: true, activo: true } }),
      db.llamada.findMany({
        where: { resultado: "ACEPTO", creadoEn: { gte: desde } },
        include: {
          caller: { select: { id: true, nombre: true } },
          procesador: { select: { id: true, nombre: true } },
          lead: { select: { nombre: true, dni: true, telefono: true, cargadoPorId: true, cargadoPor: { select: { nombre: true } } } },
        },
        orderBy: { creadoEn: "desc" },
      }),
      db.llamada.findMany({
        where: { resultado: "ACEPTO", anulada: false, creadoEn: { gte: anterior, lt: desde } },
        select: { callerId: true },
      }),
      db.lead.findMany({ where: { creadoEn: { gte: desde } }, select: { cargadoPorId: true } }),
    ]);

    const leadsPrev = await db.lead.findMany({
      where: { creadoEn: { gte: anterior, lt: desde } },
      select: { cargadoPorId: true },
    });

    // Campeón de la semana pasada: cobra 12% esta semana.
    const masFrecuente = (ids: string[]) => {
      const c = new Map<string, number>();
      ids.forEach((id) => c.set(id, (c.get(id) ?? 0) + 1));
      return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    };
    const campeon = masFrecuente(prev.map((l) => l.callerId));                 // caller que ganó la semana pasada
    const campeonSpamer = masFrecuente(leadsPrev.map((l) => l.cargadoPorId));  // spamer que ganó la semana pasada

    const validas = ventas.filter((v) => !v.anulada);
    const fila = (v: any) => ({
      id: v.id, monto: v.monto ?? 0, referencia: v.referencia, validada: v.validada, anulada: v.anulada,
      creadoEn: v.creadoEn, caller: v.caller?.nombre, procesador: v.procesador?.nombre ?? "—",
      cliente: v.lead?.nombre, dni: v.lead?.dni, telefono: v.lead?.telefono, spamer: v.lead?.cargadoPor?.nombre ?? "—",
    });

    /** Arma la liquidación de una persona según su rol. */
    function armar(u: { id: string; nombre: string; rol: string }) {
      if (u.rol === "CALLER") {
        const mias = validas.filter((v) => v.callerId === u.id);
        const vendido = mias.reduce((n, v) => n + (v.monto ?? 0), 0);
        const tasa = campeon === u.id ? PRIMERO : BASE;
        const bono = bonoDe("CALLER", mias.length);
        const validadas = mias.filter((v) => v.validada).length;
        const fijo = validadas * POR_VALIDADA;
        return {
          id: u.id, nombre: u.nombre, rol: u.rol, concepto: "Comisión + S/ 10 por venta validada",
          operaciones: mias.length, base: vendido, tasa, comision: vendido * tasa, bono,
          validadas, fijo, porValidada: POR_VALIDADA,
          total: vendido * tasa + bono + fijo, siguiente: siguienteMeta("CALLER", mias.length),
          pendientes: mias.filter((v) => !v.validada).length,
          anuladas: ventas.filter((v) => v.callerId === u.id && v.anulada).length,
          detalle: ventas.filter((v) => v.callerId === u.id).map(fila),
        };
      }
      if (u.rol === "PROCESADOR") {
        const mias = validas.filter((v) => v.procesadorId === u.id);
        const base = mias.reduce((n, v) => n + (v.monto ?? 0), 0);
        return {
          id: u.id, nombre: u.nombre, rol: u.rol, concepto: "10% de las ventas que procesaste",
          operaciones: mias.length, base, tasa: PROCESADOR, comision: base * PROCESADOR, bono: 0,
          validadas: mias.filter((v) => v.validada).length, fijo: 0,
          total: base * PROCESADOR, siguiente: null,
          pendientes: mias.filter((v) => !v.validada).length, anuladas: 0,
          detalle: ventas.filter((v) => v.procesadorId === u.id).map(fila),
        };
      }
      if (u.rol === "ENCARGADO") {
        const equipo = usuarios.filter((x) => x.encargadoId === u.id);
        const ids = new Set(equipo.map((x) => x.id));
        // Cuenta la venta si la cerró un caller suyo o si la data la subió un spamer suyo.
        const mias = validas.filter((v) => ids.has(v.callerId) || (v.lead?.cargadoPorId && ids.has(v.lead.cargadoPorId)));
        const base = mias.reduce((n, v) => n + (v.monto ?? 0), 0);
        return {
          id: u.id, nombre: u.nombre, rol: u.rol, concepto: "10% de las ventas de tu equipo",
          operaciones: mias.length, base, tasa: ENCARGADO, comision: base * ENCARGADO, bono: 0,
          validadas: mias.filter((v) => v.validada).length, fijo: 0,
          total: base * ENCARGADO, siguiente: null,
          pendientes: mias.filter((v) => !v.validada).length, anuladas: 0,
          equipo: equipo.map((x) => ({ id: x.id, nombre: x.nombre, rol: x.rol })),
          detalle: mias.map(fila),
        };
      }
      // Spamer: 10% de las ventas que salieron de su data (12% si ganó el ranking) + bono por escalón.
      const subidas = leadsSemana.filter((l) => l.cargadoPorId === u.id).length;
      const generadas = validas.filter((v) => v.lead?.cargadoPorId === u.id);
      const base = generadas.reduce((n, v) => n + (v.monto ?? 0), 0);
      const tasa = campeonSpamer === u.id ? PRIMERO : BASE;
      const bono = bonoDe("CARGADOR", subidas);
      const validadas = generadas.filter((v) => v.validada).length;
      const fijo = validadas * POR_VALIDADA;
      return {
        id: u.id, nombre: u.nombre, rol: u.rol, concepto: "Comisión + S/ 10 por venta validada + bono por subir",
        operaciones: subidas, base, tasa, comision: base * tasa, bono,
        validadas, fijo, porValidada: POR_VALIDADA,
        total: base * tasa + bono + fijo, siguiente: siguienteMeta("CARGADOR", subidas),
        pendientes: generadas.filter((v) => !v.validada).length, anuladas: 0,
        ventasGeneradas: generadas.length,
        detalle: generadas.map(fila),
      };
    }

    if (verTodos) {
      const filas = usuarios.filter((u) => u.rol !== "ADMIN" && u.activo).map((u) => armar(u as any));
      return Response.json({
        desde, filas,
        totales: {
          vendido: validas.reduce((n, v) => n + (v.monto ?? 0), 0),
          ventas: validas.length,
          aPagar: filas.reduce((n, f) => n + f.total, 0),
          comisiones: filas.reduce((n, f) => n + f.comision, 0),
          bonos: filas.reduce((n, f) => n + f.bono, 0),
          fijos: filas.reduce((n, f) => n + (f.fijo ?? 0), 0),
          sinValidar: validas.filter((v) => !v.validada).length,
        },
        ventas: ventas.map(fila),
      });
    }

    const yo = usuarios.find((u) => u.id === s.id)!;
    return Response.json({ desde, mio: armar(yo as any) });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}

/** El admin valida, anula o corrige el monto de una venta. */
export async function PATCH(req: Request) {
  try {
    const s = await exigir("ADMIN");
    const { id, validada, anulada, monto, procesadorId, referencia } = await req.json();
    const data: any = { revisadoPor: s.usuario, revisadoEn: new Date() };
    if (validada !== undefined) data.validada = !!validada;
    if (anulada !== undefined) data.anulada = !!anulada;
    if (monto !== undefined && Number.isFinite(Number(monto))) data.monto = Number(monto);
    if (procesadorId !== undefined) data.procesadorId = procesadorId || null;
    if (referencia !== undefined) data.referencia = referencia || null;

    await db.llamada.update({ where: { id: Number(id) }, data });
    await db.auditoria.create({
      data: { usuario: s.usuario, rol: s.rol, accion: "Venta revisada", detalle: `Llamada ${id}: ${JSON.stringify({ validada, anulada, monto })}` },
    });
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}
