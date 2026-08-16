import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { db } from "./db";

const secreto = () => new TextEncoder().encode(process.env.JWT_SECRET!);
export type Rol = "ADMIN" | "CARGADOR" | "CALLER";
export type Sesion = { id: string; usuario: string; nombre: string; rol: Rol };

export const hashear = (clave: string) => bcrypt.hash(clave, 12);
export const verificarClave = (clave: string, hash: string) => bcrypt.compare(clave, hash);

export async function crearSesion(s: Sesion) {
  const token = await new SignJWT(s as any)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secreto());
  (await cookies()).set("sesion", token, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 12,
  });
}

export async function leerSesion(): Promise<Sesion | null> {
  const token = (await cookies()).get("sesion")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secreto());
    return payload as unknown as Sesion;
  } catch { return null; }
}

export async function cerrarSesion() { (await cookies()).delete("sesion"); }

/** Devuelve la sesión o lanza una respuesta HTTP si no corresponde. */
export async function exigir(...roles: Rol[]): Promise<Sesion> {
  const s = await leerSesion();
  if (!s) throw new Response("Sin sesión", { status: 401 });
  if (roles.length && !roles.includes(s.rol)) throw new Response("Sin permiso", { status: 403 });
  const vivo = await db.usuario.findUnique({ where: { id: s.id }, select: { activo: true } });
  if (!vivo?.activo) throw new Response("Usuario desactivado", { status: 401 });
  return s;
}

export async function auditar(s: Sesion | null, accion: string, detalle: string) {
  await db.auditoria.create({
    data: { usuario: s?.usuario ?? "sistema", rol: s?.rol ?? "SISTEMA", accion, detalle },
  });
}
