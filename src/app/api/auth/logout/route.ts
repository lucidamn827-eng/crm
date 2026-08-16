import { cerrarSesion, leerSesion, auditar } from "@/lib/auth";
import { registrar } from "@/lib/eventos";

export async function POST() {
  const s = await leerSesion();
  if (s) await registrar(s, "logout");
  await auditar(s, "Cierre de sesión", "");
  await cerrarSesion();
  return Response.json({ ok: true });
}
