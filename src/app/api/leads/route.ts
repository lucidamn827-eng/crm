import { db } from "@/lib/db";
import { exigir, auditar } from "@/lib/auth";
import { avisarAsignacion } from "@/lib/notificaciones";
import { dataDeHoy, topeDe, diaHoy, resumenCarga } from "@/lib/carga";
import { estadoCola } from "@/lib/cola";

const digitos = (t: string) => t.replace(/\D/g, "");

/** GET: el caller ve su cola; carga y admin ven lo que corresponde. */
export async function GET() {
  try {
    const s = await exigir("ADMIN", "CARGADOR", "CALLER", "ENCARGADO", "PROCESADOR");
    let where: any = {};
    if (s.rol === "CALLER") {
      where = { asignadoAId: s.id, OR: [
        { estado: { in: ["PENDIENTE", "NO_CONTESTO", "VOLVER_A_LLAMAR"] as any } },
        { estado: "ACEPTO" as any, seguimiento: { not: null } },  // aceptados en seguimiento (se fue a 0 / no banca)
      ] };
    } else if (s.rol === "CARGADOR") {
      where = { cargadoPorId: s.id };
    } else if (s.rol === "ENCARGADO") {
      // Solo los contactos de la gente a su cargo.
      const equipo = await db.usuario.findMany({ where: { encargadoId: s.id }, select: { id: true } });
      const ids = equipo.map((u) => u.id);
      where = ids.length ? { OR: [{ asignadoAId: { in: ids } }, { cargadoPorId: { in: ids } }] } : { id: -1 };
    } else if (s.rol === "PROCESADOR") {
      where = { id: -1 }; // no maneja contactos
    }
    const leads = await db.lead.findMany({
      where: where as any,
      include: { asignadoA: { select: { nombre: true } }, cargadoPor: { select: { nombre: true } },
                 llamadas: { orderBy: { creadoEn: "desc" }, take: (s.rol === "CARGADOR" || s.rol === "ADMIN" || s.rol === "ENCARGADO") ? 50 : 1 } },
      // enLlamadaDesde y asignadoAId vienen por defecto al ser campos escalares
      // El caller trabaja lo más viejo primero (la data se enfría);
      // el resto ve lo último cargado arriba.
      orderBy: s.rol === "CALLER" ? [{ estado: "asc" }, { creadoEn: "asc" }] : [{ creadoEn: "desc" }],
      take: 500,
    });
    // El spamer y el admin necesitan ver cuánta data tiene hoy cada caller.
    const carga = (s.rol === "CARGADOR" || s.rol === "ADMIN") ? await resumenCarga() : undefined;

    // SEGURIDAD: al caller no le mandamos DNI ni teléfono completos de su cola.
    // Solo se destapan de la ficha que tiene EN LLAMADA (la que confirmó llamar).
    // Así el número real nunca viaja al navegador hasta que abre la ficha, y cada
    // apertura queda registrada — no se puede cosechar la lista desde la consola.
    // Al caller se le tapan DNI/teléfono SOLO de la data nueva sin abrir (PENDIENTE).
    // Las ya trabajadas (no contestó / volver a llamar) y la que está en llamada van
    // completas: el spamer igual les escribe, y así el caller repasa con los datos.
    // El caller ve TODAS sus fichas en juego (data nueva + no contestó + volver a llamar),
    // incluso las que aún no vencieron: si el cliente le devuelve la llamada, las retoma
    // en el momento. El bloqueo de data nueva cuando hay vencidas lo maneja el flag de cola,
    // no ocultando fichas. Solo la data NUEVA sin abrir va con datos tapados.
    const salida = s.rol === "CALLER"
      ? leads.map((l) => (l.enLlamadaDesde || l.estado !== "PENDIENTE")
          ? l
          : { ...l, dni: "", telefono: "", dispositivo: null, usuarioDisp: null })
      : leads;

    // Estado de la cola del caller: vencidas, data nueva, esperando.
    const cola = s.rol === "CALLER" ? await estadoCola(s.id) : undefined;

    return Response.json({ leads: salida, carga, cola });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}

/** POST: carga uno o varios contactos y avisa por WhatsApp al caller asignado. */
export async function POST(req: Request) {
  try {
    const s = await exigir("ADMIN", "CARGADOR");
    const body = await req.json();
    const filas: any[] = Array.isArray(body.contactos) ? body.contactos : [body];
    const callers = await db.usuario.findMany({ where: { rol: "CALLER", activo: true } });
    if (!callers.length) return Response.json({ error: "No hay callers activos." }, { status: 400 });

    const creados: number[] = [], rechazados: string[] = [], avisos: string[] = [];
    const dia = diaHoy();
    // Precargo cuánto lleva hoy cada caller y su tope, para no consultar en cada fila.
    const yaHoy = new Map<string, number>();
    const topes = new Map<string, number>();
    for (const c of callers) {
      yaHoy.set(c.id, await dataDeHoy(c.id, dia));
      topes.set(c.id, await topeDe(c.id, dia));
    }
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
      // El DNI puede repetirse (misma persona, otro teléfono). Lo único que no se repite es el número.
      if (await db.lead.findUnique({ where: { telefono } })) { rechazados.push(`${nombre}: ese teléfono ya está cargado`); continue; }
      // La asignación es obligatoria: cada ficha nace con dueño.
      const destinoId = String(f.asignadoA ?? "");
      if (!destinoId || !callers.some((c: { id: string }) => c.id === destinoId)) {
        rechazados.push(`${nombre}: falta elegir el caller`);
        continue;
      }
      // Control de tope diario por caller (suma de todos los spamers).
      const cargaActual = yaHoy.get(destinoId) ?? 0;
      const tope = topes.get(destinoId) ?? 20;
      if (cargaActual >= tope) {
        const cName = callers.find((c: { id: string }) => c.id === destinoId)?.nombre ?? "el caller";
        rechazados.push(`${nombre}: ${cName} ya llegó a su tope de hoy (${tope}). Pedí permiso al admin para subirle más.`);
        continue;
      }
      const repetido = await db.lead.count({ where: { dni } });
      const esUrgente = f.urgente === true;
      const lead = await db.lead.create({
        data: {
          nombre, dni, telefono, nota: f.nota || null,
          dispositivo, usuarioDisp: usuarioDisp || null,
          cargadoPorId: s.id, asignadoAId: destinoId,
          // Urgente: nace como "volver a llamar" vencido ya, con prioridad máxima.
          ...(esUrgente ? { estado: "VOLVER_A_LLAMAR" as any, urgentePorSpamer: new Date(), agendadoPara: new Date() } : {}),
        },
      });
      creados.push(lead.id);
      yaHoy.set(destinoId, cargaActual + 1);
      if (repetido) avisos.push(`${nombre}: cargado, pero ese DNI ya tenía ${repetido} contacto(s) con otro número`);
      if (esUrgente) {
        const { avisarUrgentePorSpamer } = await import("@/lib/notificaciones");
        await avisarUrgentePorSpamer(lead.id, s.nombre, "TEL").catch(() => {});
      } else {
        await avisarAsignacion(lead.id);
      }
    }
    await auditar(s, "Carga de contactos", `${creados.length} cargados, ${rechazados.length} rechazados`);
    return Response.json({ creados: creados.length, rechazados, avisos });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}
