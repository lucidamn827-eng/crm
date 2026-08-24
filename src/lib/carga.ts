import { db } from "@/lib/db";

export const LIMITE_DIARIO = 20;

const zona = () => process.env.TZ_OPERACION ?? "America/Lima";

/** Día actual "YYYY-MM-DD" en hora de la operación (Perú). */
export function diaHoy(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zona(), year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** Rango UTC [inicio, fin) que cubre el día de Perú, para contar leads por creadoEn. */
export function rangoDelDia(dia = diaHoy()): { desde: Date; hasta: Date } {
  // Perú es UTC-5 todo el año (sin horario de verano).
  const desde = new Date(`${dia}T00:00:00-05:00`);
  const hasta = new Date(desde.getTime() + 86400000);
  return { desde, hasta };
}

/** Cuánta data se le subió HOY a un caller (sumando todos los spamers). */
export async function dataDeHoy(callerId: string, dia = diaHoy()): Promise<number> {
  const { desde, hasta } = rangoDelDia(dia);
  return db.lead.count({ where: { asignadoAId: callerId, creadoEn: { gte: desde, lt: hasta } } });
}

/** El tope vigente de un caller hoy: el especial del admin, o el general (20). */
export async function topeDe(callerId: string, dia = diaHoy()): Promise<number> {
  const especial = await db.topeCarga.findUnique({ where: { callerId_dia: { callerId, dia } } });
  return especial?.tope ?? LIMITE_DIARIO;
}

/** Resumen por caller: cuánto lleva hoy y cuál es su tope. */
export async function resumenCarga(dia = diaHoy()) {
  const { desde, hasta } = rangoDelDia(dia);
  const [callers, leadsHoy, topes] = await Promise.all([
    db.usuario.findMany({ where: { rol: "CALLER", activo: true }, select: { id: true, nombre: true } }),
    db.lead.groupBy({ by: ["asignadoAId"], where: { creadoEn: { gte: desde, lt: hasta } }, _count: true }),
    db.topeCarga.findMany({ where: { dia } }),
  ]);
  return callers.map((c) => {
    const hoy = leadsHoy.find((l) => l.asignadoAId === c.id)?._count ?? 0;
    const tope = topes.find((t) => t.callerId === c.id)?.tope ?? LIMITE_DIARIO;
    return { id: c.id, nombre: c.nombre, hoy, tope, lleno: hoy >= tope };
  });
}
