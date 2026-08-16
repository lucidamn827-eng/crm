import { db } from "@/lib/db";
import { crearSesion, verificarClave, auditar } from "@/lib/auth";

export async function POST(req: Request) {
  const { usuario, clave } = await req.json();
  const u = await db.usuario.findUnique({ where: { usuario: String(usuario ?? "").trim().toLowerCase() } });
  if (!u || !u.activo || !(await verificarClave(String(clave ?? ""), u.hash))) {
    return Response.json({ error: "Usuario o contraseña incorrectos." }, { status: 401 });
  }
  const s = { id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol };
  await crearSesion(s);
  await auditar(s, "Inicio de sesión", u.nombre);
  return Response.json({ ok: true, rol: u.rol });
}
