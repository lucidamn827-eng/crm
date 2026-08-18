import { db } from "@/lib/db";
import { exigir } from "@/lib/auth";

const zona = () => process.env.TZ_OPERACION ?? "America/Lima";

/** Lunes 00:00 de la semana en curso, según la zona horaria de la operación. */
function lunesDeEstaSemana(): Date {
  const ahora = new Date();
  const local = new Date(ahora.toLocaleString("en-US", { timeZone: zona() }));
  const dia = local.getDay();               // 0 = domingo
  const restar = dia === 0 ? 6 : dia - 1;   // la semana arranca el lunes
  local.setDate(local.getDate() - restar);
  local.setHours(0, 0, 0, 0);
  // paso la hora local de la operación de vuelta a UTC
  const desfase = new Date(ahora.toLocaleString("en-US", { timeZone: "UTC" })).getTime() - new Date(ahora.toLocaleString("en-US", { timeZone: zona() })).getTime();
  return new Date(local.getTime() + desfase);
}

/** Podio de la semana: callers por aceptados, spamers por data subida. */
export async function GET() {
  try {
    await exigir("ADMIN", "CARGADOR", "CALLER");
    const desde = lunesDeEstaSemana();

    // Semana anterior: define quién está cobrando el 2% extra ahora mismo.
    const inicioAnterior = new Date(desde); inicioAnterior.setDate(inicioAnterior.getDate() - 7);

    const [usuarios, llamadas, leads, llamadasPrev, leadsPrev] = await Promise.all([
      db.usuario.findMany({ where: { activo: true }, select: { id: true, nombre: true, rol: true } }),
      db.llamada.findMany({ where: { creadoEn: { gte: desde }, resultado: "ACEPTO" }, select: { callerId: true } }),
      db.lead.findMany({ where: { creadoEn: { gte: desde } }, select: { cargadoPorId: true, estado: true } }),
      db.llamada.findMany({ where: { creadoEn: { gte: inicioAnterior, lt: desde }, resultado: "ACEPTO" }, select: { callerId: true } }),
      db.lead.findMany({ where: { creadoEn: { gte: inicioAnterior, lt: desde } }, select: { cargadoPorId: true } }),
    ]);

    const ganador = (ids: string[], rol: string) => {
      const cuenta = new Map<string, number>();
      ids.forEach((id) => cuenta.set(id, (cuenta.get(id) ?? 0) + 1));
      const mejor = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0];
      if (!mejor) return null;
      const u = usuarios.find((x) => x.id === mejor[0] && x.rol === rol);
      return u ? { id: u.id, nombre: u.nombre, puntos: mejor[1] } : null;
    };

    const callers = usuarios.filter((u) => u.rol === "CALLER").map((u) => ({
      id: u.id, nombre: u.nombre,
      puntos: llamadas.filter((l) => l.callerId === u.id).length,
    })).sort((a, b) => b.puntos - a.puntos);

    const spamers = usuarios.filter((u) => u.rol === "CARGADOR").map((u) => {
      const suyas = leads.filter((l) => l.cargadoPorId === u.id);
      return {
        id: u.id, nombre: u.nombre,
        puntos: suyas.length,
        acepto: suyas.filter((l) => l.estado === "ACEPTO").length,
      };
    }).sort((a, b) => b.puntos - a.puntos);

    // El domingo a medianoche cierra la semana.
    const cierre = new Date(desde); cierre.setDate(cierre.getDate() + 7);

    return Response.json({
      desde, cierre, callers, spamers,
      // Quiénes ganaron la semana pasada: son los que cobran al 12% esta semana.
      bonoVigente: {
        desde: inicioAnterior,
        caller: ganador(llamadasPrev.map((l) => l.callerId), "CALLER"),
        spamer: ganador(leadsPrev.map((l) => l.cargadoPorId), "CARGADOR"),
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}
