import { db } from "@/lib/db";

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

/* ===================================================================
   SUBIDA DE DATA: ahora el tope es POR SPAMER (cuánto puede subir al día).
   Lo fija el admin y persiste (Usuario.topeCargaDiaria). null = sin tope.
   =================================================================== */

/** Cuánta data SUBIÓ hoy un spamer (por cargadoPorId). */
export async function dataSubidaHoy(spamerId: string, dia = diaHoy()): Promise<number> {
  const { desde, hasta } = rangoDelDia(dia);
  return db.lead.count({ where: { cargadoPorId: spamerId, creadoEn: { gte: desde, lt: hasta } } });
}

/** Tope de subida de un spamer (persistente). null = sin tope. */
export async function topeSubidaDe(spamerId: string): Promise<number | null> {
  const u = await db.usuario.findUnique({ where: { id: spamerId }, select: { topeCargaDiaria: true } });
  return u?.topeCargaDiaria ?? null;
}

/** Resumen por spamer: cuánto subió hoy y su tope (para supervisión y para el propio spamer). */
export async function resumenSubida(dia = diaHoy()) {
  const { desde, hasta } = rangoDelDia(dia);
  const [spamers, hoy] = await Promise.all([
    db.usuario.findMany({ where: { rol: "CARGADOR", activo: true }, select: { id: true, nombre: true, topeCargaDiaria: true } }),
    db.lead.groupBy({ by: ["cargadoPorId"], where: { creadoEn: { gte: desde, lt: hasta } }, _count: true }),
  ]);
  return spamers.map((s) => {
    const subidas = hoy.find((h) => h.cargadoPorId === s.id)?._count ?? 0;
    const tope = s.topeCargaDiaria ?? null;
    return {
      id: s.id, nombre: s.nombre, hoy: subidas, tope,
      lleno: tope !== null && subidas >= tope,
      faltan: tope !== null ? Math.max(0, tope - subidas) : null,
    };
  });
}

/** Conteos del POOL de data (solo lo que todavía no cerró): para el panel del admin. */
export async function resumenPool() {
  const base = { archivadoEn: null } as any;
  const [sinLlamar, noContesto, noQuiso] = await Promise.all([
    db.lead.count({ where: { ...base, estado: "PENDIENTE" } }),
    db.lead.count({ where: { ...base, estado: "NO_CONTESTO" } }),
    db.lead.count({ where: { ...base, estado: "NO_QUISO" } }),
  ]);
  return { sinLlamar, noContesto, noQuiso, total: sinLlamar + noContesto };
}
