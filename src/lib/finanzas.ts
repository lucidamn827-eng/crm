import { db } from "./db";
import { METAS, bonoDe } from "./semana";

export const BASE = 0.10;
export const PRIMERO = 0.12;
export const PROCESADOR = 0.10;
export const ENCARGADO = 0.10;
export const POR_VALIDADA = 10;   // soles por venta validada (caller y spamer)
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
                lead: { select: { cargadoPorId: true } } },
    }),
    db.lead.findMany({ select: { cargadoPorId: true, creadoEn: true } }),
    db.pago.findMany({ orderBy: { creadoEn: "desc" } }),
  ]);

  const semanas = [...new Set([...ventas.map((v) => semanaDe(v.creadoEn)), ...leads.map((l) => semanaDe(l.creadoEn))])].sort();

  // Campeones de cada semana: definen quién cobra 12% la semana siguiente.
  const campeon = (ids: string[]) => {
    const c = new Map<string, number>();
    ids.forEach((id) => id && c.set(id, (c.get(id) ?? 0) + 1));
    return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };
  const campeonCaller = new Map<string, string | null>();
  const campeonSpamer = new Map<string, string | null>();
  semanas.forEach((sem) => {
    campeonCaller.set(sem, campeon(ventas.filter((v) => semanaDe(v.creadoEn) === sem).map((v) => v.callerId)));
    campeonSpamer.set(sem, campeon(leads.filter((l) => semanaDe(l.creadoEn) === sem).map((l) => l.cargadoPorId!)));
  });
  const anterior = (sem: string) => semanas[semanas.indexOf(sem) - 1] ?? null;

  const resumen = new Map<string, { comision: number; fijo: number; bono: number; operaciones: number; validadas: number }>();
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
    const callerCampeon = prev ? campeonCaller.get(prev) : null;
    const spamerCampeon = prev ? campeonSpamer.get(prev) : null;

    for (const u of usuarios) {
      if (u.rol === "CALLER") {
        const mias = vSem.filter((v) => v.callerId === u.id);
        if (!mias.length) continue;
        const vendido = mias.reduce((n, v) => n + (v.monto ?? 0), 0);
        const validadas = mias.filter((v) => v.validada).length;
        sumar(u.id, "comision", vendido * (callerCampeon === u.id ? PRIMERO : BASE), mias.length, validadas);
        sumar(u.id, "fijo", validadas * POR_VALIDADA);
        sumar(u.id, "bono", bonoDe("CALLER", mias.length));
      } else if (u.rol === "CARGADOR") {
        const subidas = lSem.filter((l) => l.cargadoPorId === u.id).length;
        const generadas = vSem.filter((v) => v.lead?.cargadoPorId === u.id);
        if (!subidas && !generadas.length) continue;
        const base = generadas.reduce((n, v) => n + (v.monto ?? 0), 0);
        const validadas = generadas.filter((v) => v.validada).length;
        sumar(u.id, "comision", base * (spamerCampeon === u.id ? PRIMERO : BASE), subidas, validadas);
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

  const filas = usuarios
    .filter((u) => u.rol !== "ADMIN")
    .map((u) => {
      const r = resumen.get(u.id) ?? { comision: 0, fijo: 0, bono: 0, operaciones: 0, validadas: 0 };
      const ganado = r.comision + r.fijo + r.bono;
      const pagado = pagos.filter((p) => p.usuarioId === u.id).reduce((n, p) => n + p.monto, 0);
      return {
        id: u.id, nombre: u.nombre, usuario: u.usuario, rol: u.rol, activo: u.activo,
        ...r, ganado, pagado, saldo: ganado - pagado,
        ultimoPago: pagos.find((p) => p.usuarioId === u.id)?.creadoEn ?? null,
      };
    })
    .filter((f) => f.ganado > 0 || f.pagado > 0)
    .sort((a, b) => b.saldo - a.saldo);

  return { filas, ventas, pagos, usuarios };
}
