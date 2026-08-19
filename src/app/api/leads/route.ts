import { db } from "@/lib/db";
import { exigir, auditar } from "@/lib/auth";
import { avisarAsignacion } from "@/lib/notificaciones";

const digitos = (t: string) => t.replace(/\D/g, "");

/** GET: el caller ve su cola; carga y admin ven lo que corresponde. */
export async function GET() {
  try {
    const s = await exigir("ADMIN", "CARGADOR", "CALLER", "ENCARGADO", "PROCESADOR");
    let where: any = {};
    if (s.rol === "CALLER") {
      where = { asignadoAId: s.id, estado: { in: ["PENDIENTE", "NO_CONTESTO", "VOLVER_A_LLAMAR"] as any } };
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
                 llamadas: { orderBy: { creadoEn: "desc" }, take: 1 } },
      // enLlamadaDesde y asignadoAId vienen por defecto al ser campos escalares
      orderBy: [{ estado: "asc" }, { id: "asc" }],
      take: 500,
    });
    return Response.json({ leads });
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

    const creados: number[] = [], rechazados: string[] = [];
    for (const f of filas) {
      const nombre = String(f.nombre ?? "").trim();
      const dni = String(f.dni ?? "").trim();
      const telefono = String(f.telefono ?? "").trim();
      if (!nombre) { rechazados.push("(sin nombre): falta el nombre"); continue; }
      if (digitos(dni).length < 6) { rechazados.push(`${nombre}: DNI inválido o vacío`); continue; }
      if (digitos(telefono).length < 6) { rechazados.push(`${nombre}: teléfono inválido o vacío`); continue; }
      if (await db.lead.findUnique({ where: { dni } })) { rechazados.push(`${nombre}: ese DNI ya está cargado`); continue; }
      if (await db.lead.findUnique({ where: { telefono } })) { rechazados.push(`${nombre}: ese teléfono ya está cargado`); continue; }
      // La asignación es obligatoria: cada ficha nace con dueño.
      const destinoId = String(f.asignadoA ?? "");
      if (!destinoId || !callers.some((c: { id: string }) => c.id === destinoId)) {
        rechazados.push(`${nombre}: falta elegir el caller`);
        continue;
      }
      const lead = await db.lead.create({
        data: {
          nombre, dni, telefono, nota: f.nota || null,
          cargadoPorId: s.id, asignadoAId: destinoId,
        },
      });
      creados.push(lead.id);
      await avisarAsignacion(lead.id);
    }
    await auditar(s, "Carga de contactos", `${creados.length} cargados, ${rechazados.length} rechazados`);
    return Response.json({ creados: creados.length, rechazados });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}
