import { db } from "./db";
import { enviarAviso } from "./avisos";

/** Valores por defecto; el admin los edita desde el panel (tabla Config). */
const PORDEFECTO: Record<string, string> = {
  minutosPendiente: "10",   // recordatorio de contacto sin llamar
  minutosNoContesto: "20",  // recordatorio cuando marcó "no contestó"
  minutosVolver: "25",      // recordatorio cuando marcó "volver a llamar"
  horaInicio: "9",          // no molestar antes de esta hora
  horaFin: "21",            // ni después de esta
  maxAvisosDia: "8",        // tope de recordatorios por ficha y por día
};

export async function config(): Promise<Record<string, number>> {
  const filas = await db.config.findMany();
  const c = { ...PORDEFECTO };
  filas.forEach((f) => (c[f.clave] = f.valor));
  return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Number(v)]));
}

const zona = () => process.env.TZ_OPERACION ?? "America/Argentina/Buenos_Aires";
function horaLocal(d = new Date()) {
  return Number(new Intl.DateTimeFormat("es", { timeZone: zona(), hour: "numeric", hour12: false }).format(d));
}
export async function enHorario() {
  const c = await config();
  const h = horaLocal();
  return h >= c.horaInicio && h < c.horaFin;
}

const enMinutos = (m: number) => new Date(Date.now() + m * 60_000);

/** Aviso inmediato al caller cuando le cargan una ficha nueva. */
export async function avisarAsignacion(leadId: number) {
  const lead = await db.lead.findUnique({ where: { id: leadId }, include: { asignadoA: true, cargadoPor: true } });
  if (!lead) return;
  const c = await config();
  const cuerpo =
    `Nuevo contacto para llamar: ${lead.nombre} (${lead.telefono})` +
    `${lead.ciudad ? ` - ${lead.ciudad}` : ""}. Lo cargó ${lead.cargadoPor.nombre}. Entrá al panel para tomarlo.`;

  await enviarAviso({
    destinatario: lead.asignadoA,
    tipo: "asignacion",
    cuerpo: `Nuevo contacto para llamar (lo cargó ${lead.cargadoPor.nombre}):`,
    parametros: [lead.asignadoA.nombre, lead.nombre, lead.telefono],
    ficha: lead,
  });

  await db.lead.update({
    where: { id: lead.id },
    data: { proximoAviso: enMinutos(c.minutosPendiente), avisosHoy: 1 },
  });
}

/** Reprograma el próximo recordatorio según el resultado que cargó el caller. */
export async function programarSiguiente(leadId: number, estado: string) {
  const c = await config();
  const minutos =
    estado === "NO_CONTESTO" ? c.minutosNoContesto :
    estado === "VOLVER_A_LLAMAR" ? c.minutosVolver : null;
  await db.lead.update({
    where: { id: leadId },
    data: { proximoAviso: minutos ? enMinutos(minutos) : null, avisosHoy: 0 },
  });
}

/**
 * Corre desde el cron. Junta todas las fichas vencidas de cada caller y manda
 * UN solo mensaje por persona (no uno por ficha), para no volverlo inservible.
 */
export async function correrRecordatorios() {
  if (!(await enHorario())) return { salteado: "fuera de horario", enviados: 0 };
  const c = await config();

  const vencidas = await db.lead.findMany({
    where: {
      proximoAviso: { lte: new Date() },
      estado: { in: ["PENDIENTE", "NO_CONTESTO", "VOLVER_A_LLAMAR"] },
      avisosHoy: { lt: c.maxAvisosDia },
      asignadoA: { activo: true, notificar: true },
    },
    include: { asignadoA: true },
    take: 500,
  });

  const porCaller = new Map<string, typeof vencidas>();
  vencidas.forEach((l) => porCaller.set(l.asignadoAId, [...(porCaller.get(l.asignadoAId) ?? []), l]));

  let enviados = 0;
  for (const [callerId, fichas] of porCaller) {
    const caller = fichas[0].asignadoA;
    const sinLlamar = fichas.filter((f) => f.estado === "PENDIENTE");
    const reintentos = fichas.filter((f) => f.estado !== "PENDIENTE");
    const detalle = fichas.slice(0, 5).map((f) => `- ${f.nombre} ${f.telefono}`).join("\n");

    const cuerpo =
      `${caller.nombre}, tenés ${fichas.length} contacto(s) esperando` +
      `${sinLlamar.length ? ` (${sinLlamar.length} sin llamar` : ""}` +
      `${reintentos.length ? `${sinLlamar.length ? ", " : " ("}${reintentos.length} para reintentar` : ""}` +
      `${sinLlamar.length || reintentos.length ? ")" : ""}:\n${detalle}` +
      `${fichas.length > 5 ? `\n...y ${fichas.length - 5} más` : ""}`;

    const r = await enviarAviso({
      destinatario: caller,
      tipo: sinLlamar.length ? "recordatorio_pendiente" : "recordatorio_reintento",
      cuerpo,
      parametros: [caller.nombre, String(fichas.length), fichas[0].nombre],
      ficha: fichas[0],
    });
    if (r.enviado) enviados++;

    await Promise.all(
      fichas.map((f) =>
        db.lead.update({
          where: { id: f.id },
          data: {
            avisosHoy: { increment: 1 },
            proximoAviso: enMinutos(
              f.estado === "PENDIENTE" ? c.minutosPendiente :
              f.estado === "NO_CONTESTO" ? c.minutosNoContesto : c.minutosVolver
            ),
          },
        })
      )
    );
  }
  return { callers: porCaller.size, fichas: vencidas.length, enviados };
}

/** Se llama una vez por día para volver a habilitar el tope de avisos. */
export async function reiniciarContadores() {
  await db.lead.updateMany({ where: { avisosHoy: { gt: 0 } }, data: { avisosHoy: 0 } });
}


/**
 * Felicitación al spamer cuando un caller cierra su data con "Aceptó".
 * Le cierra el círculo: sabe que lo que cargó terminó bien y quién lo logró.
 */
export async function avisarAceptado(leadId: number, callerNombre: string) {
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    include: { cargadoPor: true },
  });
  if (!lead?.cargadoPor) return;

  const cuerpo =
    `🎉 ¡Enhorabuena ${lead.cargadoPor.nombre}! Tu caller ${callerNombre} concluyó el proceso con ` +
    `${lead.nombre} · DNI ${lead.dni} · ${lead.telefono}.`;

  await enviarAviso({
    destinatario: lead.cargadoPor,
    tipo: "cierre_aceptado",
    cuerpo,
    parametros: [lead.cargadoPor.nombre, callerNombre, lead.nombre],
  });
}
