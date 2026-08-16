"use client";
import { useEffect, useState } from "react";

/**
 * Los navegadores NO permiten activar notificaciones sin permiso explícito.
 * Como no se puede forzar, se bloquea el trabajo hasta que el caller lo conceda:
 * `bloqueante` hace que el panel no muestre la cola mientras no esté activo.
 */
export default function Avisador({ bloqueante = false, onListo }: { bloqueante?: boolean; onListo?: (ok: boolean) => void }) {
  const [estado, setEstado] = useState<"cargando" | "listo" | "pedir" | "bloqueado" | "ios" | "no-soportado">("cargando");

  const avisar = (e: typeof estado) => { setEstado(e); onListo?.(e === "listo"); };

  useEffect(() => {
    (async () => {
      const esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const instalada = window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone;
      if (!("serviceWorker" in navigator) || !("PushManager" in window))
        return avisar(esIOS && !instalada ? "ios" : "no-soportado");

      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      if (sub) { await mandar(sub); return avisar("listo"); }
      if (Notification.permission === "denied") return avisar("bloqueado");
      if (Notification.permission === "granted") return suscribir();
      avisar("pedir");
    })();
  }, []);

  async function mandar(sub: PushSubscription) {
    await fetch("/api/push/suscribir", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...sub.toJSON(), agente: navigator.userAgent.slice(0, 120) }),
    });
  }

  async function suscribir() {
    const permiso = await Notification.requestPermission();
    if (permiso !== "granted") return avisar("bloqueado");
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    });
    await mandar(sub);
    avisar("listo");
  }

  if (estado === "cargando" || estado === "listo") return null;

  const caja = bloqueante
    ? { background: "#FBEDE9", border: "1px solid #E0AA9B", color: "#8E3320", borderRadius: 10, padding: 18, marginBottom: 16 }
    : undefined;

  return (
    <div className={bloqueante ? "" : "tip"} style={caja}>
      {estado === "pedir" && (
        <>
          <b>{bloqueante ? "Para empezar a trabajar, activá los avisos." : "Activá los avisos para no perder contactos."}</b>
          <p className="sub" style={{ color: "inherit" }}>
            Sin avisos no vas a enterarte cuando te asignen un contacto. Tu supervisor ve quién los tiene activados.
          </p>
          <button className="btn" style={{ marginTop: 10 }} onClick={suscribir}>Activar avisos ahora</button>
        </>
      )}
      {estado === "ios" && (
        <>
          <b>Instalá la app primero.</b>
          <p className="sub" style={{ color: "inherit" }}>Tocá <b>Compartir</b> → <b>Agregar a inicio</b>, abrí la app desde ese icono y volvé acá.</p>
        </>
      )}
      {estado === "bloqueado" && (
        <>
          <b>Tenés las notificaciones bloqueadas para este sitio.</b>
          <p className="sub" style={{ color: "inherit" }}>
            Tocá el candado 🔒 al lado de la dirección → Notificaciones → Permitir, y recargá la página.
          </p>
        </>
      )}
      {estado === "no-soportado" && <b>Este navegador no soporta avisos. Usá Chrome en Android o instalá la app.</b>}
    </div>
  );
}
