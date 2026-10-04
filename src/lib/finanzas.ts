import { db } from "./db";
import { METAS, bonoDe } from "./semana";

export const BASE = 0.10;
export const PRIMERO = 0.12;
export const PROCESADOR = 0.10;
export const ENCARGADO = 0.10;
export const POR_VALIDADA = 10;   // soles por venta validada (caller y spamer)
export const INCENTIVO_DOMINGO = 0.05; // 5% EXTRA para el caller por sus ventas del domingo (solo caller)
export const MIN_VENTAS_DIA = 5;  // el caller necesita 5+ ventas validadas EN EL DÍA para cobrar sus S/10 de ese día
export const INVERSION = 0.20;    // 20% de inversión inicial sobre lo vendido

const zona = () => process.env.TZ_OPERACION ?? "America/Lima";
export const diaDe = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: zona() }).format(d);
/** ¿La fecha cae DOMINGO en la zona de operación? */
export const esDomingo = (d: Date) => new Date(d.toLocaleString("en-US", { timeZone: zona() })).getDay() === 0;

/** Lunes (en formato AAAA-MM-DD) de la semana a la que pertenece una fecha. */
export function semanaDe(d: Date): string {
  const local = new Date(d.toLocaleString("en-US", { timeZone: zona() }));
  const dia = local.getDay();
  local.setDate(local.getDate() - (dia === 0 ? 6 : dia - 1));
  return diaDe(local);
}

/**
 * Calcula lo que se le debe a cada persona desde el principio, semana por semana.
 * Se hace así porque el 12% del ranking y los bonos de escalón dependen de
 * cada semana por separado, no del total acumulado.
 */
type Devengado = Awaited<ReturnType<typeof _calcularDevengado>>;
let _cache: { t: number; data: Devengado } | null = null;
export function invalidarDevengado() { _cache = null; }
const TTL_MS = 20000; // 20 segundos

export async function devengado(): Promise<Devengado> {
  if (_cache && Date.now() - _cache.t < TTL_MS) return _cache.data;
  const data = await _calcularDevengado();
  _cache = { t: Date.now(), data };
  return data;
}

async function _calcularDevengado() {
  const [usuarios, ventas, leads, pagos] = await Promise.all([
    db.usuario.findMany({ select: { id: true, nombre: true, usuario: true, rol: true, encargadoId: true, activo: true } }),
    db.llamada.findMany({
      where: { resultado: "ACEPTO", anulada: false },
      select: { id: true, callerId: true, procesadorId: true, monto: true, validada: true, creadoEn: true,
                caller: { select: { nombre: true } },
                lead: { select: { nombre: true, dni: true, telefono: true, cargadoPorId: true, cargadoPor: { select: { nombre: true } } } } },
    }),
    db.lead.findMany({ select: { cargadoPorId: true, creadoEn: true } }),
    db.pago.findMany({ orderBy: { creadoEn: "desc" } }),
  ]);

  // Cache de semanaDe: la misma fecha se consulta miles de veces; formatear es caro.
  const cacheSemana = new Map<number, string>();
  const semDe = (d: Date) => {
    const t = d.getTime();
    let v = cacheSemana.get(t);
    if (!v) { v = semanaDe(d); cacheSemana.set(t, v); }
    return v;
  };
  // Pre-agrupar ventas y leads por semana UNA sola vez (antes se filtraba por cada semana).
  const ventasPorSem = new Map<string, typeof ventas>();
  const leadsPorSem = new Map<string, typeof leads>();
  for (const v of ventas) { const k = semDe(v.creadoEn); (ventasPorSem.get(k) ?? ventasPorSem.set(k, []).get(k)!).push(v); }
  for (const l of leads) { const k = semDe(l.creadoEn); (leadsPorSem.get(k) ?? leadsPorSem.set(k, []).get(k)!).push(l); }
  const semanas = [...new Set([...ventasPorSem.keys(), ...leadsPorSem.keys()])].sort();

  // El 12% se define por EQUIPO: gana el 1° de su grupo, y solo si el equipo
  // tiene al menos MIN_EQUIPO personas de ese rol activas.
  const MIN_EQUIPO = 3;
  const equipoDeUsuario = (id: string) => {
    const u = usuarios.find((x) => x.id === id);
    if (!u) return "sin-equipo";
    return u.rol === "ENCARGADO" ? u.id : (u.encargadoId ?? "sin-equipo");
  };
  const rolDe = (id: string) => usuarios.find((x) => x.id === id)?.rol;

  // Cuántos de cada rol hay por equipo (para el mínimo de 3).
  const cuentaRolEquipo = (eq: string, rol: string) =>
    usuarios.filter((u) => u.rol === rol && (rol === "ENCARGADO" ? u.id : u.encargadoId ?? "sin-equipo") === eq).length;

  // Campeón por (equipo, rol, semana).
  const campeonPorEquipo = (ids: string[], rol: string) => {
    const porEquipo = new Map<string, Map<string, number>>();
    ids.forEach((id) => {
      if (rolDe(id) !== rol) return;
      const eq = equipoDeUsuario(id);
      if (!porEquipo.has(eq)) porEquipo.set(eq, new Map());
      const m = porEquipo.get(eq)!;
      m.set(id, (m.get(id) ?? 0) + 1);
    });
    const ganadores = new Set<string>();
    porEquipo.forEach((m, eq) => {
      if (cuentaRolEquipo(eq, rol) < MIN_EQUIPO) return; // equipo chico: sin 12%
      const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (top) ganadores.add(top);
    });
    return ganadores; // conjunto de ids que ganaron su equipo esa semana
  };

  const campeonCaller = new Map<string, Set<string>>();
  semanas.forEach((sem) => {
    // El ranking de callers considera SOLO lunes a sábado (el domingo no cuenta,
    // porque no todos trabajan ese día y no sería justo para la tabla).
    const ventasRanking = (ventasPorSem.get(sem) ?? []).filter((v) => !esDomingo(v.creadoEn));
    campeonCaller.set(sem, campeonPorEquipo(ventasRanking.map((v) => v.callerId), "CALLER"));
  });
  // Los spamers YA NO tienen competencia por el 12%: siempre cobran su 10% base.
  const anterior = (sem: string) => semanas[semanas.indexOf(sem) - 1] ?? null;
  // Equipo de cada encargado, cacheado (se consulta por cada venta).
  const cacheEquipo = new Map<string, Set<string>>();
  const equipoDe = (id: string) => {
    let e = cacheEquipo.get(id);
    if (!e) { e = new Set(usuarios.filter((x) => x.encargadoId === id).map((x) => x.id)); cacheEquipo.set(id, e); }
    return e;
  };

  const resumen = new Map<string, { comision: number; fijo: number; bono: number; incentivo: number; operaciones: number; validadas: number }>();
  // Ganado por trabajador EN CADA SEMANA (para el historial semanal de pagos).
  const porSemana = new Map<string, Map<string, number>>(); // usuarioId -> (semana -> ganado)
  const sumarSemana = (id: string | null | undefined, sem: string, valor: number) => {
    if (!id || !valor) return;
    const m = porSemana.get(id) ?? new Map<string, number>();
    m.set(sem, (m.get(sem) ?? 0) + valor);
    porSemana.set(id, m);
  };
  // Desglose por día del caller: cuántas validó y si ese día llegó al mínimo de 5.
  const diasCaller = new Map<string, { dia: string; validadas: number; paga: boolean }[]>();
  let semActual = ""; // la fija el loop de semanas
  const sumar = (id: string | null | undefined, campo: "comision" | "fijo" | "bono" | "incentivo", valor: number, ops = 0, val = 0) => {
    if (!id || !valor && !ops && !val) return;
    const r = resumen.get(id) ?? { comision: 0, fijo: 0, bono: 0, incentivo: 0, operaciones: 0, validadas: 0 };
    r[campo] += valor; r.operaciones += ops; r.validadas += val;
    resumen.set(id, r);
    sumarSemana(id, semActual, valor); // el ganado de esta semana (todo lo que cobra)
  };

  for (const sem of semanas) {
    semActual = sem;
    const vSem = ventasPorSem.get(sem) ?? [];
    const lSem = leadsPorSem.get(sem) ?? [];
    const prev = anterior(sem);
    const callerCampeones = prev ? campeonCaller.get(prev) : null;

    // Recorro las ventas y leads de la semana UNA sola vez, agrupando por trabajador,
    // en vez de filtrar la lista completa por cada usuario (antes: semanas × usuarios × ventas).
    type Ag = { vendido: number; vendidoDomingo: number; validadas: number; ops: number; porDia: Map<string, number> };
    const nuevoAg = (): Ag => ({ vendido: 0, vendidoDomingo: 0, validadas: 0, ops: 0, porDia: new Map() });
    const porCaller = new Map<string, Ag>();
    const porProcesador = new Map<string, Ag>();
    const genPorSpamer = new Map<string, Ag>();   // ventas generadas por la data de cada spamer
    const subidasPorSpamer = new Map<string, number>();
    for (const l of lSem) if (l.cargadoPorId) subidasPorSpamer.set(l.cargadoPorId, (subidasPorSpamer.get(l.cargadoPorId) ?? 0) + 1);
    for (const v of vSem) {
      const monto = v.monto ?? 0;
      if (v.callerId) {
        const a = porCaller.get(v.callerId) ?? nuevoAg(); porCaller.set(v.callerId, a);
        a.vendido += monto; a.ops += 1;
        if (esDomingo(v.creadoEn)) a.vendidoDomingo += monto; // base para el 5% extra del domingo
        if (v.validada) { a.validadas += 1; const dd = diaDe(v.creadoEn); a.porDia.set(dd, (a.porDia.get(dd) ?? 0) + 1); }
      }
      if (v.procesadorId) {
        const a = porProcesador.get(v.procesadorId) ?? nuevoAg(); porProcesador.set(v.procesadorId, a);
        a.vendido += monto; a.ops += 1; if (v.validada) a.validadas += 1;
      }
      const sp = v.lead?.cargadoPorId;
      if (sp) {
        const a = genPorSpamer.get(sp) ?? nuevoAg(); genPorSpamer.set(sp, a);
        a.vendido += monto; a.ops += 1; if (v.validada) a.validadas += 1;
      }
    }
    // Para encargados: agrupo por equipo (una venta suma si el caller o el spamer es de su equipo).
    const porEncargado = new Map<string, Ag>();
    for (const v of vSem) {
      for (const u of usuarios) {
        if (u.rol !== "ENCARGADO") continue;
        const eq = equipoDe(u.id);
        if (eq.has(v.callerId) || (v.lead?.cargadoPorId && eq.has(v.lead.cargadoPorId))) {
          const a = porEncargado.get(u.id) ?? nuevoAg(); porEncargado.set(u.id, a);
          a.vendido += (v.monto ?? 0); a.ops += 1; if (v.validada) a.validadas += 1;
        }
      }
    }

    for (const u of usuarios) {
      if (u.rol === "CALLER") {
        const a = porCaller.get(u.id); if (!a) continue;
        const desglose = [...a.porDia.entries()].sort((x, y) => y[0].localeCompare(x[0]))
          .map(([dia, validadas]) => ({ dia, validadas, paga: validadas > 0 }));
        diasCaller.set(u.id, [...(diasCaller.get(u.id) ?? []), ...desglose]);
        sumar(u.id, "comision", a.vendido * (callerCampeones?.has(u.id) ? PRIMERO : BASE), a.ops, a.validadas);
        sumar(u.id, "fijo", a.validadas * POR_VALIDADA);
        sumar(u.id, "bono", bonoDe("CALLER", a.ops));
        // Incentivo domingo: 5% EXTRA sobre lo vendido el domingo (solo caller; no afecta al encargado).
        sumar(u.id, "incentivo", a.vendidoDomingo * INCENTIVO_DOMINGO);
      } else if (u.rol === "CARGADOR") {
        const subidas = subidasPorSpamer.get(u.id) ?? 0;
        const g = genPorSpamer.get(u.id);
        if (!subidas && !g) continue;
        sumar(u.id, "comision", (g?.vendido ?? 0) * BASE, subidas, g?.validadas ?? 0);
        sumar(u.id, "fijo", (g?.validadas ?? 0) * POR_VALIDADA);
        sumar(u.id, "bono", bonoDe("CARGADOR", subidas));
      } else if (u.rol === "PROCESADOR") {
        const a = porProcesador.get(u.id); if (!a) continue;
        sumar(u.id, "comision", a.vendido * PROCESADOR, a.ops, a.validadas);
      } else if (u.rol === "ENCARGADO") {
        const a = porEncargado.get(u.id); if (!a) continue;
        sumar(u.id, "comision", a.vendido * ENCARGADO, a.ops, a.validadas);
      }
    }
  }

  // Tasa que le corresponde a cada rol sobre el monto de una venta.
  const ventaFila = (v: any, tasa: number) => ({
    fecha: v.creadoEn, cliente: v.lead?.nombre ?? "—", dni: v.lead?.dni ?? "",
    telefono: v.lead?.telefono ?? "", caller: v.caller?.nombre ?? "—",
    spamer: v.lead?.cargadoPor?.nombre ?? "—", monto: v.monto ?? 0,
    validada: v.validada, tuParte: (v.monto ?? 0) * tasa,
  });

  const detalleDe = (u: any) => {
    if (u.rol === "CALLER")
      return ventas.filter((v) => v.callerId === u.id).map((v) => ventaFila(v, PRIMERO)); // tasa referencial; el total real ya está en comision
    if (u.rol === "CARGADOR")
      return ventas.filter((v) => v.lead?.cargadoPorId === u.id).map((v) => ventaFila(v, BASE));
    if (u.rol === "PROCESADOR")
      return ventas.filter((v) => v.procesadorId === u.id).map((v) => ventaFila(v, PROCESADOR));
    if (u.rol === "ENCARGADO") {
      const eq = equipoDe(u.id);
      return ventas.filter((v) => eq.has(v.callerId) || (v.lead?.cargadoPorId && eq.has(v.lead.cargadoPorId))).map((v) => ventaFila(v, ENCARGADO));
    }
    return [];
  };

  const filas = usuarios
    .filter((u) => u.rol !== "ADMIN")
    .map((u) => {
      const r = resumen.get(u.id) ?? { comision: 0, fijo: 0, bono: 0, incentivo: 0, operaciones: 0, validadas: 0 };
      const ganado = r.comision + r.fijo + r.bono + r.incentivo;
      const pagado = pagos.filter((p) => p.usuarioId === u.id).reduce((n, p) => n + p.monto, 0);
      const equipo = u.rol === "ENCARGADO" ? usuarios.filter((x) => x.encargadoId === u.id).map((x) => ({ nombre: x.nombre, rol: x.rol })) : [];
      return {
        id: u.id, nombre: u.nombre, usuario: u.usuario, rol: u.rol, activo: u.activo,
        ...r, ganado, pagado, saldo: ganado - pagado,
        ultimoPago: pagos.find((p) => p.usuarioId === u.id)?.creadoEn ?? null,
        detalle: detalleDe(u), equipo,
        diasFijo: diasCaller.get(u.id) ?? [],
        minVentasDia: MIN_VENTAS_DIA,
        semanas: [...(porSemana.get(u.id) ?? new Map())].map(([semana, ganado]) => ({ semana, ganado })).sort((a, b) => b.semana.localeCompare(a.semana)),
      };
    })
    .filter((f) => f.ganado > 0 || f.pagado > 0)
    .sort((a, b) => b.saldo - a.saldo);

  // Historial semanal: por cada semana (lunes), todos los que ganaron algo esa semana.
  const nombrePorId = new Map(usuarios.map((u) => [u.id, { nombre: u.nombre, rol: u.rol }]));
  const semanasSet = new Set<string>();
  porSemana.forEach((m) => m.forEach((_v, sem) => semanasSet.add(sem)));
  const historialSemanal = [...semanasSet].sort((a, b) => b.localeCompare(a)).map((sem) => {
    const trabajadores = [...porSemana.entries()]
      .map(([id, m]) => ({ id, ganado: m.get(sem) ?? 0 }))
      .filter((x) => x.ganado > 0)
      .map((x) => ({ nombre: nombrePorId.get(x.id)?.nombre ?? "—", rol: nombrePorId.get(x.id)?.rol ?? "", ganado: x.ganado }))
      .sort((a, b) => b.ganado - a.ganado);
    return { semana: sem, total: trabajadores.reduce((n, t) => n + t.ganado, 0), trabajadores };
  });

  return { filas, ventas, pagos, usuarios, historialSemanal };
}
