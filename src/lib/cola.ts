import { db } from "@/lib/db";

export const MAX_INTENTOS = 3;        // un "no contestó" se intenta hasta 3 veces
export const LAPSO_REINTENTO_MIN = 120; // 2 h de descanso antes de volver al pool
export const POSPONER_MIN = 5;        // al dar "Aún no", el contacto no reaparece por este rato
const RESERVA_VENCE_MIN = 20;         // una reserva abandonada (caller desconectado) vuelve al pool tras esto

/** Cuántas fichas hay disponibles en el pool para llamar ahora. */
export async function contarDisponibles(ahora = new Date()): Promise<number> {
  const [nuevas, reintentos] = await Promise.all([
    db.lead.count({ where: { estado: "PENDIENTE", asignadoAId: null, archivadoEn: null, OR: [{ reactivaEn: null }, { reactivaEn: { lte: ahora } }] } }),
    db.lead.count({ where: { estado: "NO_CONTESTO", asignadoAId: null, archivadoEn: null, intentos: { lt: MAX_INTENTOS }, reactivaEn: { lte: ahora } } }),
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
 * Prioridad: data nueva, la más antigua primero; si no hay, un "no contestó" vencido al azar.
 * Devuelve el id reservado, o null si no hay nada.
 */
export async function reservarSiguiente(callerId: string): Promise<number | null> {
  // Si ya tiene una ficha reservada o en llamada, devolvé esa (no repartas otra).
  const yaTiene = await db.lead.findFirst({
    where: { asignadoAId: callerId, archivadoEn: null, OR: [{ reservadoEn: { not: null } }, { enLlamadaDesde: { not: null } }] },
    select: { id: true },
  });
  if (yaTiene) return yaTiene.id;

  // 1) Data NUEVA, la más antigua primero (saltando las pospuestas con "Aún no").
  const nueva = await reservarUna(callerId,
    `SELECT id FROM "Lead"
      WHERE estado = 'PENDIENTE' AND "asignadoAId" IS NULL AND "archivadoEn" IS NULL
        AND ("reactivaEn" IS NULL OR "reactivaEn" <= now())
      ORDER BY "creadoEn" ASC
      LIMIT 1 FOR UPDATE SKIP LOCKED`);
  if (nueva) return nueva;

  // 2) Un "no contestó" vencido (pasó el lapso, < 3 intentos), AL AZAR.
  return reservarUna(callerId,
    `SELECT id FROM "Lead"
      WHERE estado = 'NO_CONTESTO' AND "asignadoAId" IS NULL AND "archivadoEn" IS NULL
        AND intentos < ${MAX_INTENTOS} AND "reactivaEn" IS NOT NULL AND "reactivaEn" <= now()
      ORDER BY random()
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
