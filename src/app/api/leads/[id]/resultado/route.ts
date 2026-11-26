import { db } from "@/lib/db";
import { exigir, auditar } from "@/lib/auth";
import { avisarAceptado, avisarFinLlamada } from "@/lib/notificaciones";
import { registrar, ipDe } from "@/lib/eventos";
import { lunesDeEstaSemana, bonoDe, METAS } from "@/lib/semana";
import { enviarAviso } from "@/lib/avisos";
import { MAX_INTENTOS, LAPSO_REINTENTO_MIN } from "@/lib/cola";

const VALIDOS = ["ACEPTO", "NO_QUISO", "NO_CONTESTO"];

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await exigir("ADMIN", "CALLER");
    const id = Number((await ctx.params).id);
    const { resultado, nota, monto, referencia, procesadorId, motivo, seguimiento, cuentaEmpresa } = await req.json();
    if (!VALIDOS.includes(resultado)) return Response.json({ error: "Resultado inválido." }, { status: 400 });

    // Aceptó con seguimiento (aceptó pero no pagó aún): monto 0, sin procesador.
    const SEG = ["MISIO", "SE_FUE_A_0", "NO_BANCA"];
    const conSeguimiento = resultado === "ACEPTO" && SEG.includes(seguimiento);
    const importe = Number(monto);
    if (resultado === "ACEPTO" && !conSeguimiento && (!Number.isFinite(importe) || importe <= 0)) {
      return Response.json({ error: "Para cerrar en “Aceptó” tenés que indicar cuánto pagó el cliente." }, { status: 400 });
    }
    if (resultado === "ACEPTO" && !conSeguimiento && !procesadorId) {
      const hay = await db.usuario.count({ where: { rol: "PROCESADOR", activo: true } });
      if (hay) return Response.json({ error: "Elegí quién procesó el pago." }, { status: 400 });
    }
    if (resultado === "NO_QUISO" && (!motivo || !String(motivo).trim())) {
      return Response.json({ error: "Para cerrar en “No quiso” tenés que indicar el motivo." }, { status: 400 });
    }

    const lead = await db.lead.findUnique({ where: { id }, include: { cargadoPor: { select: { nombre: true } } } });
    if (!lead) return Response.json({ error: "La ficha no existe." }, { status: 404 });
    if (s.rol === "CALLER" && lead.asignadoAId !== s.id)
      return Response.json({ error: "Esa ficha no es tuya." }, { status: 403 });

    const abiertoEn = lead.enLlamadaDesde ?? new Date();
    const duracion = Math.max(0, Math.floor((Date.now() - abiertoEn.getTime()) / 1000));
    const ip = ipDe(req) ?? undefined;

    await db.llamada.create({
      data: {
        leadId: id, callerId: s.id, resultado, nota: nota || null, duracion, abiertoEn,
        motivo: resultado === "NO_QUISO" ? String(motivo).trim().slice(0, 200) : null,
        monto: resultado === "ACEPTO" ? (conSeguimiento ? 0 : importe) : null,
        referencia: resultado === "ACEPTO" ? (referencia || null) : null,
        procesadorId: resultado === "ACEPTO" ? (procesadorId || null) : null,
        cuentaEmpresa: resultado === "ACEPTO" ? !!cuentaEmpresa : false,
        desdeIp: ip ?? null, agente: req.headers.get("user-agent")?.slice(0, 160) ?? null,
      },
    });

    const intentosNuevos = lead.intentos + 1;
    const segPersistente = (seguimiento === "SE_FUE_A_0" || seguimiento === "NO_BANCA") ? seguimiento : null;

    // Cómo queda la ficha según el resultado:
    const comun = { enLlamadaDesde: null, reservadoEn: null, urgentePorSpamer: null, intentos: { increment: 1 } };
    let cambio: any;
    if (resultado === "ACEPTO") {
      // Se cierra con el caller como dueño (para comisión/historial).
      cambio = { ...comun, estado: "ACEPTO", seguimiento: segPersistente, reactivaEn: null };
    } else if (resultado === "NO_QUISO") {
      // Se libera del pool y se guarda; se podrá volver a llamar más adelante (búsqueda).
      cambio = { ...comun, estado: "NO_QUISO", seguimiento: null, asignadoAId: null, reactivaEn: null };
    } else {
      // NO_CONTESTO: vuelve al pool tras el lapso, hasta 3 intentos; después queda guardado fuera de rotación.
      const quedanIntentos = intentosNuevos < MAX_INTENTOS;
      cambio = {
        ...comun, estado: "NO_CONTESTO", seguimiento: null, asignadoAId: null,
        reactivaEn: quedanIntentos ? new Date(Date.now() + LAPSO_REINTENTO_MIN * 60000) : null,
      };
    }
    await db.lead.update({ where: { id }, data: cambio });

    let subioEscalon: any = null;
    if (resultado === "ACEPTO") {
      await avisarAceptado(id, s.nombre).catch(() => {});
      const desde = lunesDeEstaSemana();
      const total = await db.llamada.count({ where: { callerId: s.id, resultado: "ACEPTO", anulada: false, creadoEn: { gte: desde } } });
      const cruzado = METAS.CALLER.find((m) => m.meta === total);
      if (cruzado) {
        subioEscalon = { ...cruzado, total };
        const yo = await db.usuario.findUnique({ where: { id: s.id } });
        if (yo) {
          await enviarAviso({
            destinatario: yo, tipo: "escalon",
            cuerpo: `☁️ ¡Subiste de escalón! Llegaste a ${total} aceptados: bono de S/ ${cruzado.bono} asegurado esta semana.`,
            parametros: [yo.nombre, String(total), String(cruzado.bono)],
          }).catch(() => {});
        }
      }
    }
    await avisarFinLlamada(id, s.nombre, resultado, duracion, null).catch(() => {});
    await registrar(s, "resultado", { leadId: id, detalle: `${resultado} · ${lead.nombre}`, segundos: duracion, ip });
    await auditar(s, "Resultado de llamada", `Ficha ${id} (${lead.telefono}): ${resultado} en ${duracion}s`);

    // Recién ahora el caller ve de quién era la data (el spamer) y los datos del cliente.
    return Response.json({
      ok: true, duracion, subioEscalon,
      revelado: resultado === "ACEPTO"
        ? { cliente: lead.nombre, dni: lead.dni, telefono: lead.telefono, spamer: lead.cargadoPor?.nombre ?? "—" }
        : null,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}
