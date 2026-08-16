import { db } from "@/lib/db";
import { exigir, auditar } from "@/lib/auth";
import { config } from "@/lib/notificaciones";

export async function GET() {
  try { await exigir("ADMIN"); return Response.json({ config: await config() }); }
  catch (e) { return e as Response; }
}

export async function PUT(req: Request) {
  try {
    const s = await exigir("ADMIN");
    const cambios: Record<string, string | number> = await req.json();
    await Promise.all(
      Object.entries(cambios).map(([clave, valor]) =>
        db.config.upsert({ where: { clave }, update: { valor: String(valor) }, create: { clave, valor: String(valor) } })
      )
    );
    await auditar(s, "Configuración de avisos", JSON.stringify(cambios));
    return Response.json({ ok: true, config: await config() });
  } catch (e) { return e as Response; }
}
