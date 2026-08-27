import { db } from "@/lib/db";

/**
 * Estado de la cola de un caller con el sistema de reprogramación por hora.
 * Reglas:
 *  - "No contestó" reprograma la ficha +1 hora (reactivaEn). Mientras no llegue esa hora,
 *    la ficha NO aparece en la cola y el caller sigue con data nueva.
 *  - "Volver a llamar" agenda una hora exacta (agendadoPara).
 *  - Cuando una o varias fichas VENCEN (reactivaEn <= ahora, o agendadoPara <= ahora),
 *    se BLOQUEA la data nueva: el caller solo puede llamar a esas fichas vencidas
 *    (elige el orden entre ellas). Al despacharlas todas, se libera la data nueva.
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

  return {
    ahora,
    totalNuevas: nuevas.length,
    totalEsperando: esperando.length,
    totalVencidas: vencidas.length,
    hayVencidas,                          // si hay, se bloquea la data nueva
    idsVencidas: vencidas.map((l) => l.id),
    idsUrgentes: urgentes.map((l) => l.id), // marcados "llamar ahora" por el spamer
    hayUrgente: urgentes.length > 0,
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
  const esVencida = c.idsVencidas.includes(leadId);
  const esRepaso = lead.estado === "NO_CONTESTO" || lead.estado === "VOLVER_A_LLAMAR";

  // Las fichas ya trabajadas (no contestó / volver a llamar) SIEMPRE se pueden volver a
  // llamar, aunque no haya llegado su hora: si el cliente le devolvió la llamada al caller,
  // este la retoma en el momento y arranca el contador.
  if (esRepaso) return { ok: true };

  // Data NUEVA: si hay vencidas esperando, esas tienen prioridad y bloquean la data nueva.
  if (c.hayVencidas) {
    return { ok: false, motivo: `Tenés ${c.totalVencidas} contacto(s) para volver a llamar ahora. Llamálos antes de seguir con data nueva.` };
  }

  return { ok: true };
}
