import { db } from "@/lib/db";
import { exigir, hashear, auditar } from "@/lib/auth";

export async function GET() {
  try {
    await exigir("ADMIN", "CARGADOR", "CALLER", "ENCARGADO", "PROCESADOR");
    const usuarios = await db.usuario.findMany({
      select: { id: true, usuario: true, nombre: true, rol: true, telefono: true, telegramId: true, codigoTg: true, notificar: true, activo: true, encargadoId: true },
      orderBy: { creadoEn: "asc" },
    });
    return Response.json({ usuarios });
  } catch (e) { return e as Response; }
}

export async function POST(req: Request) {
  try {
    const s = await exigir("ADMIN");
    const { usuario, nombre, rol, clave, telefono, equipo } = await req.json();
    if (!usuario || !nombre || String(clave ?? "").length < 8)
      return Response.json({ error: "Faltan datos o la contraseña tiene menos de 8 caracteres." }, { status: 400 });
    if (await db.usuario.findUnique({ where: { usuario: usuario.toLowerCase() } }))
      return Response.json({ error: "Ese usuario ya existe." }, { status: 400 });
    const u = await db.usuario.create({
      data: {
        usuario: String(usuario).toLowerCase().trim(), nombre, rol,
        hash: await hashear(clave), telefono: telefono ? String(telefono).replace(/\D/g, "") : null,
      },
    });
    // Si es encargado, le asignamos su gente de una vez.
    if (rol === "ENCARGADO" && Array.isArray(equipo) && equipo.length) {
      await db.usuario.updateMany({ where: { id: { in: equipo } }, data: { encargadoId: u.id } });
    }
    await auditar(s, "Usuario creado", `${u.usuario} (${u.rol})`);
    return Response.json({ ok: true, id: u.id });
  } catch (e) { return e as Response; }
}

/** Admin: activar/desactivar, cambiar teléfono, apagar notificaciones o resetear clave. */
export async function PATCH(req: Request) {
  try {
    const s = await exigir("ADMIN");
    const { id, activo, telefono, notificar, clave, rol, generarCodigo, equipo } = await req.json();
    const data: any = {};
    if (generarCodigo) data.codigoTg = Math.random().toString(36).slice(2, 8).toUpperCase();
    if (activo !== undefined) data.activo = !!activo;
    if (notificar !== undefined) data.notificar = !!notificar;
    if (telefono !== undefined) data.telefono = telefono ? String(telefono).replace(/\D/g, "") : null;
    if (rol) data.rol = rol;
    if (clave) {
      if (String(clave).length < 8) return Response.json({ error: "Contraseña muy corta." }, { status: 400 });
      data.hash = await hashear(clave);
    }
    // Reasignar el equipo de un encargado: los que saca quedan sin jefe.
    if (Array.isArray(equipo)) {
      await db.usuario.updateMany({ where: { encargadoId: id }, data: { encargadoId: null } });
      if (equipo.length) await db.usuario.updateMany({ where: { id: { in: equipo } }, data: { encargadoId: id } });
    }
    const u = await db.usuario.update({ where: { id }, data });
    await auditar(s, "Usuario modificado", `${u.usuario}: ${[...Object.keys(data), ...(equipo ? ["equipo"] : [])].join(", ")}`);
    return Response.json({ ok: true, codigoTg: u.codigoTg });
  } catch (e) { return e as Response; }
}

/**
 * Eliminar un usuario. Solo se permite si no dejó rastro operativo:
 * si ya cargó datos o hizo llamadas, se desactiva en vez de borrarse,
 * porque borrarlo se llevaría puesto el historial de esas fichas.
 */
export async function DELETE(req: Request) {
  try {
    const s = await exigir("ADMIN");
    const { id } = await req.json();
    if (id === s.id) return Response.json({ error: "No podés eliminar tu propio usuario." }, { status: 400 });

    const u = await db.usuario.findUnique({
      where: { id },
      select: {
        usuario: true, nombre: true, rol: true,
        _count: { select: { llamadas: true, leadsCargados: true, leadsAsignados: true } },
      },
    });
    if (!u) return Response.json({ error: "Ese usuario no existe." }, { status: 404 });

    const { llamadas, leadsCargados, leadsAsignados } = u._count;
    if (llamadas || leadsCargados || leadsAsignados) {
      return Response.json({
        error: `No se puede eliminar: tiene ${llamadas} llamada(s), ${leadsCargados} contacto(s) cargados y ${leadsAsignados} asignado(s). Desactivalo para que no pueda entrar; su historial se conserva.`,
      }, { status: 409 });
    }

    // Los avisos, suscripciones y eventos son bitácora de esa persona:
    // sin llamadas ni contactos detrás, se van con ella. Todo en una transacción
    // para que no quede a medio borrar si algo falla.
    await db.$transaction([
      db.aviso.deleteMany({ where: { usuarioId: id } }),
      db.suscripcion.deleteMany({ where: { usuarioId: id } }),
      db.evento.deleteMany({ where: { usuarioId: id } }),
      db.usuario.delete({ where: { id } }),
    ]);
    await auditar(s, "Usuario eliminado", `${u.usuario} (${u.rol})`);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}
