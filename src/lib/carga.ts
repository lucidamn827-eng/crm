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
  // Ventana de repaso: hoy + ayer (máximo 1 día anterior).
  const ventana = new Date(rangoDelDia().desde.getTime() - 86400000);
  const repaso = { ...base, estado: "NO_CONTESTO", asignadoAId: null, reactivaEn: { gte: ventana } } as any;
  const [sinLlamar, noContesto, noQuiso, repaso1, repaso2, fueraRepaso] = await Promise.all([
    db.lead.count({ where: { ...base, estado: "PENDIENTE", asignadoAId: null } }),
    db.lead.count({ where: { ...base, estado: "NO_CONTESTO" } }),
    db.lead.count({ where: { ...base, estado: "NO_QUISO" } }),
    db.lead.count({ where: { ...repaso, intentos: 1 } }),
    db.lead.count({ where: { ...repaso, intentos: 2 } }),
    // "No contestó" guardados fuera de rotación (3 intentos o más de 1 día): se recuperan con el buscador.
    db.lead.count({ where: { ...base, estado: "NO_CONTESTO", OR: [{ intentos: { gte: 3 } }, { reactivaEn: null }, { reactivaEn: { lt: ventana } }] } }),
  ]);
  return { sinLlamar, noContesto, noQuiso, total: sinLlamar + noContesto, repaso1, repaso2, repasoTotal: repaso1 + repaso2, fueraRepaso };
}

/** Prioridad de la cola: "reposada" (repaso primero) o "nueva" (data nueva primero). */
export async function getPrioridadCola(): Promise<"reposada" | "nueva"> {
  const c = await db.config.findUnique({ where: { clave: "prioridad_cola" } });
  return c?.valor === "nueva" ? "nueva" : "reposada";
}
export async function setPrioridadCola(v: "reposada" | "nueva") {
  await db.config.upsert({ where: { clave: "prioridad_cola" }, update: { valor: v }, create: { clave: "prioridad_cola", valor: v } });
}
