import { db } from "@/lib/db";
import { exigir, hashear, auditar } from "@/lib/auth";

export async function GET() {
  try {
    await exigir("ADMIN", "CARGADOR");
    const usuarios = await db.usuario.findMany({
      select: { id: true, usuario: true, nombre: true, rol: true, telefono: true, telegramId: true, codigoTg: true, notificar: true, activo: true },
      orderBy: { creadoEn: "asc" },
    });
    return Response.json({ usuarios });
  } catch (e) { return e as Response; }
}

export async function POST(req: Request) {
  try {
    const s = await exigir("ADMIN");
    const { usuario, nombre, rol, clave, telefono } = await req.json();
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
    await auditar(s, "Usuario creado", `${u.usuario} (${u.rol})`);
    return Response.json({ ok: true, id: u.id });
  } catch (e) { return e as Response; }
}

/** Admin: activar/desactivar, cambiar teléfono, apagar notificaciones o resetear clave. */
export async function PATCH(req: Request) {
  try {
    const s = await exigir("ADMIN");
    const { id, activo, telefono, notificar, clave, rol, generarCodigo } = await req.json();
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
    const u = await db.usuario.update({ where: { id }, data });
    await auditar(s, "Usuario modificado", `${u.usuario}: ${Object.keys(data).join(", ")}`);
    return Response.json({ ok: true, codigoTg: u.codigoTg });
  } catch (e) { return e as Response; }
}
