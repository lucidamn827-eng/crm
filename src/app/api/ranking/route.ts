import { db } from "@/lib/db";
import { exigir } from "@/lib/auth";

const zona = () => process.env.TZ_OPERACION ?? "America/Lima";
const MIN_EQUIPO = 3; // el ranking (y el 12%) solo se activa con 3 o más en el equipo

function lunesDeEstaSemana(): Date {
  const ahora = new Date();
  const local = new Date(ahora.toLocaleString("en-US", { timeZone: zona() }));
  const dia = local.getDay();
  local.setDate(local.getDate() - (dia === 0 ? 6 : dia - 1));
  local.setHours(0, 0, 0, 0);
  const desfase = new Date(ahora.toLocaleString("en-US", { timeZone: "UTC" })).getTime() - new Date(ahora.toLocaleString("en-US", { timeZone: zona() })).getTime();
  return new Date(local.getTime() + desfase);
}

/**
 * Ranking por equipo (encargado). Cada persona compite solo contra su propio
 * equipo, y el podio se activa únicamente si el equipo tiene 3+ de su rol.
 * El admin ve todos los equipos; los demás ven el suyo.
 */
export async function GET() {
  try {
    const s = await exigir("ADMIN", "CARGADOR", "CALLER", "ENCARGADO", "PROCESADOR");
    const desde = lunesDeEstaSemana();
    const inicioAnterior = new Date(desde); inicioAnterior.setDate(inicioAnterior.getDate() - 7);

    const [usuarios, llamadas, leads, llamadasPrev, leadsPrev] = await Promise.all([
      db.usuario.findMany({ where: { activo: true }, select: { id: true, nombre: true, rol: true, encargadoId: true } }),
      db.llamada.findMany({ where: { creadoEn: { gte: desde }, resultado: "ACEPTO", anulada: false }, select: { callerId: true } }),
      db.lead.findMany({ where: { creadoEn: { gte: desde } }, select: { cargadoPorId: true, estado: true } }),
      db.llamada.findMany({ where: { creadoEn: { gte: inicioAnterior, lt: desde }, resultado: "ACEPTO", anulada: false }, select: { callerId: true } }),
      db.lead.findMany({ where: { creadoEn: { gte: inicioAnterior, lt: desde } }, select: { cargadoPorId: true } }),
    ]);

    // ¿A qué equipo pertenece cada quien? El encargado lidera su propio grupo.
    const equipoDe = (u: { id: string; rol: string; encargadoId: string | null }) =>
      u.rol === "ENCARGADO" ? u.id : (u.encargadoId ?? "sin-equipo");

    const cuentaAceptados = (id: string) => llamadas.filter((l) => l.callerId === id).length;
    const cuentaData = (id: string) => leads.filter((l) => l.cargadoPorId === id).length;

    // Arma el podio de un rol dentro de un conjunto de usuarios.
    const armarPodio = (miembros: any[], rol: string, puntosDe: (id: string) => number, extra?: (id: string) => any) =>
      miembros.filter((u) => u.rol === rol)
        .map((u) => ({ id: u.id, nombre: u.nombre, puntos: puntosDe(u.id), ...(extra ? extra(u.id) : {}) }))
        .sort((a, b) => b.puntos - a.puntos);

    // Ganador de la semana pasada dentro de un conjunto (define el 12% de esta semana).
    const ganadorPrev = (ids: string[], miembrosIds: Set<string>) => {
      const c = new Map<string, number>();
      ids.filter((id) => miembrosIds.has(id)).forEach((id) => c.set(id, (c.get(id) ?? 0) + 1));
      const top = [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
      return top.map(([id, puntos]) => {
        const u = usuarios.find((x) => x.id === id);
        return u ? { id, nombre: u.nombre, puntos } : null;
      }).filter(Boolean);
    };

    // Junta a la gente por equipo.
    const equipos = new Map<string, any[]>();
    usuarios.forEach((u) => {
      if (u.rol === "ADMIN" || u.rol === "PROCESADOR") return;
      const eq = equipoDe(u);
      if (!equipos.has(eq)) equipos.set(eq, []);
      equipos.get(eq)!.push(u);
    });

    const construirEquipo = (eqId: string) => {
      const miembros = equipos.get(eqId) ?? [];
      const idsMiembros = new Set(miembros.map((m) => m.id));
      const encargado = usuarios.find((u) => u.id === eqId && u.rol === "ENCARGADO");
      const callers = armarPodio(miembros, "CALLER", cuentaAceptados);
      const spamers = armarPodio(miembros, "CARGADOR", cuentaData, (id) => ({
        acepto: leads.filter((l) => l.cargadoPorId === id && l.estado === "ACEPTO").length,
      }));
      return {
        equipoId: eqId,
        equipoNombre: encargado ? `Equipo de ${encargado.nombre}` : "Sin equipo",
        callers, spamers,
        // El beneficio solo corre si hay 3+ en ese rol dentro del equipo.
        rankingCallersActivo: callers.length >= MIN_EQUIPO,
        rankingSpamersActivo: spamers.length >= MIN_EQUIPO,
        minEquipo: MIN_EQUIPO,
        bonoVigente: {
          caller: callers.length >= MIN_EQUIPO ? ganadorPrev(llamadasPrev.map((l) => l.callerId), idsMiembros) : [],
          spamer: spamers.length >= MIN_EQUIPO ? ganadorPrev(leadsPrev.map((l) => l.cargadoPorId), idsMiembros) : [],
        },
      };
    };

    const cierre = new Date(desde); cierre.setDate(cierre.getDate() + 7);
    const base = { desde, cierre };

    if (s.rol === "ADMIN") {
      return Response.json({ ...base, equipos: [...equipos.keys()].map(construirEquipo) });
    }

    // Los demás ven solo su equipo.
    const yo = usuarios.find((u) => u.id === s.id);
    const miEquipo = yo ? construirEquipo(equipoDe(yo)) : null;
    return Response.json({ ...base, ...(miEquipo ?? { callers: [], spamers: [] }) });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}
