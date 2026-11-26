import { db } from "@/lib/db";
import { exigir, auditar } from "@/lib/auth";
import { archivarSiCorresponde } from "@/lib/notificaciones";
import { dataSubidaHoy, topeSubidaDe } from "@/lib/carga";
import { estadoColaCaller } from "@/lib/cola";
import { enviarAviso } from "@/lib/avisos";

const digitos = (t: string) => t.replace(/\D/g, "");

/** GET: el caller ve su ficha actual (a ciegas) + seguimientos; carga/encargado/admin ven lo suyo. */
export async function GET() {
  try {
    const s = await exigir("ADMIN", "CARGADOR", "CALLER", "ENCARGADO", "PROCESADOR");

    if (s.rol === "CALLER") {
      // Su ficha actual: la que tiene reservada (alerta) o en llamada.
      const mia = await db.lead.findFirst({
        where: { asignadoAId: s.id, archivadoEn: null, OR: [{ reservadoEn: { not: null } }, { enLlamadaDesde: { not: null } }] },
        orderBy: { enLlamadaDesde: "desc" },
      });
      // Seguimientos (aceptó sin cobrar): se conservan en su lista.
      const seg = await db.lead.findMany({
        where: { asignadoAId: s.id, estado: "ACEPTO", seguimiento: { not: null }, archivadoEn: null },
        orderBy: { creadoEn: "desc" }, take: 50,
      });
      // A ciegas: mientras esté RESERVADA (no la tomó) no viaja nombre/DNI/teléfono/spamer.
      // Al tomarla (en llamada) se destapan DNI y teléfono; el spamer recién al ACEPTAR.
      const revelar = (l: any) => {
        if (l.enLlamadaDesde) {
          // Teléfono/DNI visibles para llamar; el spamer (nombre e id) NO viaja hasta aceptar.
          return { ...l, cargadoPor: undefined, cargadoPorId: undefined, asignadoA: undefined };
        }
        return { id: l.id, estado: l.estado, creadoEn: l.creadoEn, reservadoEn: l.reservadoEn,
                 enLlamadaDesde: null, nombre: "", dni: "", telefono: "", nota: null, viaContacto: null,
                 urgente: !!l.urgentePorSpamer };
      };
      const segSeguro = seg.map((l) => ({ ...l, cargadoPor: undefined, cargadoPorId: undefined, asignadoA: undefined }));
      const leads = [...(mia ? [revelar(mia)] : []), ...segSeguro];

      if (mia || seg.length) void archivarSiCorresponde();
      const cola = await estadoColaCaller(s.id);
      return Response.json({ leads, cola });
    }

    // No-callers: listados de lectura.
    let where: any = {};
    if (s.rol === "CARGADOR") {
      where = { cargadoPorId: s.id };
    } else if (s.rol === "ENCARGADO") {
      const equipo = await db.usuario.findMany({ where: { encargadoId: s.id }, select: { id: true } });
      const ids = equipo.map((u) => u.id);
      where = ids.length ? { OR: [{ asignadoAId: { in: ids } }, { cargadoPorId: { in: ids } }] } : { id: -1 };
    } else if (s.rol === "PROCESADOR") {
      where = { id: -1 };
    }
    const incluir = {
      asignadoA: { select: { nombre: true } }, cargadoPor: { select: { nombre: true } },
      llamadas: { orderBy: { creadoEn: "desc" as const }, take: 50 },
    };
    const leads = await db.lead.findMany({ where: where as any, include: incluir, orderBy: [{ creadoEn: "desc" }], take: 500 });
    return Response.json({ leads });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}

/** POST: el spamer sube contactos al POOL (sin asignar caller). Tope diario por spamer. */
export async function POST(req: Request) {
  try {
    const s = await exigir("ADMIN", "CARGADOR");
    const body = await req.json();
    const filas: any[] = Array.isArray(body.contactos) ? body.contactos : [body];

    // URGENTE asignada por el admin a un caller: la data no va al pool, se le reserva a ese caller.
    const urgenteParaId = s.rol === "ADMIN" && body.urgente && body.callerId ? String(body.callerId) : null;
    if (urgenteParaId) {
      const caller = await db.usuario.findFirst({ where: { id: urgenteParaId, rol: "CALLER", activo: true }, select: { id: true, nombre: true, telegramId: true, telefono: true, ventanaHasta: true, notificar: true } });
      if (!caller) return Response.json({ error: "Elegí un caller válido para la llamada urgente." }, { status: 400 });
    }

    // El admin puede atribuir la data a un spamer (la data urgente se la pasan los spamers).
    // Si no elige, la data queda a su nombre. Los spamers siempre cargan a su propio nombre.
    let cargadoPorId = s.id;
    if (s.rol === "ADMIN" && body.spamerId) {
      const sp = await db.usuario.findFirst({ where: { id: String(body.spamerId), rol: "CARGADOR" }, select: { id: true } });
      if (!sp) return Response.json({ error: "Elegí un spamer válido." }, { status: 400 });
      cargadoPorId = sp.id;
    }

    // Tope de subida del spamer (los ADMIN no tienen tope).
    let subidasHoy = s.rol === "CARGADOR" ? await dataSubidaHoy(s.id) : 0;
    const tope = s.rol === "CARGADOR" ? await topeSubidaDe(s.id) : null;
    if (tope !== null && subidasHoy >= tope) {
      return Response.json({ error: `Llegaste a tu tope de subida de hoy (${tope}). Pedile al administrador que te habilite más.`, tope, hoy: subidasHoy }, { status: 409 });
    }

    const creados: number[] = [], rechazados: string[] = [], avisos: string[] = [];
    for (const f of filas) {
      const nombre = String(f.nombre ?? "").trim();
      const dni = String(f.dni ?? "").trim();
      const telefono = String(f.telefono ?? "").trim();
      const dispositivo = String(f.dispositivo ?? "").trim();
      const usuarioDisp = String(f.usuarioDisp ?? "").trim();
      if (!nombre) { rechazados.push("(sin nombre): falta el nombre"); continue; }
      if (digitos(dni).length < 6) { rechazados.push(`${nombre}: DNI inválido o vacío`); continue; }
      if (digitos(telefono).length < 6) { rechazados.push(`${nombre}: teléfono inválido o vacío`); continue; }
      if (!dispositivo) { rechazados.push(`${nombre}: falta indicar desde qué dispositivo se le escribió`); continue; }
      // Cortar si en medio de la tanda se llegó al tope.
      if (tope !== null && subidasHoy >= tope) { rechazados.push(`${nombre}: no se subió, llegaste a tu tope de hoy (${tope})`); continue; }
      // El DNI puede repetirse (misma persona, otro teléfono). Lo único único es el número.
      const existente = await db.lead.findUnique({ where: { telefono } });
      if (existente) {
        // Si es URGENTE y el contacto YA existe (ya lo llamaron): lo reactivamos como urgente
        // para el caller elegido, aunque ya tenga historial. Si no es urgente, se rechaza el duplicado.
        if (urgenteParaId && !existente.archivadoEn) {
          const dataReurg: any = {
            asignadoAId: urgenteParaId, reservadoEn: new Date(), urgentePorSpamer: new Date(),
            enLlamadaDesde: null, estado: "PENDIENTE", reactivaEn: null,
          };
          if (f.nota) dataReurg.nota = f.nota;                 // mensaje nuevo que dejó el spamer
          if (s.rol === "ADMIN" && body.spamerId) dataReurg.cargadoPorId = cargadoPorId; // re-atribuir si lo elegiste
          await db.lead.update({ where: { id: existente.id }, data: dataReurg });
          creados.push(existente.id);
          avisos.push(`${nombre}: ya existía (ya lo habían llamado), se marcó como URGENTE para el caller`);
          continue;
        }
        rechazados.push(`${nombre}: ese teléfono ya está cargado`); continue;
      }

      const repetido = await db.lead.count({ where: { dni } });
      const lead = await db.lead.create({
        data: {
          nombre, dni, telefono, nota: f.nota || null,
          dispositivo, usuarioDisp: usuarioDisp || null,
          cargadoPorId,
          // URGENTE: se reserva directo al caller elegido. Si no, va al pool (sin caller).
          asignadoAId: urgenteParaId,
          reservadoEn: urgenteParaId ? new Date() : null,
          urgentePorSpamer: urgenteParaId ? new Date() : null,
          estado: "PENDIENTE",
        },
      });
      creados.push(lead.id);
      subidasHoy++;
      if (repetido) avisos.push(`${nombre}: cargado, pero ese DNI ya tenía ${repetido} contacto(s) con otro número`);
    }

    // Si fue urgente: liberar cualquier reserva NO urgente que tuviera ese caller (la urgente pasa a ser la suya),
    // y avisarle.
    if (urgenteParaId && creados.length) {
      await db.lead.updateMany({
        where: { asignadoAId: urgenteParaId, reservadoEn: { not: null }, enLlamadaDesde: null, urgentePorSpamer: null },
        data: { asignadoAId: null, reservadoEn: null },
      });
      const caller = await db.usuario.findUnique({ where: { id: urgenteParaId }, select: { id: true, nombre: true, telegramId: true, telefono: true, ventanaHasta: true, notificar: true } });
      if (caller) {
        await enviarAviso({
          destinatario: caller, tipo: "urgente_asignada",
          cuerpo: `🚨 Tenés una llamada URGENTE asignada por tu administrador. Te sale apenas termines la llamada actual.`,
          parametros: [caller.nombre],
        }).catch(() => {});
      }
    }
    await auditar(s, urgenteParaId ? "Carga URGENTE asignada" : "Carga de contactos al pool", `${creados.length} cargados, ${rechazados.length} rechazados`);
    const faltan = tope !== null ? Math.max(0, tope - subidasHoy) : null;
    return Response.json({ creados: creados.length, rechazados, avisos, hoy: subidasHoy, tope, faltan });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}
