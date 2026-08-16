import { db } from "@/lib/db";
import { crearSesion, verificarClave, auditar } from "@/lib/auth";
import { registrar, ipDe } from "@/lib/eventos";

export async function POST(req: Request) {
  const { usuario, clave } = await req.json();
  const u = await db.usuario.findUnique({ where: { usuario: String(usuario ?? "").trim().toLowerCase() } });
  if (!u || !u.activo || !(await verificarClave(String(clave ?? ""), u.hash))) {
    return Response.json({ error: "Usuario o contraseña incorrectos." }, { status: 401 });
  }

  const habiaOtra = !!u.sesionActual; // ya estaba conectado en otro lado
  const s = { id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol };
  const sid = await crearSesion(s);

  const ip = ipDe(req) ?? undefined;
  await auditar({ ...s, sid }, "Inicio de sesión", u.nombre + (habiaOtra ? " (desplazó otra sesión)" : ""));
  await registrar(s, habiaOtra ? "desplazo_sesion" : "login", {
    ip, detalle: req.headers.get("user-agent")?.slice(0, 120) ?? undefined,
  });

  return Response.json({ ok: true, rol: u.rol, desplazoOtra: habiaOtra });
}
