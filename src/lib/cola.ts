import { db } from "@/lib/db";

/**
 * Estado de la cola de un caller con el sistema de reprogramación por hora.
 * Reglas:
 *  - "No contestó" reprograma la ficha +1 hora (reactivaEn). Mientras no llegue esa hora,
 *    la ficha NO aparece en la cola y el caller sigue con data nueva.
 *  - "Volver a llamar" agenda una hora exacta (agendadoPara).
 *  - Cuando una o varias fichas VENCEN (reactivaEn <= ahora, o agendadoPara <= ahora),
 *    se muestran arriba como RECORDATORIO, pero NO bloquean: el caller puede seguir
 *    llamando data nueva. (Antes bloqueaban; se quitó porque un vencido viejo trababa la cola.)
 *  - SOLO el "llamar urgente" del spamer (urgentePorSpamer) bloquea la data nueva.
 *  - El loop de "no contestó" solo se corta con Aceptó o No quiso.
 */
export async function estadoCola(callerId: string) {
  const ahora = new Date();

  const leads = await db.lead.findMany({
    where: { asignadoAId: callerId, estado: { in: ["PENDIENTE", "NO_CONTESTO", "VOLVER_A_LLAMAR"] as any } },
    select: { id: true, estado: true, agendadoPara: true, reactivaEn: true, creadoEn: true, urgentePorSpamer: true },
  });

  const nuevas = leads.filter((l) => l.estado === "PENDIENTE");

  // Fichas VENCIDAS: su hora ya llegó y hay que llamarlas ya.
  const vencidas = leads.filter((l) => {
    if (l.estado === "NO_CONTESTO" && l.reactivaEn && l.reactivaEn.getTime() <= ahora.getTime()) return true;
    if (l.estado === "VOLVER_A_LLAMAR" && l.agendadoPara && l.agendadoPara.getTime() <= ahora.getTime()) return true;
    return false;
  });

  // Fichas esperando su hora (no vencidas aún): no se muestran en la cola.
  const esperando = leads.filter((l) =>
    (l.estado === "NO_CONTESTO" && l.reactivaEn && l.reactivaEn.getTime() > ahora.getTime()) ||
    (l.estado === "VOLVER_A_LLAMAR" && l.agendadoPara && l.agendadoPara.getTime() > ahora.getTime())
  );

  const hayVencidas = vencidas.length > 0;
  const urgentes = vencidas.filter((l) => l.urgentePorSpamer);
  const hayUrgente = urgentes.length > 0;

  return {
    ahora,
    totalNuevas: nuevas.length,
    totalEsperando: esperando.length,
    totalVencidas: vencidas.length,
    hayVencidas,                          // hay recordatorios vencidos (NO bloquean)
    idsVencidas: vencidas.map((l) => l.id),
    idsUrgentes: urgentes.map((l) => l.id), // marcados "llamar ahora" por el spamer
    hayUrgente,                           // SOLO esto bloquea la data nueva
  };
}

/** ¿Puede el caller ABRIR esta ficha ahora? */
export async function puedeLlamar(callerId: string, leadId: number) {
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: { id: true, estado: true, asignadoAId: true, agendadoPara: true, reactivaEn: true },
  });
  if (!lead || lead.asignadoAId !== callerId) return { ok: false, motivo: "Esa ficha no es tuya." };

  const c = await estadoCola(callerId);
  const esUrgente = c.idsUrgentes.includes(leadId);
  const esRepaso = lead.estado === "NO_CONTESTO" || lead.estado === "VOLVER_A_LLAMAR";

  // Las fichas ya trabajadas (no contestó / volver a llamar) SIEMPRE se pueden volver a
  // llamar: los vencidos son un recordatorio, no un bloqueo.
  if (esRepaso) return { ok: true };

  // Data NUEVA: SOLO se bloquea si hay un cliente URGENTE del spamer sin atender.
  if (c.hayUrgente && !esUrgente) {
    return { ok: false, motivo: "Tenés un cliente urgente que pidió que lo llames ya. Llamálo antes de seguir con data nueva." };
  }

  return { ok: true };
}
