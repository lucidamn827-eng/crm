import { db } from "@/lib/db";

export const MAX_INTENTOS = 3;        // un "no contestó" se intenta hasta 3 veces
export const LAPSO_REINTENTO_MIN = 120; // 2 h de descanso antes de volver al pool
export const POSPONER_MIN = 5;        // al dar "Aún no", el contacto no reaparece por este rato
const RESERVA_VENCE_MIN = 20;         // una reserva abandonada (caller desconectado) vuelve al pool tras esto

/** Inicio del día de hoy en hora de Perú (UTC-5), como instante. */
function inicioDiaLima(): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return new Date(`${ymd}T00:00:00-05:00`);
}

/** Cuántas fichas hay disponibles en el pool para llamar ahora. */
export async function contarDisponibles(ahora = new Date()): Promise<number> {
  // Ventana de repaso: hoy + ayer (2 días máximo).
  const ventana = new Date(inicioDiaLima().getTime() - 86400000);
  const [nuevas, reintentos] = await Promise.all([
    db.lead.count({ where: { estado: "PENDIENTE", asignadoAId: null, archivadoEn: null, OR: [{ reactivaEn: null }, { reactivaEn: { lte: ahora } }] } }),
    // "No contestó" se repasa hasta 2 días: su último intento (reactivaEn) tiene que caer en hoy o ayer.
    db.lead.count({ where: { estado: "NO_CONTESTO", asignadoAId: null, archivadoEn: null, intentos: { lt: MAX_INTENTOS }, reactivaEn: { gte: ventana, lte: ahora } } }),
  ]);
  return nuevas + reintentos;
}

/** Estado de la cola del caller: su ficha actual (si tiene) y cuánto hay disponible. */
export async function estadoColaCaller(callerId: string) {
  const ahora = new Date();
  const [disponibles, mia] = await Promise.all([
    contarDisponibles(ahora),
    db.lead.findFirst({
      where: { asignadoAId: callerId, archivadoEn: null, OR: [{ reservadoEn: { not: null } }, { enLlamadaDesde: { not: null } }] },
      select: { id: true, reservadoEn: true, enLlamadaDesde: true },
    }),
  ]);
  return { disponibles, enLlamada: !!mia?.enLlamadaDesde, reservada: !!mia && !mia.enLlamadaDesde };
}

/**
 * Reserva atómica del siguiente contacto para un caller.
 * PRIORIDAD: primero los "no contestó" de hoy que ya cumplieron sus 2 h (sí o sí, antes
 * que la data nueva); si no hay, la data nueva más antigua.
 * Devuelve el id reservado, o null si no hay nada.
 */
export async function reservarSiguiente(callerId: string): Promise<number | null> {
  // Si ya tiene una ficha reservada o en llamada, devolvé esa (no repartas otra).
  const yaTiene = await db.lead.findFirst({
    where: { asignadoAId: callerId, archivadoEn: null, OR: [{ reservadoEn: { not: null } }, { enLlamadaDesde: { not: null } }] },
    select: { id: true },
  });
  if (yaTiene) return yaTiene.id;

  // 1) PRIORIDAD: un "no contestó" que ya cumplió sus 2 h (< 3 intentos), AL AZAR.
  //    Se llama sí o sí antes que la data nueva. Se repasa hasta 2 días (hoy o ayer, hora Perú).
  const reintento = await reservarUna(callerId,
    `SELECT id FROM "Lead"
      WHERE estado = 'NO_CONTESTO' AND "asignadoAId" IS NULL AND "archivadoEn" IS NULL
        AND intentos < ${MAX_INTENTOS}
        AND "reactivaEn" IS NOT NULL AND "reactivaEn" <= now()
        AND "reactivaEn" >= ((date_trunc('day', now() AT TIME ZONE 'America/Lima') - interval '1 day') AT TIME ZONE 'America/Lima')
      ORDER BY random()
      LIMIT 1 FOR UPDATE SKIP LOCKED`);
  if (reintento) return reintento;

  // 2) Data NUEVA, la más antigua primero (saltando las pospuestas con "Aún no").
  return reservarUna(callerId,
    `SELECT id FROM "Lead"
      WHERE estado = 'PENDIENTE' AND "asignadoAId" IS NULL AND "archivadoEn" IS NULL
        AND ("reactivaEn" IS NULL OR "reactivaEn" <= now())
      ORDER BY "creadoEn" ASC
      LIMIT 1 FOR UPDATE SKIP LOCKED`);
}

/** UPDATE ... WHERE id = (subconsulta con FOR UPDATE SKIP LOCKED): reserva sin choques. */
async function reservarUna(callerId: string, selectSql: string): Promise<number | null> {
  const filas = await db.$queryRawUnsafe<{ id: number }[]>(
    `UPDATE "Lead" SET "asignadoAId" = $1, "reservadoEn" = now()
      WHERE id = (${selectSql})
      RETURNING id`,
    callerId
  );
  return filas.length ? Number(filas[0].id) : null;
}

/** Libera reservas viejas sin llamar (el caller se desconectó o no actuó): vuelven al pool. */
export async function liberarReservasViejas(): Promise<number> {
  const limite = new Date(Date.now() - RESERVA_VENCE_MIN * 60000);
  const r = await db.lead.updateMany({
    where: { reservadoEn: { not: null, lt: limite }, enLlamadaDesde: null },
    data: { asignadoAId: null, reservadoEn: null },
  });
  return r.count;
}
