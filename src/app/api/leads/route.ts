import { db } from "@/lib/db";
import { exigir, auditar } from "@/lib/auth";
import { avisarAsignacion } from "@/lib/notificaciones";

const digitos = (t: string) => t.replace(/\D/g, "");

/** GET: el caller ve su cola; carga y admin ven lo que corresponde. */
export async function GET() {
  try {
    const s = await exigir("ADMIN", "CARGADOR", "CALLER");
    const where =
      s.rol === "CALLER" ? { asignadoAId: s.id, estado: { in: ["PENDIENTE", "NO_CONTESTO", "VOLVER_A_LLAMAR"] as any } } :
      s.rol === "CARGADOR" ? { cargadoPorId: s.id } : {};
    const leads = await db.lead.findMany({
      where: where as any,
      include: { asignadoA: { select: { nombre: true } }, cargadoPor: { select: { nombre: true } },
                 llamadas: { orderBy: { creadoEn: "desc" }, take: 1 } },
      orderBy: [{ estado: "asc" }, { id: "asc" }],
      take: 500,
    });
    return Response.json({ leads });
  } catch (e) { return e as Response; }
}

/** POST: carga uno o varios contactos y avisa por WhatsApp al caller asignado. */
export async function POST(req: Request) {
  try {
    const s = await exigir("ADMIN", "CARGADOR");
    const body = await req.json();
    const filas: any[] = Array.isArray(body.contactos) ? body.contactos : [body];
    const callers = await db.usuario.findMany({ where: { rol: "CALLER", activo: true } });
    if (!callers.length) return Response.json({ error: "No hay callers activos." }, { status: 400 });

    const cargas = await Promise.all(
      callers.map(async (c) => ({
        id: c.id,
        n: await db.lead.count({ where: { asignadoAId: c.id, estado: { in: ["PENDIENTE", "NO_CONTESTO", "VOLVER_A_LLAMAR"] } } }),
      }))
    );
    const menosCargado = () => cargas.sort((a, b) => a.n - b.n)[0];

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
      const destino = f.asignadoA && callers.some((c) => c.id === f.asignadoA)
        ? cargas.find((c) => c.id === f.asignadoA)!
        : menosCargado();
      const lead = await db.lead.create({
        data: {
          nombre, dni, telefono, ciudad: f.ciudad || null, nota: f.nota || null,
          cargadoPorId: s.id, asignadoAId: destino.id,
        },
      });
      destino.n++;
      creados.push(lead.id);
      await avisarAsignacion(lead.id);
    }
    await auditar(s, "Carga de contactos", `${creados.length} cargados, ${rechazados.length} rechazados`);
    return Response.json({ creados: creados.length, rechazados });
  } catch (e) { return e as Response; }
}
