/** Semana operativa: de lunes 00:00 a domingo 23:59, en la zona de la operación. */
const zona = () => process.env.TZ_OPERACION ?? "America/Lima";

export function lunesDeEstaSemana(): Date {
  const ahora = new Date();
  const local = new Date(ahora.toLocaleString("en-US", { timeZone: zona() }));
  const dia = local.getDay();               // 0 = domingo
  local.setDate(local.getDate() - (dia === 0 ? 6 : dia - 1));
  local.setHours(0, 0, 0, 0);
  const desfase =
    new Date(ahora.toLocaleString("en-US", { timeZone: "UTC" })).getTime() -
    new Date(ahora.toLocaleString("en-US", { timeZone: zona() })).getTime();
  return new Date(local.getTime() + desfase);
}

/** Escalones de "El cielo es el límite". El bono no se acumula: vale el más alto. */
export const METAS = {
  CALLER: [
    { meta: 30, bono: 50 },
    { meta: 40, bono: 100 },
    { meta: 50, bono: 150 },
    { meta: 60, bono: 200 },
    { meta: 90, bono: 400 },
  ],
  CARGADOR: [
    { meta: 150, bono: 50 },
    { meta: 200, bono: 100 },
    { meta: 300, bono: 150 },
    { meta: 450, bono: 250 },
  ],
} as const;

export const bonoDe = (rol: "CALLER" | "CARGADOR", puntos: number) =>
  [...METAS[rol]].reverse().find((m) => puntos >= m.meta)?.bono ?? 0;

export const siguienteMeta = (rol: "CALLER" | "CARGADOR", puntos: number) =>
  METAS[rol].find((m) => puntos < m.meta) ?? null;
