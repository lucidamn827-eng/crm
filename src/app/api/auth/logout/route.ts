import { cerrarSesion, leerSesion, auditar } from "@/lib/auth";
export async function POST() {
  await auditar(await leerSesion(), "Cierre de sesión", "");
  await cerrarSesion();
  return Response.json({ ok: true });
}
