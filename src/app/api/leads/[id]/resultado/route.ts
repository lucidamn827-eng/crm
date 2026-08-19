import { db } from "@/lib/db";
import { exigir, auditar } from "@/lib/auth";
import { programarSiguiente, avisarAceptado } from "@/lib/notificaciones";
import { registrar, ipDe } from "@/lib/eventos";
import { lunesDeEstaSemana, bonoDe, METAS } from "@/lib/semana";
import { enviarAviso } from "@/lib/avisos";

const VALIDOS = ["ACEPTO", "NO_QUISO", "NO_CONTESTO", "VOLVER_A_LLAMAR"];

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await exigir("ADMIN", "CALLER");
    const id = Number((await ctx.params).id);
    const { resultado, nota, monto, referencia, procesadorId } = await req.json();
    if (!VALIDOS.includes(resultado)) return Response.json({ error: "Resultado inválido." }, { status: 400 });

    // Sin monto no hay venta: es lo que después define la comisión.
    const importe = Number(monto);
    if (resultado === "ACEPTO" && (!Number.isFinite(importe) || importe <= 0)) {
      return Response.json({ error: "Para cerrar en “Aceptó” tenés que indicar cuánto pagó el cliente." }, { status: 400 });
    }
    // Si hay procesadores de pago cargados, hay que decir quién procesó esta venta.
    if (resultado === "ACEPTO" && !procesadorId) {
      const hay = await db.usuario.count({ where: { rol: "PROCESADOR", activo: true } });
      if (hay) return Response.json({ error: "Elegí quién procesó el pago." }, { status: 400 });
    }

    const lead = await db.lead.findUnique({ where: { id } });
    if (!lead) return Response.json({ error: "La ficha no existe." }, { status: 404 });
    if (s.rol === "CALLER" && lead.asignadoAId !== s.id)
      return Response.json({ error: "Esa ficha no es tuya." }, { status: 403 });

    // El tiempo lo calcula el servidor con la hora de apertura: el caller no puede falsearlo.
    const abiertoEn = lead.enLlamadaDesde ?? new Date();
    const duracion = Math.max(0, Math.floor((Date.now() - abiertoEn.getTime()) / 1000));
    const ip = ipDe(req) ?? undefined;

    await db.llamada.create({
      data: {
        leadId: id, callerId: s.id, resultado, nota: nota || null, duracion, abiertoEn,
        monto: resultado === "ACEPTO" ? importe : null,
        referencia: resultado === "ACEPTO" ? (referencia || null) : null,
        procesadorId: resultado === "ACEPTO" ? (procesadorId || null) : null,
        desdeIp: ip ?? null, agente: req.headers.get("user-agent")?.slice(0, 160) ?? null,
      },
    });
    await db.lead.update({ where: { id }, data: { estado: resultado, intentos: { increment: 1 }, enLlamadaDesde: null } });
    await programarSiguiente(id, resultado);
    // El spamer que cargó la data se entera del cierre en el momento.
    let subioEscalon: any = null;
    if (resultado === "ACEPTO") {
      await avisarAceptado(id, s.nombre);

      // ¿Con esta venta cruzó un escalón de "El cielo es el límite"?
      const desde = lunesDeEstaSemana();
      const total = await db.llamada.count({
        where: { callerId: s.id, resultado: "ACEPTO", anulada: false, creadoEn: { gte: desde } },
      });
      const cruzado = METAS.CALLER.find((m) => m.meta === total);
      if (cruzado) {
        subioEscalon = { ...cruzado, total };
        const yo = await db.usuario.findUnique({ where: { id: s.id } });
        if (yo) {
          await enviarAviso({
            destinatario: yo,
            tipo: "escalon",
            cuerpo: `☁️ ¡Subiste de escalón! Llegaste a ${total} aceptados: bono de S/ ${cruzado.bono} asegurado esta semana.`,
            parametros: [yo.nombre, String(total), String(cruzado.bono)],
          });
        }
      }
    }
    await registrar(s, "resultado", { leadId: id, detalle: `${resultado} · ${lead.nombre}`, segundos: duracion, ip });
    await auditar(s, "Resultado de llamada", `Ficha ${id} (${lead.telefono}): ${resultado} en ${duracion}s`);
    return Response.json({ ok: true, duracion, subioEscalon });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}
