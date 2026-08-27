import { db } from "@/lib/db";
import { exigir, auditar } from "@/lib/auth";

/** Solo el admin corrige datos de una ficha (errores de carga, reasignaciones, estado). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await exigir("ADMIN", "CARGADOR");
    const id = Number((await ctx.params).id);
    const b = await req.json();

    const actual = await db.lead.findUnique({ where: { id } });
    if (!actual) return Response.json({ error: "La ficha no existe." }, { status: 404 });

    // CASO ESPECIAL: el spamer marca "LLAMAR AHORA" (el cliente pidió que lo llamen ya).
    // Prioridad máxima: bloquea la cola del caller como un vencido urgente y le manda alerta.
    if (b.urgente !== undefined) {
      if (s.rol === "CARGADOR" && actual.cargadoPorId !== s.id)
        return Response.json({ error: "Esa ficha la cargó otra persona." }, { status: 403 });
      const via = b.viaContacto === "WSP" ? "WSP" : "TEL";
      const lead = await db.lead.update({
        where: { id },
        data: {
          estado: "VOLVER_A_LLAMAR" as any,
          urgentePorSpamer: new Date(),
          agendadoPara: new Date(),   // vence ya
          reactivaEn: null,
          viaContacto: via,
          nota: b.nota !== undefined ? b.nota : actual.nota,
        },
      });
      const { avisarUrgentePorSpamer } = await import("@/lib/notificaciones");
      await avisarUrgentePorSpamer(id, s.nombre, via).catch(() => {});
      await auditar(s, "Cliente urgente marcado por spamer", `Ficha ${id} · ${actual.nombre} · ${via}`);
      return Response.json({ ok: true, lead });
    }

    // CASO ESPECIAL: el spamer AGENDA una hora de llamada sobre su propia data
    // (el cliente le respondió por WhatsApp y coordinó horario). Esto SÍ se permite
    // aunque la ficha ya haya sido llamada: pone la ficha en "volver a llamar" a esa hora,
    // lo que obliga al caller a llamarla cuando venza.
    if (b.agendarPara !== undefined) {
      if (s.rol === "CARGADOR" && actual.cargadoPorId !== s.id)
        return Response.json({ error: "Esa ficha la cargó otra persona." }, { status: 403 });
      const cuando = new Date(b.agendarPara);
      if (isNaN(cuando.getTime()) || cuando.getTime() < Date.now() - 60000)
        return Response.json({ error: "La hora tiene que ser futura." }, { status: 400 });
      const lead = await db.lead.update({
        where: { id },
        data: { estado: "VOLVER_A_LLAMAR" as any, agendadoPara: cuando, reactivaEn: null,
                viaContacto: b.viaContacto === "WSP" ? "WSP" : b.viaContacto === "TEL" ? "TEL" : actual.viaContacto,
                nota: b.nota !== undefined ? b.nota : actual.nota },
      });
      // Avisar al caller que tiene una llamada agendada por el spamer.
      const { avisarAgendadoPorSpamer } = await import("@/lib/notificaciones");
      await avisarAgendadoPorSpamer(id, s.nombre).catch(() => {});
      await auditar(s, "Llamada agendada por spamer", `Ficha ${id} · ${actual.nombre} para ${cuando.toISOString()}`);
      return Response.json({ ok: true, lead });
    }

    // El spamer solo toca lo que cargó él, y solo si el caller todavía no la trabajó.
    if (s.rol === "CARGADOR") {
      if (actual.cargadoPorId !== s.id)
        return Response.json({ error: "Esa ficha la cargó otra persona." }, { status: 403 });
      if (actual.intentos > 0)
        return Response.json({ error: "Ya fue llamada: pedile la corrección al administrador." }, { status: 409 });
    }

    const permitidos = s.rol === "ADMIN"
      ? ["nombre", "dni", "telefono", "nota", "dispositivo", "usuarioDisp", "asignadoAId", "estado"]
      : ["nombre", "dni", "telefono", "nota", "dispositivo", "usuarioDisp"];
    const data: any = {};
    for (const k of permitidos) if (b[k] !== undefined && b[k] !== "") data[k] = b[k];
    if (b.liberar && s.rol === "ADMIN") data.enLlamadaDesde = null;

    const lead = await db.lead.update({ where: { id }, data });
    await auditar(s, "Ficha corregida por admin", `Ficha ${id}: ${Object.keys(data).join(", ")}`);
    return Response.json({ ok: true, lead });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await exigir("ADMIN", "CARGADOR");
    const id = Number((await ctx.params).id);
    const actual = await db.lead.findUnique({ where: { id } });
    if (!actual) return Response.json({ error: "La ficha no existe." }, { status: 404 });
    if (s.rol === "CARGADOR") {
      if (actual.cargadoPorId !== s.id)
        return Response.json({ error: "Esa ficha la cargó otra persona." }, { status: 403 });
      if (actual.intentos > 0)
        return Response.json({ error: "Ya fue llamada: no se puede borrar, pedíselo al administrador." }, { status: 409 });
    }
    const lead = await db.lead.delete({ where: { id } });
    await auditar(s, "Ficha eliminada", `${lead.nombre} · ${lead.dni}`);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}
