import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { db } from "./db";

const secreto = () => new TextEncoder().encode(process.env.JWT_SECRET!);
const DIAS = 30; // la sesión no se cae sola durante el turno ni entre días

export type Rol = "ADMIN" | "CARGADOR" | "CALLER";
export type Sesion = { id: string; usuario: string; nombre: string; rol: Rol; sid: string };

export const hashear = (clave: string) => bcrypt.hash(clave, 12);
export const verificarClave = (clave: string, hash: string) => bcrypt.compare(clave, hash);

/** Sesión única: cada login genera un id nuevo y anula el del dispositivo anterior. */
export async function crearSesion(datos: Omit<Sesion, "sid">) {
  const sid = crypto.randomUUID();
  await db.usuario.update({ where: { id: datos.id }, data: { sesionActual: sid } });

  const token = await new SignJWT({ ...datos, sid } as any)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${DIAS}d`)
    .sign(secreto());

  (await cookies()).set("sesion", token, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * DIAS,
  });
  return sid;
}

export async function leerSesion(): Promise<Sesion | null> {
  const token = (await cookies()).get("sesion")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secreto());
    return payload as unknown as Sesion;
  } catch { return null; }
}

export async function cerrarSesion(limpiarEnBase = true) {
  const s = await leerSesion();
  if (s && limpiarEnBase) await db.usuario.update({ where: { id: s.id }, data: { sesionActual: null } }).catch(() => {});
  (await cookies()).delete("sesion");
}

/**
 * Valida rol y sesión activa. Si la persona entró desde otro dispositivo,
 * este pedido devuelve 409 y el panel la manda al login.
 */
export async function exigir(...roles: Rol[]): Promise<Sesion> {
  const s = await leerSesion();
  if (!s) throw new Response("Sin sesión", { status: 401 });
  if (roles.length && !roles.includes(s.rol)) throw new Response("Sin permiso", { status: 403 });

  const u = await db.usuario.findUnique({ where: { id: s.id }, select: { activo: true, sesionActual: true } });
  if (!u?.activo) throw new Response("Usuario desactivado", { status: 401 });
  if (u.sesionActual && s.sid && u.sesionActual !== s.sid)
    throw new Response(JSON.stringify({ error: "desplazada" }), { status: 409, headers: { "Content-Type": "application/json" } });

  return s;
}

export async function auditar(s: Sesion | null, accion: string, detalle: string) {
  await db.auditoria.create({
    data: { usuario: s?.usuario ?? "sistema", rol: s?.rol ?? "SISTEMA", accion, detalle },
  });
}
