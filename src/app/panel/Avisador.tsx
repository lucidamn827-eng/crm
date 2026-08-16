"use client";
import { useEffect, useState } from "react";

/** Botón que pide permiso y registra el dispositivo para recibir avisos. */
export default function Avisador() {
  const [estado, setEstado] = useState<"cargando" | "listo" | "pedir" | "bloqueado" | "no-soportado" | "ios">("cargando");

  useEffect(() => {
    (async () => {
      const esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const instalada = window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone;
      if (!("serviceWorker" in navigator) || !("PushManager" in window))
        return setEstado(esIOS && !instalada ? "ios" : "no-soportado");

      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      if (sub) return setEstado("listo");
      setEstado(Notification.permission === "denied" ? "bloqueado" : "pedir");
    })();
  }, []);

  async function activar() {
    const permiso = await Notification.requestPermission();
    if (permiso !== "granted") return setEstado("bloqueado");
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    });
    await fetch("/api/push/suscribir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...sub.toJSON(), agente: navigator.userAgent.slice(0, 120) }),
    });
    setEstado("listo");
  }

  if (estado === "cargando" || estado === "listo") return null;
  return (
    <div className="tip">
      {estado === "pedir" && (
        <>
          Activá los avisos para que te suene el teléfono cuando te asignen un contacto.{" "}
          <button className="btn chico" onClick={activar}>Activar avisos</button>
        </>
      )}
      {estado === "ios" && (
        <>En iPhone: tocá <b>Compartir</b> → <b>Agregar a inicio</b>, abrí la app desde ese icono y volvé acá para activar los avisos.</>
      )}
      {estado === "bloqueado" && <>Tenés las notificaciones bloqueadas para este sitio. Habilitalas en los ajustes del navegador y recargá.</>}
      {estado === "no-soportado" && <>Este navegador no soporta avisos. Probá con Chrome en Android o instalando la app en la pantalla de inicio.</>}
    </div>
  );
}
