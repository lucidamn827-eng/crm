import { db } from "./db";
import type { Sesion } from "./auth";

/**
 * Bitácora. Todo lo que hace un caller queda acá, lo quiera o no:
 * cuándo entró, qué ficha abrió, cuánto tardó, qué descartó sin llamar.
 */
export async function registrar(
  s: Sesion | { id: string },
  tipo: string,
  extra: { leadId?: number; detalle?: string; segundos?: number; ip?: string } = {}
) {
  try {
    await db.evento.create({ data: { usuarioId: s.id, tipo, ...extra } });
  } catch { /* la bitácora nunca debe romper la operación */ }
}

export const ipDe = (req: Request) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
