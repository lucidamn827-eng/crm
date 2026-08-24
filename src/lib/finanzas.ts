import { db } from "./db";
import { METAS, bonoDe } from "./semana";

export const BASE = 0.10;
export const PRIMERO = 0.12;
export const PROCESADOR = 0.10;
export const ENCARGADO = 0.10;
export const POR_VALIDADA = 10;   // soles por venta validada (caller y spamer)
export const MIN_VENTAS_DIA = 5;  // el caller necesita 5+ ventas validadas EN EL DÍA para cobrar sus S/10 de ese día
export const INVERSION = 0.20;    // 20% de inversión inicial sobre lo vendido

const zona = () => process.env.TZ_OPERACION ?? "America/Lima";
export const diaDe = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: zona() }).format(d);

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
export async function devengado() {
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

  const semanas = [...new Set([...ventas.map((v) => semanaDe(v.creadoEn)), ...leads.map((l) => semanaDe(l.creadoEn))])].sort();

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
  const campeonSpamer = new Map<string, Set<string>>();
  semanas.forEach((sem) => {
    campeonCaller.set(sem, campeonPorEquipo(ventas.filter((v) => semanaDe(v.creadoEn) === sem).map((v) => v.callerId), "CALLER"));
    campeonSpamer.set(sem, campeonPorEquipo(leads.filter((l) => semanaDe(l.creadoEn) === sem).map((l) => l.cargadoPorId!), "CARGADOR"));
  });
  const anterior = (sem: string) => semanas[semanas.indexOf(sem) - 1] ?? null;

  const resumen = new Map<string, { comision: number; fijo: number; bono: number; operaciones: number; validadas: number }>();
  // Desglose por día del caller: cuántas validó y si ese día llegó al mínimo de 5.
  const diasCaller = new Map<string, { dia: string; validadas: number; paga: boolean }[]>();
  const sumar = (id: string | null | undefined, campo: "comision" | "fijo" | "bono", valor: number, ops = 0, val = 0) => {
    if (!id || !valor && !ops && !val) return;
    const r = resumen.get(id) ?? { comision: 0, fijo: 0, bono: 0, operaciones: 0, validadas: 0 };
    r[campo] += valor; r.operaciones += ops; r.validadas += val;
    resumen.set(id, r);
  };

  for (const sem of semanas) {
    const vSem = ventas.filter((v) => semanaDe(v.creadoEn) === sem);
    const lSem = leads.filter((l) => semanaDe(l.creadoEn) === sem);
    const prev = anterior(sem);
    const callerCampeones = prev ? campeonCaller.get(prev) : null;
    const spamerCampeones = prev ? campeonSpamer.get(prev) : null;

    // Cuenta las validadas del caller SOLO en los días que llegaron a MIN_VENTAS_DIA.
    // Los S/10 se pagan por esas; los días con menos de 5 no pagan fijo.
    const validadasQuePagan = (ventas: any[]) => {
      const porDia = new Map<string, number>();
      ventas.filter((v) => v.validada).forEach((v) => {
        const d = diaDe(v.creadoEn);
        porDia.set(d, (porDia.get(d) ?? 0) + 1);
      });
      let pagan = 0;
      porDia.forEach((n) => { if (n >= MIN_VENTAS_DIA) pagan += n; });
      return pagan;
    };

    for (const u of usuarios) {
      if (u.rol === "CALLER") {
        const mias = vSem.filter((v) => v.callerId === u.id);
        if (!mias.length) continue;
        const vendido = mias.reduce((n, v) => n + (v.monto ?? 0), 0);
        const validadas = mias.filter((v) => v.validada).length;
        const fijoValidadas = validadasQuePagan(mias); // solo días con 5+
        // Guardo el detalle por día para mostrárselo en el pre-pago.
        const porDiaCaller = new Map<string, number>();
        mias.filter((v) => v.validada).forEach((v) => {
          const dd = diaDe(v.creadoEn); porDiaCaller.set(dd, (porDiaCaller.get(dd) ?? 0) + 1);
        });
        const desglose = [...porDiaCaller.entries()].sort((a, b) => b[0].localeCompare(a[0]))
          .map(([dia, validadas]) => ({ dia, validadas, paga: validadas >= MIN_VENTAS_DIA }));
        diasCaller.set(u.id, [...(diasCaller.get(u.id) ?? []), ...desglose]);
        sumar(u.id, "comision", vendido * (callerCampeones?.has(u.id) ? PRIMERO : BASE), mias.length, validadas);
        sumar(u.id, "fijo", fijoValidadas * POR_VALIDADA);
        sumar(u.id, "bono", bonoDe("CALLER", mias.length));
      } else if (u.rol === "CARGADOR") {
        const subidas = lSem.filter((l) => l.cargadoPorId === u.id).length;
        const generadas = vSem.filter((v) => v.lead?.cargadoPorId === u.id);
        if (!subidas && !generadas.length) continue;
        const base = generadas.reduce((n, v) => n + (v.monto ?? 0), 0);
        const validadas = generadas.filter((v) => v.validada).length;
        sumar(u.id, "comision", base * (spamerCampeones?.has(u.id) ? PRIMERO : BASE), subidas, validadas);
        sumar(u.id, "fijo", validadas * POR_VALIDADA);
        sumar(u.id, "bono", bonoDe("CARGADOR", subidas));
      } else if (u.rol === "PROCESADOR") {
        const mias = vSem.filter((v) => v.procesadorId === u.id);
        if (!mias.length) continue;
        sumar(u.id, "comision", mias.reduce((n, v) => n + (v.monto ?? 0), 0) * PROCESADOR, mias.length,
              mias.filter((v) => v.validada).length);
      } else if (u.rol === "ENCARGADO") {
        const equipo = new Set(usuarios.filter((x) => x.encargadoId === u.id).map((x) => x.id));
        const mias = vSem.filter((v) => equipo.has(v.callerId) || (v.lead?.cargadoPorId && equipo.has(v.lead.cargadoPorId)));
        if (!mias.length) continue;
        sumar(u.id, "comision", mias.reduce((n, v) => n + (v.monto ?? 0), 0) * ENCARGADO, mias.length,
              mias.filter((v) => v.validada).length);
      }
    }
  }

  // Tasa que le corresponde a cada rol sobre el monto de una venta.
  const equipoDe = (id: string) => new Set(usuarios.filter((x) => x.encargadoId === id).map((x) => x.id));
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
      const r = resumen.get(u.id) ?? { comision: 0, fijo: 0, bono: 0, operaciones: 0, validadas: 0 };
      const ganado = r.comision + r.fijo + r.bono;
      const pagado = pagos.filter((p) => p.usuarioId === u.id).reduce((n, p) => n + p.monto, 0);
      const equipo = u.rol === "ENCARGADO" ? usuarios.filter((x) => x.encargadoId === u.id).map((x) => ({ nombre: x.nombre, rol: x.rol })) : [];
      return {
        id: u.id, nombre: u.nombre, usuario: u.usuario, rol: u.rol, activo: u.activo,
        ...r, ganado, pagado, saldo: ganado - pagado,
        ultimoPago: pagos.find((p) => p.usuarioId === u.id)?.creadoEn ?? null,
        detalle: detalleDe(u), equipo,
        diasFijo: diasCaller.get(u.id) ?? [],
        minVentasDia: MIN_VENTAS_DIA,
      };
    })
    .filter((f) => f.ganado > 0 || f.pagado > 0)
    .sort((a, b) => b.saldo - a.saldo);

  return { filas, ventas, pagos, usuarios };
}
