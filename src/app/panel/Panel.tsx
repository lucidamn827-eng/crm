"use client";
import { useEffect, useState, useCallback, useRef, Fragment } from "react";
import { useRouter } from "next/navigation";
import Avisador from "./Avisador";
import { Marca, Logo } from "../Logo";

import type { Rol } from "@/lib/auth";
// Un solo lugar define los roles: src/lib/auth.ts
type Sesion = { id: string; usuario: string; nombre: string; rol: Rol };
type Lead = {
  id: number; nombre: string; dni: string; telefono: string; nota?: string | null;
  estado: string; intentos: number; enLlamadaDesde?: string | null; creadoEn?: string; actualizadoEn?: string; dispositivo?: string | null; usuarioDisp?: string | null;
  viaContacto?: string | null; agendadoPara?: string | null; reactivaEn?: string | null; urgentePorSpamer?: string | null; seguimiento?: string | null;
  reservadoEn?: string | null;
  asignadoA?: { nombre: string } | null; asignadoAId?: string | null; cargadoPor?: { nombre: string } | null;
  llamadas: { id?: number; nota?: string | null; creadoEn: string; resultado?: string; duracion?: number; motivo?: string | null }[];
};
type Usuario = { id: string; usuario: string; nombre: string; rol: string; telefono?: string | null; telegramId?: string | null; codigoTg?: string | null; notificar: boolean; activo: boolean; encargadoId?: string | null; restringidoEn?: string | null };
type Llamada = { id: number; resultado: string; nota?: string | null; motivo?: string | null; duracion?: number; monto?: number | null; validada?: boolean; anulada?: boolean; creadoEn: string; leadId: number; caller?: { nombre: string }; lead?: { nombre: string; dni: string; telefono: string; cargadoPor?: { nombre: string } } };

const ETI: Record<string, { txt: string; color: string }> = {
  PENDIENTE: { txt: "Sin llamar", color: "var(--petroleo)" },
  NO_CONTESTO: { txt: "No contestó", color: "var(--nocontesto)" },
  ACEPTO: { txt: "Aceptó", color: "var(--acepto)" },
  NO_QUISO: { txt: "No quiso", color: "var(--noquiso)" },
};
const ROL: Record<string, string> = {
  ADMIN: "Administrador", CARGADOR: "Spamer", CALLER: "Caller",
  ENCARGADO: "Encargado de equipo", PROCESADOR: "Procesador de pago",
};

/** Ícono de cada ítem de la barra lateral. Trazo fino, estilo lineal. */
function Icono({ k }: { k: string }) {
  const P: Record<string, React.ReactNode> = {
    envivo: <><circle cx="12" cy="12" r="2" /><path d="M8 8a5.6 5.6 0 0 0 0 8M16 8a5.6 5.6 0 0 1 0 8M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14" /></>,
    monitor: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 20h8M12 17v3" /></>,
    liquidacion: <><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 9v6M18 9v6" /></>,
    personal: <><rect x="4" y="9" width="16" height="11" rx="2" /><path d="M8 9V7a4 4 0 0 1 8 0v2" /></>,
    finanzas: <><path d="M4 19V5M4 19h16" /><path d="M8 15l3-4 3 2 4-6" /></>,
    todos: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M16 6a3 3 0 0 1 0 6M17.5 19a5.5 5.5 0 0 0-3-5" /></>,
    usuarios: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M16 6a3 3 0 0 1 0 6M17.5 19a5.5 5.5 0 0 0-3-5" /></>,
    cola: <><path d="M4 6h16M4 12h16M4 18h10" /></>,
    historial: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    ranking: <><path d="M8 4h8v4a4 4 0 0 1-8 0V4Z" /><path d="M8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3M10 14h4M9 20h6M12 14v6" /></>,
    cielo: <><path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.3A3.5 3.5 0 0 1 17 18H7Z" /></>,
    cargar: <><path d="M12 15V4M8 8l4-4 4 4" /><path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" /></>,
    mias: <><path d="M12 3 3 8l9 5 9-5-9-5Z" /><path d="M3 13l9 5 9-5M3 18l9 5 9-5" /></>,
    supervision: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="2.5" /></>,
    avisos: <><path d="M6 10a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
    meta: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" /></>,
  };
  return <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">{P[k] ?? <circle cx="12" cy="12" r="8" />}</svg>;
}
/** Quita el emoji inicial de una etiqueta ("📡 En vivo" -> "En vivo"). */
const limpiaEti = (t: string) => t.replace(/^[^\p{L}\d]+/u, "").trim();

/** Campanita de notificaciones dentro del CRM (PC y móvil). */
function Campana() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ avisos: any[]; sinLeer: number }>({ avisos: [], sinLeer: 0 });
  const traer = useCallback(() => {
    fetch("/api/avisos").then((r) => (r.ok ? r.json() : null)).then((d) => d && setData({ avisos: d.avisos ?? [], sinLeer: d.sinLeer ?? 0 })).catch(() => {});
  }, []);
  useEffect(() => { traer(); const t = setInterval(traer, 30000); return () => clearInterval(t); }, [traer]);
  async function abrir() {
    const nuevo = !open; setOpen(nuevo);
    if (nuevo && data.sinLeer > 0) {
      await fetch("/api/avisos", { method: "POST" }).catch(() => {});
      setData((d) => ({ ...d, sinLeer: 0 }));
    }
  }
  return (
    <div className="campana-wrap">
      <button className="campana" onClick={abrir} aria-label="Notificaciones">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 10a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>
        {data.sinLeer > 0 && <span className="campana-badge">{data.sinLeer > 9 ? "9+" : data.sinLeer}</span>}
      </button>
      {open && (
        <>
          <div className="campana-velo" onClick={() => setOpen(false)} />
          <div className="campana-panel">
            <div className="campana-cab">Notificaciones</div>
            {data.avisos.length ? data.avisos.map((a) => (
              <div key={a.id} className="campana-item">
                <div>{a.cuerpo}</div>
                <small>{new Date(a.creadoEn).toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</small>
              </div>
            )) : <div className="campana-item" style={{ color: "var(--tinta2)" }}>No tenés notificaciones.</div>}
          </div>
        </>
      )}
    </div>
  );
}
/** Fecha corta con hora, como la usan las tablas: 18/08 14:32 */
const fechaHora = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
const eti = (e: string) => ETI[e] ?? { txt: e, color: "var(--tinta2)" };
/** Placeholder de teléfono oculto en la cola del caller (el número real no llega al navegador). */
const telOculto = (t?: string | null) => {
  const d = (t ?? "").replace(/\D/g, "");
  // Si por algún motivo llega el número (ficha en curso), muestra 2 dígitos; si no, tapa todo.
  return d.length > 2 ? d.slice(0, 2) + "•••••••" : "•••••••••";
};
/** Placeholder de DNI oculto en la cola del caller. */
const dniOculto = (_t?: string | null) => "••••••••";
/** Deja las 2 primeras letras de cada palabra del nombre y tapa el resto: "ROSMERI ALFARO" -> "RO••••• AL••••" */
const nombreOculto = (n?: string | null) =>
  (n ?? "").trim().split(/\s+/).filter(Boolean)
    .map((w) => w.length <= 2 ? w : w.slice(0, 2) + "•".repeat(w.length - 2))
    .join(" ");
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;
const desde = (iso?: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 1000) : 0);

/* Reloj compartido: un solo intervalo para todos los cronómetros. */
function useTicker(activo: boolean) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!activo) return;
    const t = setInterval(() => set((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [activo]);
}

export default function Panel({ sesion }: { sesion: Sesion }) {
  const pestanas: [string, string][] =
    sesion.rol === "PROCESADOR" ? [["envivo", "📡 En vivo"], ["liquidacion", "💵 Mi liquidación"]] :
    sesion.rol === "ENCARGADO" ? [["envivo", "📡 En vivo"], ["liquidacion", "💵 Mi liquidación"], ["todos", "Contactos de mi equipo"]] :
    sesion.rol === "CALLER" ? [["cola", "Mi cola"], ["historial", "Mis llamadas"], ["liquidacion", "💵 Mi liquidación"], ["ranking", "🏆 Ranking"], ["cielo", "☁️ El cielo es el límite"]] :
    sesion.rol === "CARGADOR" ? [["cargar", "Cargar contactos"], ["mias", "Lo que subí"], ["liquidacion", "💵 Mi liquidación"], ["cielo", "☁️ El cielo es el límite"]] :
    [["monitor", "En vivo"], ["supervision", "Supervisión"], ["cargar", "Cargar contactos"], ["todos", "Todos los contactos"], ["usuarios", "Usuarios"], ["avisos", "Avisos"], ["liquidacion", "💵 Liquidación"], ["finanzas", "📊 Finanzas"], ["meta", "🎯 Meta"], ["personal", "🔒 Mis finanzas"], ["ranking", "🏆 Ranking"], ["cielo", "☁️ El cielo es el límite"]];

  const marca =
    sesion.rol === "CALLER" ? { titulo: "Mesa de llamadas", color: "#14532D" } :
    sesion.rol === "CARGADOR" ? { titulo: "Mesa de spamer", color: "#4C1D95" } :
    sesion.rol === "ENCARGADO" ? { titulo: "Encargado de equipo", color: "#0F4C5C" } :
    sesion.rol === "PROCESADOR" ? { titulo: "Procesos de pago", color: "#7A3E12" } :
    { titulo: "Supervisión", color: "#1F2937" };

  const [vista, setVista] = useState(pestanas[0][0]);
  const [colapsada, setColapsada] = useState(false);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [avisosOk, setAvisosOk] = useState(sesion.rol !== "CALLER");
  const [saludo, setSaludo] = useState<any>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [cola, setCola] = useState<any>(null);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const router = useRouter();

  const cargar = useCallback(async () => {
    const r = await fetch("/api/leads");
    // 409 = alguien entró con esta misma cuenta en otro dispositivo.
    if (r.status === 409) return router.push("/?m=desplazada");
    if (r.status === 440) return router.push("/?m=inactividad");
    if (r.status === 423) return router.push("/?m=restringido");
    if (r.status === 401) return router.push("/?m=vencida");
    if (r.ok) { const j = await r.json(); setLeads(j.leads ?? []); setCola(j.cola ?? null); }
    const u = await fetch("/api/usuarios");
    if (u.ok) setUsuarios((await u.json()).usuarios ?? []);
  }, [router, sesion.rol]);

  useEffect(() => {
    cargar();
    // El caller sondea rápido (5s) para que un "cliente urgente" del spamer aparezca
    // casi al instante sin refrescar. Admin cada 10s; otros roles cada 30s.
    const cada = sesion.rol === "ADMIN" ? 10000 : sesion.rol === "CALLER" ? 5000 : 30000;
    const t = setInterval(cargar, cada);
    return () => clearInterval(t);
  }, [cargar, sesion.rol]);

  // Al entrar, le recordamos en qué puesto está: lo primero que ve al abrir la app.
  useEffect(() => {
    if (sesion.rol !== "CALLER") return; // el spamer ya no compite por el 12%
    if (!new URLSearchParams(window.location.search).has("bienvenida")) return;
    window.history.replaceState({}, "", "/panel"); // que no reaparezca al recargar

    fetch("/api/ranking").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d) return;
      const tabla = sesion.rol === "CALLER" ? d.callers : d.spamers;
      const conPuntos = (tabla ?? []).filter((x: any) => x.puntos > 0);
      const i = conPuntos.findIndex((x: any) => x.id === sesion.id);
      const yo = conPuntos[i];
      const primero = conPuntos[0];
      const vigentes = sesion.rol === "CALLER" ? d.bonoVigente?.caller : d.bonoVigente?.spamer;
      setSaludo({
        puesto: i >= 0 ? i + 1 : null,
        puntos: yo?.puntos ?? 0,
        total: conPuntos.length,
        faltan: primero && i > 0 ? primero.puntos - yo.puntos + 1 : 0,
        lider: primero,
        tengoBono: vigentes?.[0]?.id === sesion.id,
        unidad: sesion.rol === "CALLER" ? "clientes que aceptaron" : "contactos subidos",
      });
    });
  }, [sesion]);

  // Latido: deja constancia de quién está realmente con el panel abierto.
  useEffect(() => {
    const latir = () => fetch("/api/latido", { method: "POST" })
      .then((r) => {
        if (r.status === 409) router.push("/?m=desplazada");
        if (r.status === 440) router.push("/?m=inactividad");
        if (r.status === 423) router.push("/?m=restringido");
      })
      .catch(() => {});
    latir();
    const t = setInterval(latir, 60000);
    // Al volver a la app desde otra pestaña o tras desbloquear el teléfono,
    // latimos enseguida: los navegadores frenan los temporizadores en segundo plano.
    const alVolver = () => { if (document.visibilityState === "visible") latir(); };
    document.addEventListener("visibilitychange", alVolver);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", alVolver); };
  }, [router]);

  // Números que "suben": al entrar a una vista, animamos los contadores (.metrica b, .numero)
  // desde 0 hasta su valor. Es puramente visual: el valor final queda idéntico al que pintó React.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const corte = setTimeout(() => {
      const nodos = Array.from(document.querySelectorAll<HTMLElement>(".metrica b, .numero"));
      nodos.forEach((el) => {
        if (el.dataset.cont === "1") return;
        const orig = (el.textContent || "").trim();
        const m = orig.match(/^([^\d-]*)(-?\d[\d.]*)(.*)$/u); // $, %, etc. antes/después; sep. de miles con "."
        if (!m) return;
        const pre = m[1], post = m[3];
        const destino = parseFloat(m[2].replace(/\./g, ""));
        if (!isFinite(destino) || destino === 0 || Math.abs(destino) > 1e9) return;
        el.dataset.cont = "1";
        const t0 = performance.now(), dur = 650;
        const paso = (ahora: number) => {
          const p = Math.min(1, (ahora - t0) / dur);
          const e = 1 - Math.pow(1 - p, 3); // ease-out
          if (p < 1) {
            el.textContent = pre + Math.round(destino * e).toLocaleString("es-AR") + post;
            requestAnimationFrame(paso);
          } else {
            el.textContent = orig; // snap exacto al valor real
          }
        };
        requestAnimationFrame(paso);
      });
    }, 60);
    return () => clearTimeout(corte);
  }, [vista]);

  const salir = async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/"); };

  return (
    <div className={"layout" + (colapsada ? " min" : "")} data-abierto={menuAbierto}>
      <div className="backdrop" onClick={() => setMenuAbierto(false)} />
      <aside className={menuAbierto ? "open" : ""} style={{ background: marca.color }}>
        <div className="aside-top">
          <span className="marca-lat"><Logo size={30} /><span className="marca-txt"><b>Lima Limón</b><small>{marca.titulo}</small></span></span>
          <div className="aside-acc">
            <Campana />
            <button className="sideTg" onClick={() => setColapsada((c) => !c)} aria-label="Colapsar barra" title="Colapsar / expandir">
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{colapsada ? <path d="M9 6l6 6-6 6" /> : <path d="M15 6l-6 6 6 6" />}</svg>
            </button>
          </div>
        </div>
        <nav className="nav">
          {pestanas.map(([k, t]) => (
            <button key={k} className={"navItem" + (vista === k ? " on" : "")} title={limpiaEti(t)}
              onClick={() => { setVista(k); setMenuAbierto(false); }}>
              <Icono k={k} /><span className="navLbl">{limpiaEti(t)}</span>
            </button>
          ))}
        </nav>
        <div className="aside-foot">
          <div className="userBox"><span className="userName">{sesion.nombre}</span><span className="eti">{ROL[sesion.rol]}</span></div>
          <button className="btn sec chico" onClick={salir}><span>Salir</span></button>
        </div>
      </aside>
      <div className="col">
        <header className="barra" style={{ background: marca.color }}>
          <button className="menuBtn" onClick={() => setMenuAbierto(true)} aria-label="Abrir menú">☰</button>
          <Marca size={28} sub={marca.titulo} />
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}><Campana />{sesion.nombre}</span>
        </header>
      <main>
        {saludo && (
          <div className="velo" onClick={() => setSaludo(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ textAlign: "center", maxWidth: 460 }}>
              <span className="rotulo">Ranking de esta semana</span>
              {saludo.puesto ? (
                <>
                  <div style={{ fontSize: 64, lineHeight: 1, margin: "6px 0" }}>
                    {saludo.puesto === 1 ? "🥇" : saludo.puesto === 2 ? "🥈" : saludo.puesto === 3 ? "🥉" : "📊"}
                  </div>
                  <h2>Vas {saludo.puesto}° de {saludo.total}</h2>
                  <p className="sub" style={{ fontSize: 15 }}>
                    Llevás <b className="mono">{saludo.puntos}</b> {saludo.unidad}.
                  </p>
                  {saludo.puesto === 1 ? (
                    <div className="tip" style={{ background: "#EAF6F1", borderLeftColor: "var(--acepto)", color: "#136245", textAlign: "left" }}>
                      <b>Estás 1°.</b> Si la semana cierra así, la próxima cobrás al <b>12%</b>.
                      {saludo.tengoBono && " Y mantenés el bono que ya tenías."}
                    </div>
                  ) : (
                    <div className="tip" style={{ textAlign: "left" }}>
                      Te faltan <b>{saludo.faltan}</b> para pasar a {saludo.lider?.nombre} y quedarte con el <b>12%</b> de la semana que viene.
                      {saludo.tengoBono && <> <b>Ojo:</b> hoy cobrás al 12% y lo perdés si la semana cierra así.</>}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div style={{ fontSize: 64, lineHeight: 1, margin: "6px 0" }}>🚀</div>
                  <h2>Arrancá la semana</h2>
                  <p className="sub" style={{ fontSize: 15 }}>
                    Todavía no sumaste nada. {saludo.lider ? `${saludo.lider.nombre} va adelante con ${saludo.lider.puntos}.` : "La tabla está en cero: el primero que sume, lidera."}
                  </p>
                  <div className="tip" style={{ textAlign: "left" }}>Quien termine 1° el domingo cobra al <b>12%</b> toda la semana siguiente.</div>
                </>
              )}
              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button className="btn" style={{ flex: 1 }} onClick={() => { setVista("ranking"); setSaludo(null); }}>
                  Ver ranking
                </button>
                <button className="btn sec" style={{ flex: 1 }} onClick={() => setSaludo(null)}>A trabajar</button>
              </div>
            </div>
          </div>
        )}
        <Avisador bloqueante={sesion.rol === "CALLER"} onListo={setAvisosOk} />
        {vista === "cola" && (avisosOk
          ? <Cola leads={leads} cola={cola} recargar={cargar} procesadores={usuarios.filter((u) => u.rol === "PROCESADOR" && u.activo)} />
          : <div className="tarjeta"><h2>Avisos desactivados</h2><p className="sub">Tu cola aparece apenas actives las notificaciones. Es obligatorio para trabajar.</p></div>)}
        {vista === "historial" && <Historial soyAdmin={false} />}
        {vista === "cargar" && <Cargar usuarios={usuarios} recargar={cargar} />}
        {vista === "mias" && <TablaLeads leads={leads} editable="spamer" recargar={cargar} />}
        {vista === "todos" && <TablaLeads leads={leads} admin editable="admin" usuarios={usuarios} recargar={cargar} />}
        {vista === "supervision" && <Supervision />}
        {vista === "monitor" && <Monitor leads={leads} usuarios={usuarios} recargar={cargar} />}
        {vista === "envivo" && <EnVivo />}
        {vista === "usuarios" && <Usuarios usuarios={usuarios} recargar={cargar} />}
        {vista === "avisos" && <Avisos />}
        {vista === "ranking" && <Ranking sesion={sesion} />}
        {vista === "cielo" && <Cielo sesion={sesion} />}
        {vista === "liquidacion" && <Liquidacion sesion={sesion} usuarios={usuarios} />}
        {vista === "finanzas" && <Finanzas />}
        {vista === "meta" && <Meta />}
        {vista === "personal" && <Personal />}
      </main>
      </div>
    </div>
  );
}

/* ============ CALLER: cola con confirmación antes de llamar ============ */
function Cola({ leads, cola, recargar, procesadores }: { leads: Lead[]; cola: any; recargar: () => void; procesadores: Usuario[] }) {
  const [nota, setNota] = useState(""), [msg, setMsg] = useState("");
  const [cobro, setCobro] = useState<{ paso: "saco" | "monto" | "sinplata"; monto: string; referencia: string; procesadorId: string; cuentaEmpresa: boolean } | null>(null);
  const [festejo, setFestejo] = useState<any>(null);
  const [noQuisoMenu, setNoQuisoMenu] = useState(false);
  const [motivoOtro, setMotivoOtro] = useState("");
  const [posponiendo, setPosponiendo] = useState(false);
  const [motivoPospone, setMotivoPospone] = useState("");
  const [q, setQ] = useState(""), [resBusca, setResBusca] = useState<any[] | null>(null);

  const enCurso = leads.find((l) => l.enLlamadaDesde);
  const reservada = leads.find((l) => (l as any).reservadoEn && !l.enLlamadaDesde);
  const seguimiento = leads.filter((l) => l.estado === "ACEPTO" && !!l.seguimiento);
  const disponibles: number = cola?.disponibles ?? 0;
  useTicker(!!enCurso || !!reservada);

  // Distribución automática: si no tengo ficha y hay data en el pool, me reservo el siguiente.
  const pidiendo = useRef(false);
  useEffect(() => {
    if (enCurso || reservada || disponibles <= 0 || pidiendo.current) return;
    pidiendo.current = true;
    fetch("/api/leads/siguiente", { method: "POST" })
      .then((r) => r.json()).then(() => { pidiendo.current = false; recargar(); })
      .catch(() => { pidiendo.current = false; });
  }, [enCurso?.id, reservada?.id, disponibles]);

  async function tomar(id: number, si: boolean, motivo?: string) {
    const r = await fetch(`/api/leads/${id}/tomar`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tomar: si, motivo }),
    });
    if (!r.ok) { const j = await r.json().catch(() => ({})); setMsg(j.error ?? "No se pudo. Recargá e intentá de nuevo."); }
    setPosponiendo(false); setMotivoPospone(""); recargar();
  }
  async function registrar(id: number, resultado: string, extra: any = {}) {
    const r = await fetch(`/api/leads/${id}/resultado`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resultado, nota, ...extra }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg(d.error ?? "No se pudo registrar.");
    if (resultado === "ACEPTO") {
      setFestejo({ monto: Number(extra.monto) || 0, comision: (Number(extra.monto) || 0) * 0.1, escalon: d.subioEscalon, revelado: d.revelado });
      setCobro(null);
    } else {
      setMsg(`Registrado: ${eti(resultado).txt}`);
    }
    setNota(""); setNoQuisoMenu(false); setMotivoOtro(""); recargar();
  }
  async function buscar() {
    if (q.trim().length < 3) return;
    const r = await fetch(`/api/leads/buscar?q=${encodeURIComponent(q.trim())}`);
    const d = await r.json().catch(() => ({}));
    setResBusca(d.leads ?? []);
  }
  async function promover(id: number) {
    const r = await fetch(`/api/leads/${id}/promover`, { method: "POST" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg(d.error ?? "No se pudo poner a llamar.");
    setResBusca(null); setQ(""); recargar();
  }

  const MOTIVOS_NO = ["Le pareció caro", "Ya tiene el servicio", "No le interesa", "Desconfía / cree que es estafa", "No es la persona / número equivocado", "Pidió no llamar más"];
  // Advertencia local: hace +5 min que tengo un cliente reservado y no di "Llamar ahora".
  const idleMin = reservada && (reservada as any).reservadoEn
    ? Math.floor((Date.now() - new Date((reservada as any).reservadoEn).getTime()) / 60000) : 0;

  return (
    <>
      {msg && <div className="ok">{msg}</div>}

      {reservada && idleMin >= 5 && !posponiendo && (
        <div className="velo" style={{ zIndex: 100 }}>
          <div className="modal" style={{ maxWidth: 440, textAlign: "center", border: `3px solid ${idleMin >= 10 ? "var(--noquiso)" : "var(--ambar)"}` }}>
            <div style={{ fontSize: 54, lineHeight: 1 }}>{idleMin >= 10 ? "🚫" : "⚠️"}</div>
            {idleMin >= 10 ? (
              <>
                <h2 style={{ color: "var(--noquiso)" }}>El administrador fue notificado</h2>
                <p className="sub" style={{ fontSize: 15 }}>Llevás {idleMin} min sin llamar. En {Math.max(1, 15 - idleMin)} min tu acceso será <b>bloqueado</b>. Llamá al cliente ahora mismo.</p>
              </>
            ) : (
              <>
                <h2 style={{ color: "#8a6d00" }}>Llamá al cliente</h2>
                <p className="sub" style={{ fontSize: 15 }}>Llevás {idleMin} min sin dar “Llamar ahora”. Tus administradores están siendo notificados de la inactividad.</p>
              </>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button className="btn" style={{ flex: 1 }} onClick={() => tomar(reservada.id, true)}>Llamar ahora</button>
              <button className="btn sec" onClick={() => setPosponiendo(true)}>Aún no</button>
            </div>
          </div>
        </div>
      )}

      {cobro && enCurso && (
        <div className="velo">
          <div className="modal" style={{ maxWidth: 460 }}>
            {cobro.paso === "saco" && (
              <>
                <span className="rotulo">Cerrando como aceptó</span>
                <h2>¿Se le sacó algo al cliente?</h2>
                <p className="sub">{enCurso.nombre} · DNI {enCurso.dni}</p>
                <p className="sub" style={{ marginTop: 6 }}>A veces aceptan pero no tienen plata en el momento. Sé honesto: esto ayuda a hacerle seguimiento.</p>
                <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                  <button className="btn" style={{ flex: 1, background: "var(--acepto)" }} onClick={() => setCobro({ ...cobro, paso: "monto" })}>✅ Sí, pagó</button>
                  <button className="btn sec" style={{ flex: 1 }} onClick={() => setCobro({ ...cobro, paso: "sinplata" })}>No pagó (aún)</button>
                </div>
                <button className="btn sec chico" style={{ marginTop: 12 }} onClick={() => setCobro(null)}>Cancelar</button>
              </>
            )}

            {cobro.paso === "monto" && (
              <>
                <span className="rotulo">Cerrando la venta</span>
                <h2>¿Cuánto pagó el cliente?</h2>
                <p className="sub">{enCurso.nombre} · DNI {enCurso.dni}</p>
                <label htmlFor="mto">Monto cobrado en soles *</label>
                <input id="mto" className="mono" inputMode="decimal" autoFocus
                       style={{ fontSize: 26, fontWeight: 700, textAlign: "center" }}
                       placeholder="0.00" value={cobro.monto}
                       onChange={(e) => setCobro({ ...cobro, monto: e.target.value.replace(/[^\d.]/g, "") })} />
                <label style={{ marginTop: 10 }}>¿Cómo pagó?</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" className={`btn ${cobro.cuentaEmpresa ? "sec" : ""}`} style={{ flex: 1 }} onClick={() => setCobro({ ...cobro, cuentaEmpresa: false })}>Pago normal</button>
                  <button type="button" className={`btn ${cobro.cuentaEmpresa ? "" : "sec"}`} style={{ flex: 1 }} onClick={() => setCobro({ ...cobro, cuentaEmpresa: true })}>A cuenta de la empresa</button>
                </div>
                {cobro.cuentaEmpresa && <p className="sub" style={{ marginTop: 4 }}>Pago a cuenta de la empresa: la comisión es del 5% para todos.</p>}
                {!!Number(cobro.monto) && (
                  <p className="sub" style={{ textAlign: "center", marginTop: 6 }}>
                    Tu comisión: <b className="mono" style={{ color: "var(--acepto)", fontSize: 17 }}>
                      S/ {(Number(cobro.monto) * (cobro.cuentaEmpresa ? 0.05 : 0.1)).toFixed(2)}
                    </b>
                  </p>
                )}
                {!!procesadores.length && (
                  <>
                    <label htmlFor="proc">¿Quién procesó el pago? *</label>
                    <select id="proc" value={cobro.procesadorId} onChange={(e) => setCobro({ ...cobro, procesadorId: e.target.value })}>
                      <option value="">Elegí el procesador…</option>
                      {procesadores.map((pr) => <option key={pr.id} value={pr.id}>{pr.nombre}</option>)}
                    </select>
                  </>
                )}
                <label htmlFor="ref">N° de operación o voucher (opcional)</label>
                <input id="ref" className="mono" placeholder="Ej: 0098234" value={cobro.referencia}
                       onChange={(e) => setCobro({ ...cobro, referencia: e.target.value })} />
                <div className="tip">Tu supervisor revisa y valida cada venta.</div>
                <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                  <button className="btn" style={{ flex: 1 }}
                          disabled={!(Number(cobro.monto) > 0) || (!!procesadores.length && !cobro.procesadorId)}
                          onClick={() => registrar(enCurso.id, "ACEPTO", {
                            monto: Number(cobro.monto), referencia: cobro.referencia, procesadorId: cobro.procesadorId || null,
                            cuentaEmpresa: cobro.cuentaEmpresa,
                          })}>
                    Confirmar venta
                  </button>
                  <button className="btn sec" onClick={() => setCobro({ ...cobro, paso: "saco" })}>← Volver</button>
                </div>
              </>
            )}

            {cobro.paso === "sinplata" && (
              <>
                <span className="rotulo">Aceptó pero no pagó</span>
                <h2>¿Qué pasó?</h2>
                <p className="sub">{enCurso.nombre} · DNI {enCurso.dni}</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                  <button className="btn sec" style={{ textAlign: "left" }}
                          onClick={() => registrar(enCurso.id, "ACEPTO", { monto: 0, seguimiento: "MISIO" })}>
                    😶 Misio — no tiene nada. <span className="sub">Queda cerrado.</span>
                  </button>
                  <button className="btn sec" style={{ textAlign: "left", borderColor: "#9b59b6" }}
                          onClick={() => registrar(enCurso.id, "ACEPTO", { monto: 0, seguimiento: "SE_FUE_A_0" })}>
                    🟣 Se fue a poner a 0 — va a volver. <span className="sub">Seguimiento (morado).</span>
                  </button>
                  <button className="btn sec" style={{ textAlign: "left", borderColor: "#d4a017" }}
                          onClick={() => registrar(enCurso.id, "ACEPTO", { monto: 0, seguimiento: "NO_BANCA" })}>
                    🟡 No quiso entrar a su banca. <span className="sub">Seguimiento (amarillo).</span>
                  </button>
                </div>
                <div className="tip" style={{ marginTop: 10 }}>Cuenta como venta aceptada con monto S/0. Cuando el cliente pague, editás el monto desde “Mis llamadas”.</div>
                <button className="btn sec chico" style={{ marginTop: 12 }} onClick={() => setCobro({ ...cobro, paso: "saco" })}>← Volver</button>
              </>
            )}
          </div>
        </div>
      )}

      {festejo && (
        <div className="velo" onClick={() => setFestejo(null)}>
          <div className="modal" style={{ maxWidth: 420, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 62, lineHeight: 1 }}>{festejo.escalon ? "☁️" : "🎉"}</div>
            <h2>{festejo.escalon ? "¡Subiste de escalón!" : "¡Venta cerrada!"}</h2>
            <p className="sub" style={{ fontSize: 15 }}>Cobraste S/ {festejo.monto.toFixed(2)} al cliente.</p>
            {festejo.revelado && (
              <div className="tip" style={{ textAlign: "left" }}>
                Cliente: <b>{festejo.revelado.cliente}</b> · DNI {festejo.revelado.dni}<br />
                Esta data la movió <b>{festejo.revelado.spamer}</b> (se le acredita automáticamente).
              </div>
            )}
            <div style={{ margin: "14px 0" }}>
              <span className="rotulo">Tu comisión</span>
              <div className="mono" style={{ fontSize: 40, fontWeight: 700, color: "var(--acepto)", lineHeight: 1.1 }}>
                S/ {festejo.comision.toFixed(2)}
              </div>
            </div>
            {festejo.escalon && (
              <div className="tip" style={{ background: "#EAF6F1", borderLeftColor: "var(--acepto)", color: "#136245" }}>
                Llegaste a <b>{festejo.escalon.total}</b> aceptados: tenés asegurado un bono de{" "}
                <b>S/ {festejo.escalon.bono}</b> esta semana.
              </div>
            )}
            <button className="btn" style={{ width: "100%", marginTop: 14 }} onClick={() => setFestejo(null)}>
              Seguir llamando
            </button>
          </div>
        </div>
      )}

      {enCurso ? (
        <div className="tarjeta">
          <div className="ficha-cab">
            <div>
              <span className="rotulo" style={{ color: "#9FC9D2" }}>En llamada · ficha {String(enCurso.id).padStart(4, "0")}</span>
              <div style={{ fontSize: 19, fontWeight: 700 }}>{enCurso.nombre}</div>
            </div>
            <span className="cronometro">{mmss(desde(enCurso.enLlamadaDesde))}</span>
          </div>
          <span className="rotulo">Tocá el número para llamar</span>
          <a className="numero" href={`tel:${(enCurso.telefono || "").replace(/\D/g, "")}`}>{enCurso.telefono}</a>
          <p className="sub">DNI <span className="mono">{enCurso.dni}</span> · {enCurso.intentos} intento(s) · cargada el {fechaHora(enCurso.creadoEn)}</p>
          {enCurso.nota && <p style={{ marginTop: 8 }}><b>Nota:</b> {enCurso.nota}</p>}
          <label>Nota de la llamada</label>
          <textarea value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej: pidió que lo llamen después de las 18 h" />
          {noQuisoMenu ? (
            <div className="tarjeta" style={{ background: "var(--papel)", marginTop: 8 }}>
              <b>¿Por qué no quiso? (obligatorio)</b>
              <p className="sub" style={{ marginTop: 2 }}>Elegí el motivo. Queda registrado para el admin.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                {MOTIVOS_NO.map((m) => (
                  <button key={m} className="btn sec" style={{ textAlign: "left" }} onClick={() => registrar(enCurso.id, "NO_QUISO", { motivo: m })}>{m}</button>
                ))}
                <div style={{ padding: "10px", border: "1px solid var(--linea)", borderRadius: 8 }}>
                  <label>Otro motivo</label>
                  <input value={motivoOtro} onChange={(e) => setMotivoOtro(e.target.value)} placeholder="Escribí el motivo…" />
                  <button className="btn" style={{ marginTop: 8, width: "100%" }} disabled={!motivoOtro.trim()}
                          onClick={() => registrar(enCurso.id, "NO_QUISO", { motivo: motivoOtro.trim() })}>
                    Registrar con este motivo
                  </button>
                </div>
                <button className="btn sec chico" onClick={() => setNoQuisoMenu(false)}>← Volver</button>
              </div>
            </div>
          ) : (
            <div className="resultados">
              <button className="res a" onClick={() => setCobro({ paso: "saco", monto: "", referencia: "", procesadorId: procesadores.length === 1 ? procesadores[0].id : "", cuentaEmpresa: false })}>Aceptó</button>
              <button className="res n" onClick={() => registrar(enCurso.id, "NO_CONTESTO")}>No contestó</button>
              <button className="res x" onClick={() => setNoQuisoMenu(true)}>No quiso</button>
            </div>
          )}
        </div>
      ) : reservada ? (
        <div className="tarjeta" style={{ borderLeft: "5px solid var(--lima-acento)" }}>
          {posponiendo ? (
            <>
              <b>¿Por qué aún no vas a llamar?</b>
              <p className="sub" style={{ marginTop: 2 }}>Queda registrado y se le avisa al administrador.</p>
              <input value={motivoPospone} onChange={(e) => setMotivoPospone(e.target.value)} placeholder="Ej: estoy terminando otra gestión" style={{ marginTop: 8 }} />
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button className="btn" disabled={!motivoPospone.trim()} onClick={() => tomar(reservada.id, false, motivoPospone.trim())}>Enviar</button>
                <button className="btn sec" onClick={() => { setPosponiendo(false); setMotivoPospone(""); }}>Cancelar</button>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 34, lineHeight: 1 }}>{(reservada as any).urgente ? "🚨" : "📞"}</div>
              {(reservada as any).urgente
                ? <b style={{ fontSize: 18, color: "var(--noquiso)" }}>Tenés una llamada urgente asignada por tu administrador</b>
                : <b style={{ fontSize: 18 }}>Tenés un nuevo cliente para llamar</b>}
              <p className="sub" style={{ marginTop: 4 }}>Data cargada el {fechaHora(reservada.creadoEn)}. Al dar “Llamar ahora” se destapan el número y el DNI, y arranca el cronómetro.</p>
              <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                <button className="btn" onClick={() => tomar(reservada.id, true)}>Llamar ahora</button>
                {!(reservada as any).urgente && <button className="btn sec" onClick={() => setPosponiendo(true)}>Aún no</button>}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="tip">
          {disponibles > 0 ? "Buscando el siguiente cliente para vos…" : "No hay data para llamar en este momento. En cuanto entre data nueva, te salta el próximo cliente."}
        </div>
      )}

      <div className="tarjeta">
        <b>¿Un cliente te devolvió la llamada?</b>
        <p className="sub" style={{ marginTop: 2 }}>Buscá un contacto que antes no contestó (o no quiso) por teléfono, DNI o nombre y ponelo a llamar ahora.</p>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && buscar()} placeholder="Teléfono, DNI o nombre" />
          <button className="btn sec" onClick={buscar}>Buscar</button>
        </div>
        {resBusca && (
          <div className="tabla-scroll" style={{ marginTop: 10 }}><table><tbody>
            <tr><th>Contacto</th><th>Teléfono</th><th>Estado</th><th>Intentos</th><th /></tr>
            {resBusca.map((l: any) => (
              <tr key={l.id}>
                <td><b>{l.nombre}</b></td>
                <td className="mono">{l.telefono}</td>
                <td><span className="eti" style={{ color: eti(l.estado).color, borderColor: eti(l.estado).color }}>{eti(l.estado).txt}</span></td>
                <td className="mono">{l.intentos}</td>
                <td><button className="btn chico" disabled={!!l.asignadoAId || !!enCurso} onClick={() => promover(l.id)}>Poner a llamar</button></td>
              </tr>
            ))}
            {!resBusca.length && <tr><td colSpan={5} style={{ color: "var(--tinta2)" }}>No se encontró nada con esa búsqueda.</td></tr>}
          </tbody></table></div>
        )}
      </div>

      {seguimiento.length > 0 && (
        <div className="tarjeta">
          <h2>En seguimiento · {seguimiento.length}</h2>
          <p className="sub">Aceptaron pero no pagaron aún. Cuando cobres, editás el monto desde “Mis llamadas”.</p>
          <div className="tabla-scroll"><table><tbody>
            <tr><th>Contacto</th><th>Teléfono</th><th>Estado</th></tr>
            {seguimiento.map((l) => (
              <tr key={l.id} style={{ background: l.seguimiento === "SE_FUE_A_0" ? "#EDE3F7" : l.seguimiento === "NO_BANCA" ? "#FBF3D0" : undefined }}>
                <td><b>{l.nombre}</b></td>
                <td className="mono">{l.telefono}</td>
                <td>{l.seguimiento === "SE_FUE_A_0" ? "Se fue a 0" : l.seguimiento === "NO_BANCA" ? "No entró a banca" : "Seguimiento"}</td>
              </tr>
            ))}
          </tbody></table></div>
        </div>
      )}
    </>
  );
}

/* ============ HISTORIAL: una fila por contacto, no por intento ============ */
function Historial({ soyAdmin }: { soyAdmin: boolean }) {
  const [llamadas, setLlamadas] = useState<Llamada[]>([]);
  const [abierto, setAbierto] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "ACEPTO" | "NO_QUISO">("todos");
  const traer = useCallback(() => {
    fetch("/api/llamadas").then((r) => (r.ok ? r.json() : { llamadas: [] })).then((d) => setLlamadas(d.llamadas ?? []));
  }, []);
  useEffect(() => { traer(); }, [traer]);

  async function editarMonto(llamadaId: number, actual: number) {
    const v = prompt("Nuevo monto en soles (el cliente pidió más o pagó):", String(actual ?? 0));
    if (v === null) return;
    const m = Number(v.replace(/[^\d.]/g, ""));
    if (!Number.isFinite(m) || m < 0) return alert("Monto inválido.");
    const r = await fetch("/api/llamadas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: llamadaId, monto: m }) });
    const d = await r.json();
    if (!r.ok) return alert(d.error ?? "No se pudo cambiar.");
    traer();
  }
  async function reabrir(llamadaId: number) {
    if (!confirm("¿Volver a poner este contacto en tu cola para llamarlo de nuevo?")) return;
    const r = await fetch("/api/llamadas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: llamadaId, reabrir: true }) });
    const d = await r.json();
    if (!r.ok) return alert(d.error ?? "No se pudo reabrir.");
    traer();
  }

  // Agrupo por contacto: la última llamada manda, las anteriores quedan como intentos.
  const porLead = new Map<number, Llamada[]>();
  llamadas.forEach((l) => porLead.set(l.leadId, [...(porLead.get(l.leadId) ?? []), l]));
  const todas = [...porLead.values()].map((ls) => ({ ultima: ls[0], intentos: ls, total: ls.length }));
  // "Mis llamadas" muestra los cerrados: aceptaron y no quisieron.
  const cerradas = todas.filter((f) => f.ultima.resultado === "ACEPTO" || f.ultima.resultado === "NO_QUISO");
  const acep = cerradas.filter((f) => f.ultima.resultado === "ACEPTO").length;
  const noq = cerradas.filter((f) => f.ultima.resultado === "NO_QUISO").length;

  // Búsqueda por nombre (ignora tildes/orden), DNI o teléfono + filtro por resultado.
  const norm = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const termino = norm(q.trim());
  const digitos = q.replace(/\D/g, "");
  const filas = cerradas.filter((f) => {
    if (filtro !== "todos" && f.ultima.resultado !== filtro) return false;
    if (!q.trim()) return true;
    const l = f.ultima.lead;
    const nombreOk = termino && norm(l?.nombre ?? "").split(/\s+/).every((p) => !termino.split(/\s+/).some((t) => !norm(l?.nombre ?? "").includes(t))) && termino.split(/\s+/).every((t) => norm(l?.nombre ?? "").includes(t));
    const dniOk = digitos && (l?.dni ?? "").includes(digitos);
    const telOk = digitos && (l?.telefono ?? "").replace(/\D/g, "").includes(digitos);
    return nombreOk || dniOk || telOk;
  });

  return (
    <>
      <div className="grid4">
        <div className="metrica"><span className="rotulo">Cerrados</span><b>{cerradas.length}</b></div>
        <div className="metrica"><span className="rotulo">Aceptaron</span><b>{acep}</b></div>
        <div className="metrica"><span className="rotulo">No quisieron</span><b>{noq}</b></div>
        <div className="metrica"><span className="rotulo">Efectividad</span><b>{cerradas.length ? Math.round((acep / cerradas.length) * 100) : 0}%</b></div>
      </div>
      <div className="tarjeta">
        <h2>Mis llamadas</h2>
        <p className="sub">Los contactos que cerraste: aceptaron y no quisieron. Buscá por nombre, DNI o teléfono.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0" }}>
          <input placeholder="Buscar por nombre, DNI o teléfono…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
          <select value={filtro} onChange={(e) => setFiltro(e.target.value as any)} style={{ width: "auto" }}>
            <option value="todos">Todos</option>
            <option value="ACEPTO">Aceptaron</option>
            <option value="NO_QUISO">No quisieron</option>
          </select>
          <span className="sub" style={{ alignSelf: "center" }}>{filas.length} contacto(s)</span>
        </div>
        <div className="tabla-scroll"><table><tbody>
          <tr><th>Última llamada</th><th>Contacto</th><th>DNI</th><th>Teléfono</th><th>Spamer</th><th>Resultado</th><th>Monto</th><th>Intentos</th><th /></tr>
          {filas.map((f) => (
            <Fragment key={f.ultima.leadId}>
              <tr>
                <td className="mono">{new Date(f.ultima.creadoEn).toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                <td><b>{f.ultima.lead?.nombre}</b></td>
                <td className="mono">{f.ultima.lead?.dni}</td>
                <td className="mono">{f.ultima.lead?.telefono}</td>
                <td>{f.ultima.lead?.cargadoPor?.nombre ?? "—"}</td>
                <td><span className="eti" style={{ color: eti(f.ultima.resultado).color, borderColor: eti(f.ultima.resultado).color }}>{eti(f.ultima.resultado).txt}</span></td>
                <td className="mono">{f.ultima.resultado === "ACEPTO" ? soles(f.ultima.monto ?? 0) : (f.ultima.motivo ?? "—")}</td>
                <td>
                  <button className="btn sec chico" onClick={() => setAbierto(abierto === f.ultima.leadId ? null : f.ultima.leadId)}>
                    {f.total} {abierto === f.ultima.leadId ? "▲" : "▼"}
                  </button>
                </td>
                <td>
                  {!soyAdmin && !f.ultima.validada && !f.ultima.anulada && f.ultima.resultado === "ACEPTO" &&
                    <button className="btn sec chico" onClick={() => editarMonto(f.ultima.id, f.ultima.monto ?? 0)}>Editar monto</button>}
                  {!soyAdmin && !f.ultima.validada && !f.ultima.anulada && f.ultima.resultado === "NO_QUISO" &&
                    <button className="btn sec chico" onClick={() => reabrir(f.ultima.id)}>Volver a llamar</button>}
                </td>
              </tr>
              {abierto === f.ultima.leadId && f.intentos.map((i) => (
                <tr key={i.id} style={{ background: "#F6F9FB" }}>
                  <td className="mono" style={{ paddingLeft: 24 }}>{new Date(i.creadoEn).toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                  <td colSpan={4} style={{ color: "var(--tinta2)" }}>intento previo</td>
                  <td><span className="eti" style={{ color: eti(i.resultado).color, borderColor: eti(i.resultado).color }}>{eti(i.resultado).txt}</span></td>
                  <td className="mono">{i.resultado === "ACEPTO" ? soles(i.monto ?? 0) : (i.motivo ?? "—")}</td>
                  <td /><td />
                </tr>
              ))}
            </Fragment>
          ))}
          {!filas.length && <tr><td colSpan={9} style={{ color: "var(--tinta2)" }}>{q.trim() || filtro !== "todos" ? "No hay contactos que coincidan." : "Todavía no cerraste llamadas."}</td></tr>}
        </tbody></table></div>
      </div>
    </>
  );
}

/* ============ ADMIN: monitor en vivo ============ */
function Monitor({ leads, usuarios, recargar }: { leads: Lead[]; usuarios: Usuario[]; recargar: () => void }) {
  useTicker(true);
  // Quién está en llamada se toma del servidor (sirve aunque el contacto sea viejo y no esté en la lista reciente).
  const [vivo, setVivo] = useState<any>({ callers: [], enLlamada: 0 });
  const [libres, setLibres] = useState<any>({ callers: [], libresAhora: [] });
  useEffect(() => {
    const traer = () => {
      fetch("/api/envivo").then((r) => (r.ok ? r.json() : null)).then((d) => d && setVivo(d));
      fetch("/api/asistencia?dias=1").then((r) => (r.ok ? r.json() : null)).then((d) => d && setLibres(d));
    };
    traer(); const t = setInterval(traer, 10000); return () => clearInterval(t);
  }, []);
  const estadoVivo = (id: string) => libres.callers?.find((c: any) => c.id === id);
  const filas: any[] = vivo.callers ?? [];

  async function liberar(leadId: number) {
    await fetch(`/api/leads/${leadId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ liberar: true }) });
    setVivo((v: any) => ({ ...v, callers: (v.callers ?? []).map((x: any) => x.leadId === leadId ? { ...x, enLlamada: false, leadId: null } : x) }));
    recargar();
  }

  return (
    <>
      {libres.libresAhora?.length > 0 && (
        <div className="tarjeta" style={{ borderLeft: "5px solid var(--noquiso)", background: "#FDEDEC", marginBottom: 12 }}>
          <b style={{ color: "var(--noquiso)" }}>🔴 Conectados sin llamar: {libres.libresAhora.join(", ")}</b>
          <p className="sub" style={{ marginTop: 2 }}>Están en el sistema pero llevan rato sin marcar. Avisá al encargado.</p>
        </div>
      )}
      <div className="grid4">
        <div className="metrica"><span className="rotulo">Callers en llamada</span><b>{vivo.enLlamada ?? 0}</b></div>
        <div className="metrica"><span className="rotulo">Callers conectados</span><b>{vivo.conectados ?? 0}</b></div>
        <div className="metrica"><span className="rotulo">Fichas pendientes</span><b>{leads.filter((l) => ["PENDIENTE", "NO_CONTESTO"].includes(l.estado)).length}</b></div>
        <div className="metrica"><span className="rotulo">Aceptaron</span><b>{leads.filter((l) => l.estado === "ACEPTO").length}</b></div>
      </div>

      <div className="tarjeta">
        <h2>Quién está llamando ahora</h2>
        <p className="sub">Se actualiza solo cada 10 segundos.</p>
        <div className="tabla-scroll"><table><tbody>
          <tr><th>Caller</th><th>Estado</th><th>Contacto</th><th>Spamer</th><th>Teléfono</th><th>Tiempo</th><th /></tr>
          {filas.map((v) => {
            const ev = estadoVivo(v.id);
            return (
              <tr key={v.id}>
                <td><b>{v.nombre}</b></td>
                <td>
                  {v.enLlamada
                    ? <span className="eti" style={{ color: v.colgada ? "var(--ambar)" : "var(--acepto)", borderColor: v.colgada ? "var(--ambar)" : "var(--acepto)" }}>● {v.colgada ? "llamada colgada" : "En llamada"}</span>
                    : ev?.callLibre
                      ? <span className="eti" style={{ color: "var(--noquiso)", borderColor: "var(--noquiso)" }}>⚠ conectado sin llamar</span>
                      : v.conectado
                        ? <span className="eti" style={{ color: "var(--ambar)", borderColor: "var(--ambar)" }}>entre llamadas</span>
                        : <span className="eti" style={{ color: "var(--tinta2)", borderColor: "var(--linea)" }}>desconectado</span>}
                </td>
                <td>{v.enLlamada ? `${v.cliente} (DNI ${v.dni})` : "—"}</td>
                <td>{v.enLlamada ? (v.spamer ?? "—") : "—"}</td>
                <td className="mono">{v.enLlamada ? v.telefono : "—"}</td>
                <td className="mono" style={{ fontSize: 16, fontWeight: 600 }}>{v.enLlamada && v.desde ? mmss(desde(v.desde)) : "—"}</td>
                <td>{v.enLlamada && v.leadId && <button className="btn sec chico" onClick={() => liberar(v.leadId)}>Liberar ficha</button>}</td>
              </tr>
            );
          })}
          {!filas.length && <tr><td colSpan={7} style={{ color: "var(--tinta2)" }}>No hay callers activos.</td></tr>}
        </tbody></table></div>
        <div className="tip">“Liberar ficha” devuelve el contacto a la cola si un caller se quedó trabado o cerró la app en medio de una llamada.</div>
      </div>
    </>
  );
}

/* ============ CARGA DE CONTACTOS ============ */
function Cargar({ usuarios, recargar }: { usuarios: Usuario[]; recargar: () => void }) {
  const vacio = { nombre: "", dni: "", telefono: "", nota: "", dispositivo: "", usuarioDisp: "" };
  const [f, setF] = useState(vacio);
  const [msg, setMsg] = useState<any>(null);
  const [estado, setEstado] = useState<any>(null); // spamer: {hoy,tope,faltan,lleno,porLlegar} · admin: {esAdmin,spamers,pool}
  const [urgente, setUrgente] = useState(false);
  const [callerId, setCallerId] = useState("");
  const callers = usuarios.filter((u) => u.rol === "CALLER" && u.activo);
  const num = (t: string) => t.replace(/\D/g, "");

  const traerCarga = useCallback(() => {
    fetch("/api/carga").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setEstado(d); });
  }, []);
  useEffect(() => { traerCarga(); }, [traerCarga]);

  const esAdmin = !!estado?.esAdmin;
  const bloqueado = !esAdmin && !!estado?.lleno;
  const faltan = !f.nombre.trim() || num(f.dni).length < 6 || num(f.telefono).length < 6 || !f.dispositivo.trim();

  async function solicitarMas() {
    await fetch("/api/carga", { method: "POST" });
    setMsg({ ok: "Pedido enviado al administrador. Te habilitará más cuando pueda." });
  }
  async function enviar(cuerpo: any) {
    const r = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
    const d = await r.json();
    setMsg(r.ok ? d : { error: d.error });
    recargar(); traerCarga();
  }

  return (
    <>
      {/* Estado de subida del spamer */}
      {!esAdmin && estado && estado.tope !== null && (
        <div className="tarjeta" style={{ borderLeft: `5px solid ${estado.lleno ? "var(--noquiso)" : estado.porLlegar ? "var(--ambar)" : "var(--acepto)"}` }}>
          <b>Tu subida de hoy: {estado.hoy}/{estado.tope}</b>
          <div className="barra" style={{ marginTop: 6 }}><span style={{ width: `${Math.min(100, (estado.hoy / Math.max(1, estado.tope)) * 100)}%`, background: estado.lleno ? "var(--noquiso)" : estado.porLlegar ? "var(--ambar)" : "var(--acepto)" }} /></div>
          {estado.lleno
            ? <div className="error" style={{ marginTop: 8 }}>Llegaste a tu tope de subida de hoy. Tu acceso para subir data queda limitado. <button className="btn chico" style={{ marginTop: 6, display: "block" }} onClick={solicitarMas}>Solicitar más al administrador</button></div>
            : estado.porLlegar
              ? <div className="tip" style={{ marginTop: 8 }}>Te quedan {estado.faltan} para llegar a tu tope diario.</div>
              : null}
        </div>
      )}

      {/* Resumen del admin */}
      {esAdmin && estado && (
        <div className="tarjeta">
          <h2>Data en el pool</h2>
          <div className="grid4">
            <div className="metrica"><span className="rotulo">Sin llamar</span><b>{estado.pool?.sinLlamar ?? 0}</b></div>
            <div className="metrica"><span className="rotulo">No contestó</span><b>{estado.pool?.noContesto ?? 0}</b></div>
            <div className="metrica"><span className="rotulo">No quiso</span><b>{estado.pool?.noQuiso ?? 0}</b></div>
            <div className="metrica"><span className="rotulo">Total para llamar</span><b>{estado.pool?.total ?? 0}</b></div>
          </div>
        </div>
      )}

      <div className="tarjeta">
        <h2>Cargar un contacto</h2>
        <p className="sub">Los campos con <b style={{ color: "var(--noquiso)" }}>*</b> son obligatorios. La data va al pool y el sistema se la reparte sola a los callers.</p>
        <div className="grid2">
          <div>
            <label>Nombre y apellido <b style={{ color: "var(--noquiso)" }}>*</b></label>
            <input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Ej: Carla Méndez" disabled={bloqueado} />
          </div>
          <div>
            <label>DNI <b style={{ color: "var(--noquiso)" }}>*</b></label>
            <input className="mono" inputMode="numeric" value={f.dni} onChange={(e) => setF({ ...f, dni: e.target.value })} placeholder="Solo números" disabled={bloqueado} />
            {!!f.dni && num(f.dni).length < 6 && <p className="sub" style={{ color: "var(--noquiso)" }}>El DNI es muy corto.</p>}
          </div>
          <div>
            <label>Teléfono <b style={{ color: "var(--noquiso)" }}>*</b></label>
            <input className="mono" inputMode="tel" value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} placeholder="Ej: 987 654 321" disabled={bloqueado} />
          </div>
          <div>
            <label>Dispositivo desde el que se le escribió <b style={{ color: "var(--noquiso)" }}>*</b></label>
            <input value={f.dispositivo} onChange={(e) => setF({ ...f, dispositivo: e.target.value })} placeholder="Ej: Samsung A10 - línea Claro 2" disabled={bloqueado} />
          </div>
          <div>
            <label>Usuario/cuenta de ese dispositivo</label>
            <input value={f.usuarioDisp} onChange={(e) => setF({ ...f, usuarioDisp: e.target.value })} placeholder="Ej: WhatsApp Business 2 (opcional)" disabled={bloqueado} />
          </div>
        </div>
        <label>Nota</label>
        <textarea value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} disabled={bloqueado} />

        {esAdmin && (
          <div className="tarjeta" style={{ background: "var(--papel)", marginTop: 10, borderLeft: `4px solid ${urgente ? "var(--noquiso)" : "var(--linea)"}` }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={urgente} onChange={(e) => setUrgente(e.target.checked)} />
              <b>🚨 Llamada urgente (asignar a un caller)</b>
            </label>
            {urgente && (
              <div style={{ marginTop: 8 }}>
                <p className="sub">No va al pool: se le reserva a este caller y le salta apenas quede libre.</p>
                <select value={callerId} onChange={(e) => setCallerId(e.target.value)}>
                  <option value="">Elegí el caller…</option>
                  {callers.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
            )}
          </div>
        )}

        {msg?.error && <div className="error">{msg.error}</div>}
        {msg?.ok && <div className="ok">{msg.ok}</div>}
        {msg?.creados > 0 && <div className="ok">{msg.creados} contacto(s) cargados {urgente ? "como urgentes." : "al pool."}{msg.tope !== null && msg.faltan !== null ? ` Te quedan ${msg.faltan} de tu tope.` : ""}</div>}
        {msg?.rechazados?.length > 0 && <div className="error">Rechazados: {msg.rechazados.join(" · ")}</div>}
        {msg?.avisos?.length > 0 && <div className="tip">{msg.avisos.join(" · ")}</div>}
        <button className="btn" style={{ marginTop: 14, background: urgente ? "var(--noquiso)" : undefined }} disabled={faltan || bloqueado || (urgente && !callerId)}
                onClick={() => { enviar({ ...f, urgente: esAdmin && urgente, callerId: esAdmin && urgente ? callerId : undefined }); setF({ ...vacio, dispositivo: f.dispositivo, usuarioDisp: f.usuarioDisp }); }}>
          {bloqueado ? "Llegaste a tu tope de hoy" : faltan ? "Completá nombre, DNI, teléfono y dispositivo" : (urgente ? (callerId ? "🚨 Asignar llamada urgente" : "Elegí el caller") : "Subir al pool")}
        </button>
      </div>
    </>
  );
}

/* ============ TABLA DE CONTACTOS (con edición para el admin) ============ */
function TablaLeads({ leads, admin, editable, usuarios, recargar }:
  { leads: Lead[]; admin?: boolean; editable?: "admin" | "spamer"; usuarios?: Usuario[]; recargar?: () => void }) {
  const [edit, setEdit] = useState<Lead | null>(null);
  const [form, setForm] = useState<any>({});
  const [msg, setMsg] = useState("");
  const [texto, setTexto] = useState("");
  const [verHist, setVerHist] = useState<number | null>(null); // ficha con historial abierto
  const [fCaller, setFCaller] = useState(""), [fSpamer, setFSpamer] = useState(""), [fEstado, setFEstado] = useState("");
  useTicker(!!admin);

  // Busca por nombre, DNI, teléfono o N° de ficha. Ignora tildes y mayúsculas,
  // y busca cada palabra por separado ("perez juan" encuentra "JUAN PEREZ").
  const limpiar = (x: string) => (x ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const t = limpiar(texto.trim());
  const digitos = t.replace(/\D/g, "");
  const palabras = t.split(/\s+/).filter(Boolean);

  const coincide = (l: Lead) => {
    if (!t) return true;
    const nombre = limpiar(l.nombre);
    // Todas las palabras tienen que estar en el nombre, en cualquier orden.
    if (palabras.length && palabras.every((p) => nombre.includes(p))) return true;
    // También busca por dispositivo / usuario del dispositivo.
    const disp = limpiar(`${l.dispositivo ?? ""} ${l.usuarioDisp ?? ""}`);
    if (palabras.length && palabras.every((p) => disp.includes(p))) return true;
    // Solo comparo contra números si escribió al menos un dígito.
    if (digitos) {
      if ((l.dni ?? "").includes(digitos)) return true;
      if (l.telefono.replace(/\D/g, "").includes(digitos)) return true;
      if (String(l.id).padStart(4, "0").includes(digitos)) return true;
    }
    return false;
  };

  const filtrados = leads.filter((l) =>
    coincide(l) &&
    (!fCaller || l.asignadoA?.nombre === fCaller) &&
    (!fSpamer || l.cargadoPor?.nombre === fSpamer) &&
    (!fEstado || l.estado === fEstado)
  );
  const nombresDe = (sel: (l: Lead) => string | undefined) => [...new Set(leads.map(sel).filter(Boolean))] as string[];

  function abrir(l: Lead) {
    setEdit(l);
    setForm({ nombre: l.nombre, dni: l.dni, telefono: l.telefono, nota: l.nota ?? "", dispositivo: l.dispositivo ?? "", usuarioDisp: l.usuarioDisp ?? "", asignadoAId: l.asignadoAId, estado: l.estado });
  }
  async function guardar() {
    const cuerpo = editable === "admin" ? form
      : { nombre: form.nombre, dni: form.dni, telefono: form.telefono, nota: form.nota, dispositivo: form.dispositivo, usuarioDisp: form.usuarioDisp };
    const r = await fetch(`/api/leads/${edit!.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
    const d = await r.json();
    if (!r.ok) return setMsg(d.error ?? "No se pudo guardar.");
    setEdit(null); setMsg(""); recargar?.();
  }
  async function borrar() {
    if (!confirm(`¿Eliminar la ficha de ${edit!.nombre}? Se borra también su historial de llamadas.`)) return;
    const r = await fetch(`/api/leads/${edit!.id}`, { method: "DELETE" });
    if (!r.ok) return setMsg((await r.json()).error ?? "No se pudo eliminar.");
    setEdit(null); recargar?.();
  }

  return (
    <>
      {edit && (
        <div className="velo" onClick={() => setEdit(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Corregir ficha {String(edit.id).padStart(4, "0")}</h2>
            <p className="sub">Los cambios quedan registrados a tu nombre en la auditoría.</p>
            <div className="grid2">
              <div><label>Nombre</label><input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></div>
              <div><label>DNI</label><input className="mono" value={form.dni} onChange={(e) => setForm({ ...form, dni: e.target.value })} /></div>
              <div><label>Teléfono</label><input className="mono" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></div>
              <div><label>Dispositivo</label><input value={form.dispositivo} onChange={(e) => setForm({ ...form, dispositivo: e.target.value })} placeholder="Desde qué equipo/línea" /></div>
              <div><label>Usuario del dispositivo</label><input value={form.usuarioDisp} onChange={(e) => setForm({ ...form, usuarioDisp: e.target.value })} placeholder="Opcional" /></div>
              {editable === "admin" && (
                <>
                  <div><label>Caller asignado</label>
                    <select value={form.asignadoAId} onChange={(e) => setForm({ ...form, asignadoAId: e.target.value })}>
                      {(usuarios ?? []).filter((u) => u.rol === "CALLER").map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </div>
                  <div><label>Estado</label>
                    <select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
                      {Object.entries(ETI).map(([k, v]) => <option key={k} value={k}>{v.txt}</option>)}
                    </select>
                  </div>
                </>
              )}
            </div>
            <label>Nota</label>
            <textarea value={form.nota} onChange={(e) => setForm({ ...form, nota: e.target.value })} />
            {msg && <div className="error">{msg}</div>}
            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <button className="btn" onClick={guardar}>Guardar cambios</button>
              <button className="btn sec" onClick={() => setEdit(null)}>Cancelar</button>
              <button className="btn" style={{ background: "var(--noquiso)", marginLeft: "auto" }} onClick={borrar}>Eliminar ficha</button>
            </div>
          </div>
        </div>
      )}

      <div className="tarjeta">
        <h2>Contactos · {filtrados.length}{filtrados.length !== leads.length && <span className="sub"> de {leads.length}</span>}</h2>
        <div className="grid2" style={{ marginBottom: 12 }}>
          <div style={{ gridColumn: "span 2" }}>
            <label>Buscar por nombre, DNI, teléfono o N° de ficha</label>
            <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ej: 40129360 · 932581865 · Carlos" />
          </div>
          <div><label>Caller</label>
            <select value={fCaller} onChange={(e) => setFCaller(e.target.value)}>
              <option value="">Todos</option>
              {nombresDe((l) => l.asignadoA?.nombre).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div><label>Spamer</label>
            <select value={fSpamer} onChange={(e) => setFSpamer(e.target.value)}>
              <option value="">Todos</option>
              {nombresDe((l) => l.cargadoPor?.nombre).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div><label>Estado</label>
            <select value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(ETI).map(([k, v]) => <option key={k} value={k}>{v.txt}</option>)}
            </select>
          </div>
        </div>
        {(texto || fCaller || fSpamer || fEstado) && (
          <button className="btn sec chico" style={{ marginBottom: 12 }}
                  onClick={() => { setTexto(""); setFCaller(""); setFSpamer(""); setFEstado(""); }}>
            Limpiar filtros
          </button>
        )}
        {editable === "admin" && <p className="sub">Tocá “Corregir” para arreglar cualquier dato, reasignar el caller o cambiar el resultado.</p>}
        {editable === "spamer" && <p className="sub">Podés corregir o borrar una ficha mientras el caller no la haya llamado todavía.</p>}
        <div className="tabla-scroll"><table><tbody>
          <tr>
            <th>Ficha</th><th>Cargado</th><th>Contacto</th><th>DNI</th><th>Teléfono</th><th>Dispositivo</th><th>Spamer</th><th>Caller</th><th>Estado</th><th>Intentos</th><th>Última nota</th>{editable && <th />}
          </tr>
          {filtrados.map((l) => (
            <Fragment key={l.id}>
            <tr style={{ background: l.estado === "ACEPTO" && l.seguimiento === "SE_FUE_A_0" ? "#EDE3F7" : l.estado === "ACEPTO" && l.seguimiento === "NO_BANCA" ? "#FBF3D0" : undefined }}>
              <td className="mono">{String(l.id).padStart(4, "0")}</td>
              <td className="mono" style={{ whiteSpace: "nowrap" }}>{fechaHora(l.actualizadoEn ?? l.creadoEn)}</td>
              <td><b>{l.nombre}</b></td>
              <td className="mono">{l.dni}</td>
              <td className="mono">{l.telefono}</td>
              <td>{l.dispositivo ? <span title={l.usuarioDisp ? `Usuario: ${l.usuarioDisp}` : undefined}>{l.dispositivo}{l.usuarioDisp ? ` · ${l.usuarioDisp}` : ""}</span> : "—"}</td>
              <td>{l.cargadoPor?.nombre ?? "—"}</td>
              <td>{l.asignadoA?.nombre ?? "—"}</td>
              <td>
                {l.enLlamadaDesde
                  ? <span className="eti" style={{ color: "var(--acepto)", borderColor: "var(--acepto)" }}>● En llamada {mmss(desde(l.enLlamadaDesde))}</span>
                  : <span className="eti" style={{ color: eti(l.estado).color, borderColor: eti(l.estado).color }}>{eti(l.estado).txt}</span>}
              </td>
              <td className="mono">
                {l.intentos > 0
                  ? <button className="btn sec chico" onClick={() => setVerHist(verHist === l.id ? null : l.id)}>{l.intentos} {verHist === l.id ? "▲" : "▼"}</button>
                  : "0"}
              </td>
              <td>{l.llamadas?.[0]?.nota ?? "—"}</td>
              {editable && (
                <td>
                  {editable === "spamer"
                    ? (l.intentos === 0 ? <button className="btn sec chico" onClick={() => abrir(l)}>Corregir</button> : <span className="sub">—</span>)
                    : <button className="btn sec chico" onClick={() => abrir(l)}>Corregir</button>}
                </td>
              )}
            </tr>
            {verHist === l.id && (
              <tr style={{ background: "#F6F9FB" }}>
                <td colSpan={editable ? 12 : 11}>
                  <b>Reporte del caller sobre esta ficha:</b>
                  {l.llamadas?.length ? (
                    <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                      {l.llamadas.map((c: any) => (
                        <li key={c.id}>
                          {new Date(c.creadoEn).toLocaleString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} —{" "}
                          <b style={{ color: eti(c.resultado).color }}>{eti(c.resultado).txt}</b>
                          {c.duracion ? ` · duró ${mmss(c.duracion)}` : ""}
                          {c.motivo ? ` · motivo: ${c.motivo}` : ""}
                          {c.nota ? ` · "${c.nota}"` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="sub" style={{ marginTop: 4 }}>Sin intentos registrados.</p>}
                </td>
              </tr>
            )}
            </Fragment>
          ))}
          {!filtrados.length && <tr><td colSpan={editable ? 12 : 11} style={{ color: "var(--tinta2)" }}>
            {leads.length ? "Ningún contacto coincide con la búsqueda." : "Todavía no hay contactos cargados."}
          </td></tr>}
        </tbody></table></div>
      </div>
    </>
  );
}

/* ============ USUARIOS ============ */
function Usuarios({ usuarios, recargar }: { usuarios: Usuario[]; recargar: () => void }) {
  const [f, setF] = useState({ nombre: "", usuario: "", clave: "", rol: "CALLER", telefono: "" });
  const [msg, setMsg] = useState("");
  const [equipoNuevo, setEquipoNuevo] = useState<string[]>([]);
  const [editandoEquipo, setEditandoEquipo] = useState<Usuario | null>(null);
  const asignables = usuarios.filter((u) => ["CALLER", "CARGADOR"].includes(u.rol) && u.activo);
  const alternar = (lista: string[], id: string) => lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id];

  async function crear() {
    const r = await fetch("/api/usuarios", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, equipo: f.rol === "ENCARGADO" ? equipoNuevo : undefined }),
    });
    const d = await r.json();
    setMsg(r.ok ? "Usuario creado." : d.error);
    if (r.ok) { setF({ nombre: "", usuario: "", clave: "", rol: "CALLER", telefono: "" }); setEquipoNuevo([]); recargar(); }
  }
  async function editar(id: string, cambios: any) {
    await fetch("/api/usuarios", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...cambios }) });
    recargar();
  }

  async function eliminar(u: Usuario) {
    if (!confirm(`¿Eliminar definitivamente a ${u.nombre} (${u.usuario})? Esta acción no se puede deshacer.`)) return;
    const r = await fetch("/api/usuarios", {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: u.id }),
    });
    const d = await r.json();
    if (!r.ok) return setMsg(d.error);
    setMsg(`${u.nombre} fue eliminado.`);
    recargar();
  }

  return (
    <>
      {editandoEquipo && (
        <VentanaEquipo encargado={editandoEquipo} asignables={asignables} usuarios={usuarios}
                       cerrar={() => setEditandoEquipo(null)}
                       guardar={async (ids) => { await editar(editandoEquipo.id, { equipo: ids }); setEditandoEquipo(null); }} />
      )}
      <div className="tarjeta">
        <h2>Crear usuario</h2>
        <p className="sub">Cada persona con su cuenta: así queda claro quién cargó cada dato y quién hizo cada llamada.</p>
        <div className="grid2">
          <div><label>Nombre</label><input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></div>
          <div><label>Usuario</label><input className="mono" value={f.usuario} onChange={(e) => setF({ ...f, usuario: e.target.value })} /></div>
          <div><label>Contraseña (mín. 8)</label><input value={f.clave} onChange={(e) => setF({ ...f, clave: e.target.value })} /></div>
          <div><label>Rol</label>
            <select value={f.rol} onChange={(e) => setF({ ...f, rol: e.target.value })}>
              <option value="CALLER">Caller (llama y vende)</option>
              <option value="CARGADOR">Spamer (carga datos)</option>
              <option value="PROCESADOR">Procesador de pago (10% de lo que procesa)</option>
              <option value="ENCARGADO">Encargado de equipo (10% de las ventas de su gente)</option>
              <option value="ADMIN">Administrador</option>
            </select>
          </div>
        </div>
        {f.rol === "ENCARGADO" && (
          <div style={{ marginTop: 14 }}>
            <label>¿Qué personas tiene a cargo?</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {asignables.map((u) => (
                <button key={u.id} type="button"
                        className={`btn chico ${equipoNuevo.includes(u.id) ? "" : "sec"}`}
                        onClick={() => setEquipoNuevo(alternar(equipoNuevo, u.id))}>
                  {equipoNuevo.includes(u.id) ? "✓ " : ""}{u.nombre} <span style={{ opacity: .7 }}>({ROL[u.rol]})</span>
                </button>
              ))}
              {!asignables.length && <span className="sub">Primero creá callers o spamers.</span>}
            </div>
            <div className="tip">Cobra el 10% de todas las ventas que cierren sus callers y de las que salgan de la data de sus spamers.</div>
          </div>
        )}
        {msg && <div className={msg.includes("creado") || msg.includes("eliminado") ? "ok" : "error"}>{msg}</div>}
        <button className="btn" style={{ marginTop: 14 }} onClick={crear}>Crear usuario</button>
      </div>
      <div className="tarjeta">
        <h2>Equipo</h2>
        <p className="sub">“Eliminar” solo funciona con usuarios que nunca cargaron datos ni hicieron llamadas. Si ya trabajaron, usá “Desactivar”: no pueden entrar más, pero su historial se conserva.</p>
        <div className="tabla-scroll"><table><tbody>
          <tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Equipo</th><th>Avisos</th><th>Estado</th><th>Contraseña</th><th /><th /></tr>
          {usuarios.map((u) => (
            <tr key={u.id}>
              <td><b>{u.nombre}</b></td>
              <td className="mono">{u.usuario}</td>
              <td>{ROL[u.rol] ?? u.rol}</td>
              <td>
                {u.rol === "ENCARGADO" ? (
                  <button className="btn sec chico" onClick={() => setEditandoEquipo(u)}>
                    {usuarios.filter((x) => x.encargadoId === u.id).length} a cargo ✎
                  </button>
                ) : (
                  <span className="sub">{usuarios.find((x) => x.id === u.encargadoId)?.nombre ?? "—"}</span>
                )}
              </td>
              <td><button className="btn sec chico" onClick={() => editar(u.id, { notificar: !u.notificar })}>{u.notificar ? "Sí" : "No"}</button></td>
              <td>{u.restringidoEn
                ? <span className="eti" style={{ color: "var(--noquiso)", borderColor: "var(--noquiso)" }} title="Se le cortó el acceso por estar desconectado en horario laboral">🔒 Restringido</span>
                : u.activo ? "Activo" : "Desactivado"}</td>
              <td><button className="btn sec chico" onClick={() => {
                const clave = prompt(`Nueva contraseña para ${u.nombre} (mínimo 8 caracteres):`);
                if (clave) editar(u.id, { clave });
              }}>Cambiar</button></td>
              <td><button className="btn sec chico" onClick={() => editar(u.id, { activo: !u.activo })}>{u.activo ? "Desactivar" : "Reactivar"}</button></td>
              <td>
                <button className="btn chico" style={{ background: "var(--noquiso)" }} onClick={() => eliminar(u)}>Eliminar</button>
              </td>
            </tr>
          ))}
        </tbody></table></div>
      </div>
    </>
  );
}

/* ============ REGLAS DE AVISO ============ */
function Avisos() {
  const [c, setC] = useState<Record<string, number> | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => { fetch("/api/config").then((r) => r.json()).then((d) => setC(d.config)); }, []);
  if (!c) return <div className="tarjeta">Cargando…</div>;

  const campos: [string, string][] = [
    ["minutosPendiente", "Recordar contacto sin llamar cada (min)"],
    ["minutosNoContesto", "Recordar tras “no contestó” cada (min)"],
    ["minutosVolver", "Recordar tras “volver a llamar” cada (min)"],
    ["horaInicio", "No avisar antes de (hora)"],
    ["horaFin", "No avisar después de (hora)"],
    ["maxAvisosDia", "Tope de avisos por ficha y día"],
  ];
  return (
    <div className="tarjeta">
      <h2>Reglas de aviso</h2>
      <p className="sub">El sistema revisa cada 5 minutos y manda un solo aviso por caller, aunque tenga varias fichas vencidas.</p>
      <div className="grid2">
        {campos.map(([k, t]) => (
          <div key={k}><label>{t}</label>
            <input className="mono" type="number" value={c[k]} onChange={(e) => setC({ ...c, [k]: Number(e.target.value) })} /></div>
        ))}
      </div>
      {msg && <div className="ok">{msg}</div>}
      <button className="btn" style={{ marginTop: 14 }} onClick={async () => {
        const r = await fetch("/api/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) });
        setMsg(r.ok ? "Reglas guardadas." : "No se pudo guardar.");
      }}>Guardar reglas</button>
    </div>
  );
}


/* ============ ADMIN: supervisión total ============ */
function Supervision() {
  const [d, setD] = useState<any>(null);
  const [dias, setDias] = useState(7);
  const [tab, setTab] = useState<"equipo" | "spamers" | "asistencia" | "seguridad" | "llamadas" | "archivo" | "alertas" | "bitacora">("equipo");
  const [carga, setCarga] = useState<any>(null);

  const traerCarga = useCallback(() => {
    fetch("/api/carga").then((r) => (r.ok ? r.json() : null)).then(setCarga);
  }, []);
  useEffect(() => { traerCarga(); }, [traerCarga]);

  async function fijarTope(sp: any) {
    const resp = prompt(`Tope de subida diaria de ${sp.nombre} (vacío = sin tope):`, sp.tope === null ? "" : String(sp.tope));
    if (resp === null) return;
    await fetch("/api/usuarios", { method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: sp.id, topeCargaDiaria: resp.trim() === "" ? null : Number(resp) }) });
    traerCarga();
  }

  useEffect(() => {
    fetch(`/api/supervision?dias=${dias}`).then((r) => (r.ok ? r.json() : null)).then(setD);
  }, [dias]);
  if (!d) return <div className="tarjeta">Cargando…</div>;

  const hhmm = (seg: number) => `${Math.floor(seg / 3600)}h ${Math.floor((seg % 3600) / 60)}m`;
  const hace = (iso?: string | null) => {
    if (!iso) return "nunca";
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    return m < 2 ? "ahora" : m < 60 ? `hace ${m} min` : `hace ${Math.floor(m / 60)} h`;
  };

  return (
    <>
      {carga?.pool && (
        <div className="tarjeta">
          <h2>Data en el pool (sin cerrar)</h2>
          <div className="grid4">
            <div className="metrica"><span className="rotulo">Sin llamar</span><b>{carga.pool.sinLlamar}</b></div>
            <div className="metrica"><span className="rotulo">No contestó</span><b>{carga.pool.noContesto}</b></div>
            <div className="metrica"><span className="rotulo">No quiso</span><b>{carga.pool.noQuiso}</b></div>
            <div className="metrica"><span className="rotulo">Total para llamar</span><b>{carga.pool.total}</b></div>
          </div>
        </div>
      )}

      {carga?.spamers && (
        <div className="tarjeta">
          <h2>Tope de subida por spamer</h2>
          <p className="sub">Cuánta data puede subir cada spamer por día. Queda guardado hasta que lo cambies. “Sin tope” = sin límite.</p>
          <div className="tabla-scroll"><table><tbody>
            <tr><th>Spamer</th><th style={{ textAlign: "right" }}>Subió hoy</th><th>Tope</th><th style={{ width: "30%" }} /><th /></tr>
            {carga.spamers.map((c: any) => (
              <tr key={c.id}>
                <td><b>{c.nombre}</b></td>
                <td className="mono" style={{ textAlign: "right", color: c.lleno ? "var(--noquiso)" : undefined }}>{c.hoy}{c.tope !== null ? `/${c.tope}` : ""}</td>
                <td className="mono">{c.tope === null ? "sin tope" : c.tope}</td>
                <td>{c.tope !== null && <div className="barra"><span style={{ width: `${Math.min(100, (c.hoy / Math.max(1, c.tope)) * 100)}%`, background: c.lleno ? "var(--noquiso)" : "var(--acepto)" }} /></div>}</td>
                <td><button className="btn chico sec" onClick={() => fijarTope(c)}>Fijar tope</button></td>
              </tr>
            ))}
            {!carga.spamers.length && <tr><td colSpan={5} style={{ color: "var(--tinta2)" }}>No hay spamers activos.</td></tr>}
          </tbody></table></div>
        </div>
      )}

      <div className="tarjeta" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span className="rotulo">Período</span>
        {[1, 7, 30].map((n) => (
          <button key={n} className={`btn chico ${dias === n ? "" : "sec"}`} onClick={() => setDias(n)}>
            {n === 1 ? "Hoy" : `${n} días`}
          </button>
        ))}
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {([["equipo", "Callers"], ["spamers", "Spamers"], ["asistencia", "Asistencia"], ["seguridad", "🛡️ Seguridad"], ["llamadas", "📋 Llamadas"], ["archivo", "🗄️ Archivo"], ["alertas", `Alertas (${d.sospechosas.length})`], ["bitacora", "Bitácora"]] as [any, string][]).map(([k, t]) => (
            <button key={k} className={`btn chico ${tab === k ? "" : "sec"}`} onClick={() => setTab(k)}>{t}</button>
          ))}
        </span>
      </div>

      {tab === "equipo" && (
        <div className="tarjeta">
          <h2>Tiempos por caller y por resultado</h2>
          <p className="sub">El tiempo lo mide el servidor entre “voy a llamar” y el resultado. El caller no puede alterarlo.</p>
          <div className="tabla-scroll"><table><tbody>
            <tr>
              <th>Caller</th><th>Conectado</th><th>Avisos</th><th>Llamadas</th><th>Tiempo total</th>
              <th>Aceptó</th><th>No quiso</th><th>No contestó</th><th>Volver</th><th>Sospechosas</th><th>Descartes</th>
            </tr>
            {d.porCaller.map((c: any) => (
              <tr key={c.id}>
                <td><b>{c.nombre}</b><br /><span className="mono" style={{ color: "var(--tinta2)" }}>{c.usuario}</span></td>
                <td>{hace(c.ultimoLatido)}</td>
                <td>{c.pushActivo
                  ? <span className="eti" style={{ color: "var(--acepto)", borderColor: "var(--acepto)" }}>Activos</span>
                  : <span className="eti" style={{ color: "var(--noquiso)", borderColor: "var(--noquiso)" }}>SIN AVISOS</span>}</td>
                <td className="mono">{c.total}</td>
                <td className="mono">{hhmm(c.tiempoTotal)}</td>
                <td className="mono">{c.acepto.n} · {mmss(c.acepto.prom)}</td>
                <td className="mono">{c.noQuiso.n} · {mmss(c.noQuiso.prom)}</td>
                <td className="mono">{c.noContesto.n} · {mmss(c.noContesto.prom)}</td>
                <td className="mono">{c.volver.n} · {mmss(c.volver.prom)}</td>
                <td className="mono" style={{ color: c.cortas ? "var(--noquiso)" : undefined, fontWeight: c.cortas ? 700 : 400 }}>{c.cortas}</td>
                <td className="mono" style={{ color: c.descartes ? "var(--nocontesto)" : undefined }}>{c.descartes}</td>
              </tr>
            ))}
          </tbody></table></div>
          <div className="tip">
            Cada celda de resultado muestra <b>cantidad · promedio</b>. “Sospechosas” son llamadas cerradas en menos de {d.umbral} segundos:
            no hay conversación posible en ese tiempo. “Descartes” son fichas que abrió y cerró sin llamar.
          </div>
        </div>
      )}

      {tab === "equipo" && !!d.diasLlamadas?.length && (
        <div className="tarjeta">
          <h2>Aceptados por día</h2>
          <p className="sub">Sirve para ver constancia: no es lo mismo 20 ventas repartidas que 20 en un solo día.</p>
          <div className="tabla-scroll"><table><tbody>
            <tr>
              <th>Caller</th>
              {d.diasLlamadas.map((dia: string) => (
                <th key={dia} style={{ textAlign: "center" }}>
                  {new Date(dia + "T12:00:00").toLocaleDateString("es", { weekday: "short", day: "2-digit" })}
                </th>
              ))}
              <th style={{ textAlign: "center" }}>Total</th>
            </tr>
            {d.porCaller.map((c: any) => (
              <tr key={c.id}>
                <td><b>{c.nombre}</b></td>
                {d.diasLlamadas.map((dia: string) => {
                  const n = c.aceptadosPorDia?.find((x: any) => x.dia === dia)?.n ?? 0;
                  return (
                    <td key={dia} className="mono" style={{
                      textAlign: "center", fontWeight: n ? 600 : 400,
                      color: n ? "var(--acepto)" : "var(--linea)",
                    }}>{n || "·"}</td>
                  );
                })}
                <td className="mono" style={{ textAlign: "center", fontWeight: 700 }}>{c.acepto.n}</td>
              </tr>
            ))}
            <tr style={{ background: "#F6F9F3" }}>
              <td><b>Total del día</b></td>
              {d.diasLlamadas.map((dia: string) => (
                <td key={dia} className="mono" style={{ textAlign: "center", fontWeight: 700 }}>
                  {d.porCaller.reduce((n: number, c: any) => n + (c.aceptadosPorDia?.find((x: any) => x.dia === dia)?.n ?? 0), 0)}
                </td>
              ))}
              <td className="mono" style={{ textAlign: "center", fontWeight: 700 }}>
                {d.porCaller.reduce((n: number, c: any) => n + c.acepto.n, 0)}
              </td>
            </tr>
          </tbody></table></div>
        </div>
      )}

      {tab === "spamers" && (
        <div className="tarjeta">
          <h2>Data cargada por spamer</h2>
          <p className="sub">Si uno falta y otro lo cubre, acá ves de quién es cada lote y qué rindió.</p>
          <div className="tabla-scroll"><table><tbody>
            <tr><th>Spamer</th><th>Estado</th><th>Subió HOY</th><th>Data en el período</th><th>Ya trabajada</th><th>Sin tocar</th><th>Aceptaron</th><th>No quisieron</th><th>Conversión</th></tr>
            {d.porSpamer?.map((sp: any) => (
              <tr key={sp.id}>
                <td><b>{sp.nombre}</b><br /><span className="mono" style={{ color: "var(--tinta2)" }}>{sp.usuario}</span></td>
                <td>{sp.activo ? "Activo" : "Desactivado"}</td>
                <td className="mono" style={{ fontSize: 17, fontWeight: 700, color: sp.hoy ? "var(--acepto)" : "var(--tinta2)" }}>{sp.hoy ?? 0}</td>
                <td className="mono">{sp.subidas}</td>
                <td className="mono">{sp.trabajadas}</td>
                <td className="mono" style={{ color: sp.sinTocar ? "var(--nocontesto)" : undefined }}>{sp.sinTocar}</td>
                <td className="mono">{sp.acepto}</td>
                <td className="mono">{sp.noQuiso}</td>
                <td className="mono" style={{ fontWeight: 700 }}>{sp.conversion}%</td>
              </tr>
            ))}
            {!d.porSpamer?.length && <tr><td colSpan={9} style={{ color: "var(--tinta2)" }}>No hay spamers cargados.</td></tr>}
          </tbody></table></div>
          <div className="tip">
            “Sin tocar” es data que subió y ningún caller llamó todavía. Si crece, o falta gente llamando o se está cargando más de lo que el equipo puede trabajar.
          </div>
        </div>
      )}

      {tab === "spamers" && !!d.dias?.length && (
        <div className="tarjeta">
          <h2>Carga diaria</h2>
          <p className="sub">Cuántos contactos subió cada spamer, día por día.</p>
          <div className="tabla-scroll"><table><tbody>
            <tr>
              <th>Spamer</th>
              {d.dias.map((dia: string) => (
                <th key={dia} style={{ textAlign: "center" }}>
                  {new Date(dia + "T12:00:00").toLocaleDateString("es", { day: "2-digit", month: "2-digit" })}
                </th>
              ))}
              <th style={{ textAlign: "center" }}>Total</th>
            </tr>
            {d.porSpamer?.map((sp: any) => (
              <tr key={sp.id}>
                <td><b>{sp.nombre}</b></td>
                {d.dias.map((dia: string) => {
                  const n = sp.porDia?.find((x: any) => x.dia === dia)?.n ?? 0;
                  return (
                    <td key={dia} className="mono" style={{ textAlign: "center", color: n ? undefined : "var(--linea)" }}>
                      {n || "·"}
                    </td>
                  );
                })}
                <td className="mono" style={{ textAlign: "center", fontWeight: 700 }}>{sp.subidas}</td>
              </tr>
            ))}
            <tr style={{ background: "#F6F9F3" }}>
              <td><b>Total del equipo</b></td>
              {d.dias.map((dia: string) => (
                <td key={dia} className="mono" style={{ textAlign: "center", fontWeight: 700 }}>
                  {d.porSpamer?.reduce((n: number, sp: any) => n + (sp.porDia?.find((x: any) => x.dia === dia)?.n ?? 0), 0)}
                </td>
              ))}
              <td className="mono" style={{ textAlign: "center", fontWeight: 700 }}>
                {d.porSpamer?.reduce((n: number, sp: any) => n + sp.subidas, 0)}
              </td>
            </tr>
          </tbody></table></div>
          <div className="tip">Tocá “30 días” arriba para ver más historial. Se muestran los últimos 7 días con movimiento.</div>
        </div>
      )}

      {tab === "alertas" && (
        <div className="tarjeta">
          <h2>Llamadas cerradas demasiado rápido</h2>
          <p className="sub">Menos de {d.umbral} segundos entre abrir la ficha y marcar el resultado.</p>
          <div className="tabla-scroll"><table><tbody>
            <tr><th>Fecha</th><th>Caller</th><th>Contacto</th><th>Teléfono</th><th>Resultado</th><th>Duró</th><th>IP</th></tr>
            {d.sospechosas.map((l: any) => (
              <tr key={l.id}>
                <td className="mono">{new Date(l.creadoEn).toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                <td>{l.caller?.nombre}</td>
                <td>{l.lead?.nombre}</td>
                <td className="mono">{l.lead?.telefono}</td>
                <td><span className="eti" style={{ color: eti(l.resultado).color, borderColor: eti(l.resultado).color }}>{eti(l.resultado).txt}</span></td>
                <td className="mono" style={{ color: "var(--noquiso)", fontWeight: 700 }}>{l.duracion}s</td>
                <td className="mono" style={{ fontSize: 12 }}>{l.desdeIp ?? "—"}</td>
              </tr>
            ))}
            {!d.sospechosas.length && <tr><td colSpan={7} style={{ color: "var(--tinta2)" }}>Ninguna llamada sospechosa en el período. 👌</td></tr>}
          </tbody></table></div>
        </div>
      )}

      {tab === "asistencia" && <Asistencia />}

      {tab === "seguridad" && <Seguridad />}

      {tab === "llamadas" && <RegistroLlamadas />}

      {tab === "archivo" && <Archivo />}

      {tab === "bitacora" && (
        <div className="tarjeta">
          <h2>Bitácora</h2>
          <p className="sub">Cada acción de cada persona, en orden. No se puede editar ni borrar desde la app.</p>
          <div className="tabla-scroll"><table><tbody>
            <tr><th>Fecha</th><th>Persona</th><th>Acción</th><th>Detalle</th><th>Duró</th><th>IP</th></tr>
            {d.bitacora.map((e: any) => (
              <tr key={e.id}>
                <td className="mono">{new Date(e.creadoEn).toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                <td>{e.usuario?.nombre} <span className="sub">{ROL[e.usuario?.rol] ?? ""}</span></td>
                <td className="mono">{e.tipo}</td>
                <td>{e.detalle ?? "—"}</td>
                <td className="mono">{e.segundos != null ? mmss(e.segundos) : "—"}</td>
                <td className="mono" style={{ fontSize: 12 }}>{e.ip ?? "—"}</td>
              </tr>
            ))}
          </tbody></table></div>
        </div>
      )}
    </>
  );
}


/* ============ PODIO SEMANAL ============ */
function Ranking({ sesion }: { sesion: Sesion }) {
  const [d, setD] = useState<any>(null);
  useEffect(() => { fetch("/api/ranking").then((r) => (r.ok ? r.json() : null)).then(setD); }, []);
  if (!d) return <div className="tarjeta">Cargando el podio…</div>;

  const fmt = (iso: string) => new Date(iso).toLocaleDateString("es", { day: "2-digit", month: "2-digit" });
  const restan = () => {
    const ms = new Date(d.cierre).getTime() - Date.now();
    const dias = Math.floor(ms / 86400000), horas = Math.floor((ms % 86400000) / 3600000);
    return dias > 0 ? `${dias} día(s) y ${horas} h` : `${horas} h`;
  };

  return (
    <>
      <div className="tarjeta" style={{ textAlign: "center" }}>
        <h2>Ranking de la semana</h2>
        <p className="sub">
          Del lunes {fmt(d.desde)} al domingo · cierra en {restan()}
        </p>
      </div>

      {/* El admin ve todos los equipos; cada quien ve solo el suyo. */}
      {sesion.rol === "ADMIN"
        ? (d.equipos ?? []).map((eq: any) => (
            <EquipoRanking key={eq.equipoId} eq={eq} sesion={sesion} mostrarCallers />
          ))
        : <EquipoRanking eq={d} sesion={sesion}
            mostrarCallers={sesion.rol === "CALLER"} />
      }
    </>
  );
}

/* Ranking de un solo equipo. */
function EquipoRanking({ eq, sesion, mostrarCallers }:
  { eq: any; sesion: Sesion; mostrarCallers?: boolean }) {
  const min = eq.minEquipo ?? 3;
  const avisoChico = (n: number) => (
    <div className="tarjeta" style={{ background: "var(--papel)", borderLeft: "4px solid var(--ambar)" }}>
      El ranking se activa con <b>{min} o más</b> en el equipo. Ahora hay {n} — sumá {min - n} para que corra la competencia y el 12%.
    </div>
  );

  return (
    <>
      {eq.equipoNombre && (
        <div className="tarjeta" style={{ background: "linear-gradient(180deg,#14532D,#1B6B3A)", color: "#EAF4F6", border: 0, padding: "10px 16px" }}>
          <b style={{ fontSize: 16 }}>🏆 {eq.equipoNombre}</b>
        </div>
      )}
      {mostrarCallers && (
        eq.rankingCallersActivo
          ? <>
              <Podio titulo="Callers · más clientes que aceptaron" unidad="aceptaron" gente={eq.callers} yo={sesion.id} />
              <Premio vigentes={eq.bonoVigente?.caller} tabla={eq.callers} yo={sesion.id} />
            </>
          : avisoChico(eq.callers?.length ?? 0)
      )}
    </>
  );
}

function Podio({ titulo, unidad, gente, yo }: { titulo: string; unidad: string; gente: any[]; yo: string }) {
  const conPuntos = gente.filter((g) => g.puntos > 0);
  const top = conPuntos.slice(0, 3);
  const resto = conPuntos.slice(3);
  const maximo = top[0]?.puntos || 1;
  // El podio se ve como un podio: 2° a la izquierda, 1° al centro, 3° a la derecha.
  const orden = [top[1], top[0], top[2]];
  const alturas = [92, 132, 68];
  const medallas = ["🥈", "🥇", "🥉"];
  const colores = ["#9AA5A0", "var(--lima-acento)", "#B08150"];

  return (
    <div className="tarjeta">
      <h2>{titulo}</h2>
      {!conPuntos.length ? (
        <p className="sub">Todavía nadie sumó esta semana. El lunes arranca de cero para todos.</p>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 10, marginTop: 22 }}>
            {orden.map((p, i) => !p ? <div key={i} style={{ flex: 1, maxWidth: 150 }} /> : (
              <div key={p.id} style={{ flex: 1, maxWidth: 150, textAlign: "center" }}>
                <div style={{ fontSize: i === 1 ? 34 : 26 }}>{medallas[i]}</div>
                <div style={{ fontWeight: 700, fontSize: i === 1 ? 16 : 14, marginTop: 2 }}>
                  {p.nombre}{p.id === yo && " (vos)"}
                </div>
                <div className="mono" style={{ fontSize: i === 1 ? 26 : 20, fontWeight: 600, lineHeight: 1.2 }}>{p.puntos}</div>
                <div className="rotulo">{unidad}</div>
                <div style={{
                  height: alturas[i], marginTop: 8, borderRadius: "10px 10px 0 0",
                  background: colores[i],
                  border: p.id === yo ? "3px solid var(--tinta)" : "none",
                  display: "grid", placeItems: "center",
                  color: i === 1 ? "var(--lima-cascara)" : "#fff",
                  fontFamily: '"IBM Plex Sans Condensed", sans-serif', fontWeight: 700, fontSize: 30,
                }}>
                  {i === 1 ? 1 : i === 0 ? 2 : 3}
                </div>
              </div>
            ))}
          </div>

          {!!resto.length && (
            <div style={{ marginTop: 18 }}>
              <span className="rotulo">Resto de la tabla</span>
              <div className="tabla-scroll"><table><tbody>
                {resto.map((p, i) => (
                  <tr key={p.id} style={p.id === yo ? { background: "var(--petroleo-cl)" } : undefined}>
                    <td className="mono" style={{ width: 40 }}>{i + 4}°</td>
                    <td><b>{p.nombre}</b>{p.id === yo && " (vos)"}</td>
                    <td style={{ width: "50%" }}>
                      <div className="barra"><span style={{ width: `${(p.puntos / maximo) * 100}%` }} /></div>
                    </td>
                    <td className="mono" style={{ width: 60, textAlign: "right", fontWeight: 600 }}>{p.puntos}</td>
                  </tr>
                ))}
              </tbody></table></div>
            </div>
          )}
        </>
      )}
    </div>
  );
}


/* ============ PREMIO DE LA SEMANA ============ */
function Premio({ vigentes, tabla, yo }: { vigentes: any[]; tabla: any[]; yo: string }) {
  const conPuntos = (tabla ?? []).filter((x: any) => x.puntos > 0);
  const lider = conPuntos[0];
  const vigente = vigentes?.[0];             // ganó la semana pasada: cobra 12% ahora
  const soyElVigente = vigente?.id === yo;
  const voyPrimero = lider?.id === yo && lider?.puntos > 0;
  const yoAhora = conPuntos.find((x: any) => x.id === yo);
  const faltan = lider && yoAhora && !voyPrimero ? lider.puntos - yoAhora.puntos + 1 : lider ? lider.puntos + 1 : 1;

  return (
    <div className="tarjeta" style={{ borderLeft: "6px solid var(--lima-acento)" }}>
      <h2>💰 Premio del 1er puesto</h2>
      <p className="sub">Cómo se gana el 2% adicional sobre tu pago.</p>

      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 18,
        margin: "18px 0", flexWrap: "wrap", textAlign: "center",
      }}>
        <div>
          <div className="rotulo">Pago normal</div>
          <div className="mono" style={{ fontSize: 30, fontWeight: 600, color: "var(--tinta2)" }}>10%</div>
        </div>
        <div style={{ fontSize: 26, color: "var(--tinta2)" }}>→</div>
        <div>
          <div className="rotulo">Si salís 1°</div>
          <div className="mono" style={{ fontSize: 38, fontWeight: 700, color: "var(--acepto)" }}>12%</div>
          <div className="sub">la semana siguiente</div>
        </div>
      </div>

      <ol className="pasos" style={{ listStyle: "none", padding: 0 }}>
        <li><span className="paso-n">1</span><div>Terminás la semana en el <b>1er puesto</b> de tu tabla.</div></li>
        <li><span className="paso-n">2</span><div>La semana siguiente cobrás al <b>12%</b> en lugar del 10%.</div></li>
        <li><span className="paso-n">3</span><div>Para <b>mantener el 12%</b> tenés que volver a salir 1° esa misma semana.</div></li>
        <li><span className="paso-n">4</span><div>Si no lo lográs, volvés al 10% y el 12% pasa a quien haya ganado.</div></li>
      </ol>

      <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
        <div className="tip" style={{ background: "#EAF6F1", borderLeftColor: "var(--acepto)", color: "#136245" }}>
          <b>Cobrando al 12% esta semana:</b>{" "}
          {vigente
            ? <>{vigente.nombre}{soyElVigente && " — ¡sos vos!"} (ganó la semana pasada con {vigente.puntos})</>
            : <>nadie todavía. El primero que gane una semana estrena el bono.</>}
        </div>

        <div className="tip">
          <b>Va camino al 12% de la próxima semana:</b>{" "}
          {lider?.puntos
            ? <>{lider.nombre}{voyPrimero && " — ¡sos vos, no lo sueltes!"} con {lider.puntos}</>
            : <>puesto libre: el primero que sume se lo lleva.</>}
          {!voyPrimero && lider?.puntos && <> Te faltan <b>{faltan}</b> para pasarlo.</>}
          {soyElVigente && !voyPrimero && <> <b>Ojo:</b> si la semana cierra así, perdés el 12% que tenés ahora.</>}
        </div>
      </div>

      <p className="sub" style={{ marginTop: 14 }}>
        La semana cierra el domingo a medianoche. Este porcentaje es aparte del bono de “El cielo es el límite”.
      </p>
    </div>
  );
}

/* ============ EL CIELO ES EL LÍMITE ============ */
/* Metas semanales. El bono NO se acumula: se cobra el del escalón más alto alcanzado. */
const METAS = {
  CALLER: [
    { meta: 30, bono: 50 },
    { meta: 40, bono: 100 },
    { meta: 50, bono: 150 },
    { meta: 60, bono: 200 },
    { meta: 90, bono: 400 },
  ],
  CARGADOR: [
    { meta: 150, bono: 50 },
    { meta: 200, bono: 100 },
    { meta: 300, bono: 150 },
    { meta: 450, bono: 250 },
  ],
};

function Cielo({ sesion }: { sesion: Sesion }) {
  const [d, setD] = useState<any>(null);
  useEffect(() => { fetch("/api/ranking").then((r) => (r.ok ? r.json() : null)).then(setD); }, []);
  if (!d) return <div className="tarjeta">Cargando…</div>;

  const mio = (rol: "CALLER" | "CARGADOR", id: string) => {
    const tabla = rol === "CALLER" ? d.callers : d.spamers;
    return (tabla ?? []).find((x: any) => x.id === id)?.puntos ?? 0;
  };

  if (sesion.rol === "ADMIN") {
    return (
      <>
        <TablaCielo titulo="Callers · bono por aceptados" rol="CALLER" gente={d.callers ?? []} unidad="aceptados" />
        <TablaCielo titulo="Spamers · bono por data subida" rol="CARGADOR" gente={d.spamers ?? []} unidad="subidos" />
      </>
    );
  }

  const rol = sesion.rol as "CALLER" | "CARGADOR";
  return <Escalera rol={rol} puntos={mio(rol, sesion.id)} cierre={d.cierre} />;
}

function Escalera({ rol, puntos, cierre }: { rol: "CALLER" | "CARGADOR"; puntos: number; cierre: string }) {
  const metas = METAS[rol];
  const unidad = rol === "CALLER" ? "clientes que aceptaron" : "contactos subidos";
  const logrados = metas.filter((m) => puntos >= m.meta);
  const actual = logrados[logrados.length - 1] ?? null;
  const siguiente = metas.find((m) => puntos < m.meta) ?? null;
  const faltan = siguiente ? siguiente.meta - puntos : 0;
  const restan = () => {
    const ms = new Date(cierre).getTime() - Date.now();
    const dias = Math.floor(ms / 86400000);
    return dias > 0 ? `${dias} día(s)` : `${Math.max(0, Math.floor(ms / 3600000))} h`;
  };

  return (
    <>
      <div className="tarjeta" style={{ textAlign: "center" }}>
        <h2>☁️ El cielo es el límite</h2>
        <p className="sub">Bono semanal que se paga al cerrar la semana. Quedan {restan()}.</p>
      </div>

      <div className="cielo">
        <span className="nube" style={{ width: 120, height: 34, top: 40, left: -20 }} />
        <span className="nube" style={{ width: 90, height: 26, top: 160, right: -15 }} />
        <span className="nube" style={{ width: 140, height: 40, bottom: 90, left: -30 }} />

        {[...metas].reverse().map((m, i) => {
          const logrado = puntos >= m.meta;
          const esSiguiente = siguiente?.meta === m.meta;
          return (
            <div key={m.meta}>
              <div className={`peldano ${logrado ? "logrado" : ""} ${esSiguiente ? "siguiente" : ""}`}>
                <span style={{ fontSize: 24 }}>{logrado ? "✅" : esSiguiente ? "🎯" : "☁️"}</span>
                <span className="meta">{m.meta}</span>
                <span style={{ fontSize: 13, color: "var(--tinta2)" }}>{unidad}</span>
                <span className="bono" style={{ color: logrado ? "var(--acepto)" : "var(--tinta)" }}>S/ {m.bono}</span>
              </div>
              {i < metas.length - 1 && <div className="escalon-linea" />}
            </div>
          );
        })}

        <div className="globo">
          <span className="rotulo">Vas por</span>
          <div className="mono" style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.1 }}>{puntos}</div>
          <div className="sub">{unidad} esta semana</div>

          <div className="barra" style={{ marginTop: 12, height: 12 }}>
            <span style={{ width: `${Math.min(100, siguiente ? (puntos / siguiente.meta) * 100 : 100)}%` }} />
          </div>

          {siguiente ? (
            <p style={{ marginTop: 10, fontSize: 15 }}>
              Te faltan <b className="mono">{faltan}</b> para llegar a <b>{siguiente.meta}</b> y cobrar{" "}
              <b style={{ color: "var(--acepto)" }}>S/ {siguiente.bono}</b>
            </p>
          ) : (
            <p style={{ marginTop: 10, fontSize: 15 }}>🚀 Llegaste al tope de la escalera. Nadie te alcanza.</p>
          )}

          <div className="tip" style={{ textAlign: "left", marginTop: 12 }}>
            {actual
              ? <>Con lo que llevás ya tenés asegurado un bono de <b>S/ {actual.bono}</b>. Si subís un escalón más, ese monto se reemplaza por el mayor.</>
              : <>Todavía no llegaste al primer escalón ({metas[0].meta} {unidad}). Ahí arranca el bono de S/ {metas[0].bono}.</>}
          </div>
        </div>
      </div>

      <div className="tarjeta">
        <h2>Cómo se cobra</h2>
        <ol className="pasos" style={{ listStyle: "none", padding: 0 }}>
          <li><span className="paso-n">1</span><div>Contás desde el <b>lunes</b> hasta el <b>domingo</b>. El lunes vuelve a cero.</div></li>
          <li><span className="paso-n">2</span><div>El bono <b>no se suma</b>: cobrás únicamente el del escalón más alto que alcances.</div></li>
          <li><span className="paso-n">3</span><div>Ejemplo: si llegás a {metas[metas.length - 2].meta}, cobrás S/ {metas[metas.length - 2].bono} — no la suma de los anteriores.</div></li>
          <li><span className="paso-n">4</span><div>Se paga al terminar la semana, aparte del ranking y del 12%.</div></li>
        </ol>
      </div>
    </>
  );
}

function TablaCielo({ titulo, rol, gente, unidad }:
  { titulo: string; rol: "CALLER" | "CARGADOR"; gente: any[]; unidad: string }) {
  const metas = METAS[rol];
  const bonoDe = (p: number) => [...metas].reverse().find((m) => p >= m.meta)?.bono ?? 0;
  const proxima = (p: number) => metas.find((m) => p < m.meta);
  const total = gente.reduce((n, g) => n + bonoDe(g.puntos), 0);

  return (
    <div className="tarjeta">
      <h2>{titulo}</h2>
      <p className="sub">Bono asegurado si la semana cerrara ahora mismo.</p>
      <div className="tabla-scroll"><table><tbody>
        <tr><th>Persona</th><th>{unidad}</th><th>Escalón alcanzado</th><th>Bono a pagar</th><th>Próxima meta</th></tr>
        {gente.map((g) => {
          const b = bonoDe(g.puntos), sig = proxima(g.puntos);
          return (
            <tr key={g.id}>
              <td><b>{g.nombre}</b></td>
              <td className="mono">{g.puntos}</td>
              <td>{b ? `${[...metas].reverse().find((m) => g.puntos >= m.meta)!.meta} ${unidad}` : "—"}</td>
              <td className="mono" style={{ fontWeight: 700, color: b ? "var(--acepto)" : "var(--tinta2)" }}>S/ {b}</td>
              <td className="sub">{sig ? `le faltan ${sig.meta - g.puntos} para S/ ${sig.bono}` : "tope alcanzado"}</td>
            </tr>
          );
        })}
        {!gente.length && <tr><td colSpan={5} style={{ color: "var(--tinta2)" }}>Sin movimiento esta semana.</td></tr>}
      </tbody></table></div>
      <div className="tip"><b>Total a pagar si la semana cerrara hoy: S/ {total}</b> — el bono no se acumula, se paga solo el escalón más alto de cada uno.</div>
    </div>
  );
}


/* ============ LIQUIDACIÓN ============ */
const soles = (n: number) => `S/ ${(n ?? 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** "2026-08-24" (lunes) -> "24 – 30 ago" (lunes a domingo de esa semana). */
const rangoSemana = (lunesISO: string) => {
  const [a, m, d] = lunesISO.split("-").map(Number);
  const lun = new Date(a, m - 1, d);
  const dom = new Date(lun); dom.setDate(dom.getDate() + 6);
  const f = (x: Date) => x.toLocaleDateString("es-PE", { day: "numeric", month: "short" });
  return `${f(lun)} – ${f(dom)}`;
};

function Liquidacion({ sesion, usuarios }: { sesion: Sesion; usuarios: Usuario[] }) {
  const [d, setD] = useState<any>(null);
  const [verDetalle, setVerDetalle] = useState(false);
  const [editandoProc, setEditandoProc] = useState<any>(null);
  const [qVenta, setQVenta] = useState("");
  const procesadores = usuarios.filter((u) => u.rol === "PROCESADOR" && u.activo);
  const admin = sesion.rol === "ADMIN";
  const traer = useCallback(() => {
    fetch(`/api/liquidacion${admin ? "?todos=1" : ""}`).then((r) => (r.ok ? r.json() : null)).then(setD);
  }, [admin]);
  useEffect(() => { traer(); }, [traer]);
  if (!d) return <div className="tarjeta">Cargando…</div>;

  async function revisar(id: number, cambios: any) {
    await fetch("/api/liquidacion", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...cambios }),
    });
    traer();
  }

  if (admin) {
    return (
      <>
        {editandoProc && (
          <div className="velo" onClick={() => setEditandoProc(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
              <h2>¿Quién procesó este pago?</h2>
              <p className="sub">
                {editandoProc.cliente} · {soles(editandoProc.monto)} · cerrada por {editandoProc.caller}
              </p>
              <label>Procesador de pago</label>
              <select defaultValue={procesadores.find((pr) => pr.nombre === editandoProc.procesador)?.id ?? ""}
                      onChange={(e) => setEditandoProc({ ...editandoProc, nuevoId: e.target.value })}>
                <option value="">Sin procesador asignado</option>
                {procesadores.map((pr) => <option key={pr.id} value={pr.id}>{pr.nombre}</option>)}
              </select>
              <div className="tip">Al cambiarlo, la comisión del 10% pasa al procesador nuevo y se le descuenta al anterior.</div>
              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                <button className="btn" style={{ flex: 1 }} onClick={async () => {
                  await revisar(editandoProc.id, { procesadorId: editandoProc.nuevoId ?? "" });
                  setEditandoProc(null);
                }}>Guardar</button>
                <button className="btn sec" onClick={() => setEditandoProc(null)}>Cancelar</button>
              </div>
            </div>
          </div>
        )}
        <div className="grid4">
          <div className="metrica"><span className="rotulo">Vendido esta semana</span><b style={{ fontSize: 22 }}>{soles(d.totales.vendido)}</b></div>
          <div className="metrica"><span className="rotulo">Ventas</span><b>{d.totales.ventas}</b></div>
          <div className="metrica"><span className="rotulo">Sin validar</span><b style={{ color: d.totales.sinValidar ? "var(--nocontesto)" : undefined }}>{d.totales.sinValidar}</b></div>
          <div className="metrica"><span className="rotulo">Total a pagar</span><b style={{ fontSize: 22, color: "var(--noquiso)" }}>{soles(d.totales.aPagar)}</b></div>
        </div>

        <div className="tarjeta">
          <h2>A pagar por persona</h2>
          <p className="sub">
            Comisiones {soles(d.totales.comisiones)} + S/ 10 por venta validada {soles(d.totales.fijos ?? 0)} + bonos {soles(d.totales.bonos)}{d.totales.incentivos > 0 ? ` + incentivo domingo ${soles(d.totales.incentivos)}` : ""}.
          </p>
          <div className="tabla-scroll"><table><tbody>
            <tr><th>Persona</th><th>Rol</th><th>Concepto</th><th>Operaciones</th><th>Base</th><th>%</th><th>Comisión</th><th>Validadas</th><th>S/ 10 c/u</th><th>Bono</th><th>Total</th></tr>
            {d.filas.map((f: any) => (
              <tr key={f.id}>
                <td><b>{f.nombre}</b></td>
                <td>{ROL[f.rol] ?? f.rol}</td>
                <td className="sub">{f.concepto}</td>
                <td className="mono">{f.operaciones}</td>
                <td className="mono">{f.base ? soles(f.base) : "—"}</td>
                <td className="mono">{f.tasa ? `${Math.round(f.tasa * 100)}%` : "—"}</td>
                <td className="mono">{f.comision ? soles(f.comision) : "—"}</td>
                <td className="mono">{f.validadas ?? 0}</td>
                <td className="mono">{f.fijo ? soles(f.fijo) : "—"}</td>
                <td className="mono">{f.bono ? soles(f.bono) : "—"}</td>
                <td className="mono" style={{ fontWeight: 700 }}>{soles(f.total)}</td>
              </tr>
            ))}
          </tbody></table></div>
          <div className="tip">
            Una misma venta paga a varias personas: el caller que la cerró, el procesador que cobró y el encargado de ese caller.
            Sumado, hoy estás pagando <b>{d.totales.vendido ? Math.round((d.totales.aPagar / d.totales.vendido) * 100) : 0}%</b> de lo vendido.
          </div>
        </div>

        <div className="tarjeta">
          <h2>Ventas de la semana</h2>
          <p className="sub">Validá las que confirmaste y anulá las que se cayeron. Una venta anulada no paga a nadie ni suma al ranking.</p>
          <input value={qVenta} onChange={(e) => setQVenta(e.target.value)} placeholder="Buscar por cliente, DNI, teléfono, caller, spamer o referencia…" style={{ marginBottom: 12 }} />
          {(() => {
            const norm = (x: string) => (x ?? "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
            const q = norm(qVenta.trim());
            const ventasFiltradas = q
              ? d.ventas.filter((v: any) => norm([v.cliente, v.dni, v.telefono, v.caller, v.spamer, v.procesador, v.referencia].join(" ")).includes(q))
              : d.ventas;
            return (
          <div className="tabla-scroll"><table><tbody>
            <tr><th>Fecha</th><th>Cliente</th><th>Caller</th><th>Spamer</th><th>Procesador</th><th>Monto</th><th>Ref.</th><th>Estado</th><th /></tr>
            {ventasFiltradas.map((v: any) => (
              <tr key={v.id} style={v.anulada ? { opacity: .55 } : undefined}>
                <td className="mono">{new Date(v.creadoEn).toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                <td>{v.cliente}<br /><span className="mono sub">{v.dni}</span></td>
                <td>{v.caller}</td>
                <td>{v.spamer}</td>
                <td>{v.procesador}</td>
                <td className="mono" style={{ fontWeight: 700 }}>{soles(v.monto)}{v.cuentaEmpresa && <><br /><span className="eti" style={{ color: "var(--volver)", borderColor: "var(--volver)" }}>empresa 5%</span></>}</td>
                <td className="mono">{v.referencia ?? "—"}</td>
                <td>
                  {v.anulada
                    ? <span className="eti" style={{ color: "var(--noquiso)", borderColor: "var(--noquiso)" }}>Anulada</span>
                    : v.validada
                      ? <span className="eti" style={{ color: "var(--acepto)", borderColor: "var(--acepto)" }}>Validada</span>
                      : <span className="eti" style={{ color: "var(--nocontesto)", borderColor: "var(--nocontesto)" }}>Sin revisar</span>}
                </td>
                <td style={{ display: "flex", gap: 6 }}>
                  {!v.validada && !v.anulada && <button className="btn chico" onClick={() => revisar(v.id, { validada: true })}>Validar</button>}
                  {!v.anulada
                    ? <button className="btn chico sec" onClick={() => confirm("¿Anular esta venta? Deja de pagar comisiones y no cuenta para el ranking.") && revisar(v.id, { anulada: true, validada: false })}>Anular</button>
                    : <button className="btn chico sec" onClick={() => revisar(v.id, { anulada: false })}>Restaurar</button>}
                  <button className="btn chico sec" onClick={() => {
                    const m = prompt("Corregir el monto en soles:", String(v.monto ?? 0));
                    if (m !== null && Number(m) > 0) revisar(v.id, { monto: Number(m) });
                  }}>Monto</button>
                  <button className="btn chico sec" onClick={() => setEditandoProc(v)}>Procesador</button>
                </td>
              </tr>
            ))}
            {!ventasFiltradas.length && <tr><td colSpan={9} style={{ color: "var(--tinta2)" }}>{d.ventas.length ? "Ninguna venta coincide con la búsqueda." : "Sin ventas esta semana."}</td></tr>}
          </tbody></table></div>
            );
          })()}
        </div>
      </>
    );
  }

  const m = d.mio;
  return (
    <>
      <div className="tarjeta" style={{ textAlign: "center", background: "linear-gradient(180deg,#14532D,#1B6B3A)", color: "#EAF4F6", border: 0 }}>
        <span className="rotulo" style={{ color: "#9FC9D2" }}>Llevás ganado esta semana</span>
        <div className="mono" style={{ fontSize: 52, fontWeight: 700, lineHeight: 1.1, margin: "4px 0" }}>{soles(m.total)}</div>
        <p style={{ opacity: .85, fontSize: 14 }}>
          {[
            m.comision > 0 && `${soles(m.comision)} de comisión`,
            m.fijo > 0 && `${soles(m.fijo)} por ${m.validadas} venta(s) validada(s)`,
            m.incentivo > 0 && `${soles(m.incentivo)} de incentivo domingo 🎁`,
            m.bono > 0 && `${soles(m.bono)} de bono`,
          ].filter(Boolean).join("  +  ") || "Todavía no sumaste esta semana"}
        </p>
      </div>

      <div className="grid4">
        <div className="metrica">
          <span className="rotulo">{m.rol === "CARGADOR" ? "Data subida" : m.rol === "PROCESADOR" ? "Pagos procesados" : m.rol === "ENCARGADO" ? "Ventas del equipo" : "Ventas"}</span>
          <b>{m.operaciones}</b>
        </div>
        <div className="metrica"><span className="rotulo">{m.rol === "CARGADOR" ? "Generado con tu data" : "Monto base"}</span><b style={{ fontSize: 21 }}>{soles(m.base)}</b></div>
        <div className="metrica"><span className="rotulo">Tu porcentaje</span><b>{m.tasa ? `${Math.round(m.tasa * 100)}%` : "—"}</b></div>
        <div className="metrica"><span className="rotulo">Sin validar</span><b style={{ color: m.pendientes ? "var(--nocontesto)" : undefined }}>{m.pendientes}</b></div>
      </div>

      <div className="tarjeta">
        <b>{m.concepto}</b>
        {["CALLER", "CARGADOR"].includes(m.rol) && (
          <p className="sub" style={{ marginTop: 6 }}>
            Además de tu porcentaje, cobrás <b>S/ {m.porValidada ?? 10} por cada venta validada</b>.
            Llevás <b>{m.validadas ?? 0}</b> validada(s) de {m.rol === "CALLER" ? m.detalle.filter((v: any) => !v.anulada).length : m.ventasGeneradas} —
            las que están “en revisión” pasan a contar cuando el supervisor las confirme.
          </p>
        )}
        {m.siguiente && (
          <>
            <p className="sub" style={{ marginTop: 8 }}>
              Te faltan <b>{m.siguiente.meta - m.operaciones}</b> para el bono de <b>S/ {m.siguiente.bono}</b>.
            </p>
            <div className="barra" style={{ marginTop: 8, height: 12 }}>
              <span style={{ width: `${Math.min(100, (m.operaciones / m.siguiente.meta) * 100)}%` }} />
            </div>
          </>
        )}
        {m.rol === "ENCARGADO" && !!m.equipo?.length && (
          <p className="sub" style={{ marginTop: 10 }}>
            Tu equipo: {m.equipo.map((x: any) => x.nombre).join(", ")}
          </p>
        )}
        {m.rol === "CARGADOR" && (
          <p className="sub" style={{ marginTop: 10 }}>
            Tu data generó <b>{m.ventasGeneradas}</b> venta(s) por {soles(m.base)}: cobrás el {Math.round(m.tasa * 100)}% de eso.
            {m.tasa > 0.1 && " Estás al 12% por haber ganado el ranking la semana pasada."}
          </p>
        )}
      </div>

      {Array.isArray(d.historial) && d.historial.length > 0 && (
        <div className="tarjeta">
          <h2>Lo que gané cada semana</h2>
          <p className="sub">Tu ganancia de cada semana (lunes a domingo), de la más reciente a la más antigua.</p>
          <div className="tabla-scroll" style={{ marginTop: 12 }}><table><tbody>
            <tr><th>Semana</th><th style={{ textAlign: "right" }}>Ganado</th></tr>
            {d.historial.map((h: any) => (
              <tr key={h.semana}>
                <td>{rangoSemana(h.semana)}{h.semana === d.desde?.slice(0, 10) ? <span className="sub"> · esta semana</span> : ""}</td>
                <td className="mono" style={{ textAlign: "right", fontWeight: 600, color: "var(--acepto)" }}>{soles(h.ganado)}</td>
              </tr>
            ))}
          </tbody></table></div>
        </div>
      )}

      <div className="tarjeta">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h2>Detalle de mis operaciones</h2>
          <button className="btn sec chico" style={{ marginLeft: "auto" }} onClick={() => setVerDetalle(!verDetalle)}>
            {verDetalle ? "Ocultar" : "Ver detalle"}
          </button>
        </div>
        <p className="sub">Con quién trabajaste cada venta: caller, spamer y procesador de pago.</p>
        {verDetalle && (
          <div className="tabla-scroll" style={{ marginTop: 12 }}><table><tbody>
            <tr><th>Fecha</th><th>Cliente</th><th>DNI</th><th>Caller</th><th>Spamer</th><th>Procesador</th><th>Monto</th><th>Te toca</th><th>Estado</th></tr>
            {m.detalle.map((v: any) => (
              <tr key={v.id} style={v.anulada ? { opacity: .5 } : undefined}>
                <td className="mono">{new Date(v.creadoEn).toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                <td>{v.cliente}</td>
                <td className="mono">{v.dni}</td>
                <td>{v.caller}</td>
                <td>{v.spamer}</td>
                <td>{v.procesador}</td>
                <td className="mono">{soles(v.monto)}</td>
                <td className="mono" style={{ color: "var(--acepto)", fontWeight: 600 }}>
                  {v.anulada ? "—" : soles(v.monto * m.tasa)}
                </td>
                <td>
                  {v.anulada
                    ? <span className="eti" style={{ color: "var(--noquiso)", borderColor: "var(--noquiso)" }}>Anulada</span>
                    : v.validada
                      ? <span className="eti" style={{ color: "var(--acepto)", borderColor: "var(--acepto)" }}>Validada</span>
                      : <span className="eti" style={{ color: "var(--nocontesto)", borderColor: "var(--nocontesto)" }}>En revisión</span>}
                </td>
              </tr>
            ))}
            {!m.detalle.length && <tr><td colSpan={9} style={{ color: "var(--tinta2)" }}>Todavía no hay operaciones esta semana.</td></tr>}
          </tbody></table></div>
        )}
      </div>
    </>
  );
}

/* Ventana para cambiar la gente a cargo de un encargado. */
function VentanaEquipo({ encargado, asignables, usuarios, cerrar, guardar }:
  { encargado: Usuario; asignables: Usuario[]; usuarios: Usuario[]; cerrar: () => void; guardar: (ids: string[]) => void }) {
  const [sel, setSel] = useState<string[]>(usuarios.filter((u) => u.encargadoId === encargado.id).map((u) => u.id));
  return (
    <div className="velo" onClick={cerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Equipo de {encargado.nombre}</h2>
        <p className="sub">Tocá para agregar o sacar personas. Cobra el 10% de las ventas de los que estén marcados.</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
          {asignables.map((u) => {
            const otro = u.encargadoId && u.encargadoId !== encargado.id
              ? usuarios.find((x) => x.id === u.encargadoId)?.nombre : null;
            return (
              <button key={u.id} type="button" className={`btn chico ${sel.includes(u.id) ? "" : "sec"}`}
                      onClick={() => setSel(sel.includes(u.id) ? sel.filter((x) => x !== u.id) : [...sel, u.id])}>
                {sel.includes(u.id) ? "✓ " : ""}{u.nombre}
                <span style={{ opacity: .7 }}> ({ROL[u.rol]}{otro ? ` · hoy con ${otro}` : ""})</span>
              </button>
            );
          })}
        </div>
        <div className="tip">Una persona puede tener un solo encargado: si la marcás acá, sale del equipo del otro.</div>
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button className="btn" style={{ flex: 1 }} onClick={() => guardar(sel)}>Guardar equipo ({sel.length})</button>
          <button className="btn sec" onClick={cerrar}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}


/* ============ FINANZAS (solo admin) ============ */
function Finanzas() {
  const [d, setD] = useState<any>(null);
  const [tab, setTab] = useState<"resumen" | "pagar" | "gastos" | "semanal" | "historial">("resumen");
  const [gasto, setGasto] = useState({ concepto: "", monto: "", fecha: "", categoria: "" });
  const [desde, setDesde] = useState(""), [hasta, setHasta] = useState("");
  const [boleta, setBoleta] = useState<any>(null);

  const traer = useCallback(() => {
    const q = new URLSearchParams();
    if (desde) q.set("desde", desde);
    if (hasta) q.set("hasta", hasta);
    fetch(`/api/finanzas?${q}`).then((r) => (r.ok ? r.json() : null)).then(setD);
  }, [desde, hasta]);
  useEffect(() => { traer(); }, [traer]);
  if (!d) return <div className="tarjeta">Cargando finanzas…</div>;

  const r = d.resumen;
  const fecha = (iso: string) => new Date(iso).toLocaleString("es", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  const soloDia = (dia: string) => new Date(dia + "T12:00:00").toLocaleDateString("es", { weekday: "short", day: "2-digit", month: "2-digit" });

  return (
    <>
      {boleta && <Boleta datos={boleta} cerrar={() => { setBoleta(null); traer(); }} />}

      <div className="tarjeta" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {([["resumen", "Resumen"], ["pagar", `Pagar (${d.trabajadores.filter((t: any) => t.saldo > 0.5).length})`], ["gastos", "Gastos"], ["semanal", "📅 Por semana"], ["historial", "Historial de pagos"]] as [any, string][])
          .map(([k, t]) => (
            <button key={k} className={`btn chico ${tab === k ? "" : "sec"}`} onClick={() => setTab(k)}>{t}</button>
          ))}
      </div>

      {tab === "resumen" && (
        <>
          <div className="grid4">
            <div className="metrica"><span className="rotulo">Vendido histórico</span><b style={{ fontSize: 21 }}>{soles(r.vendidoTotal)}</b></div>
            <div className="metrica"><span className="rotulo">Pagos al equipo</span><b style={{ fontSize: 21 }}>{soles(r.totalGanado)}</b></div>
            <div className="metrica"><span className="rotulo">Gastos operativos</span><b style={{ fontSize: 21 }}>{soles(r.operativos ?? 0)}</b></div>
            <div className="metrica">
              <span className="rotulo">Utilidad</span>
              <b style={{ fontSize: 21, color: r.utilidad >= 0 ? "var(--acepto)" : "var(--noquiso)" }}>{soles(r.utilidad)}</b>
            </div>
          </div>

          <div className="tarjeta">
            <h2>Cómo se reparte lo vendido</h2>
            <div className="tabla-scroll"><table><tbody>
              <tr><th>Concepto</th><th style={{ textAlign: "right" }}>Monto</th><th style={{ textAlign: "right" }}>% de lo vendido</th></tr>
              {[
                ["Ventas cobradas", r.vendidoTotal, 1],
                ["Comisiones por porcentaje", -r.comisiones, r.comisiones / (r.vendidoTotal || 1)],
                ["Pagos fijos (S/ 10 por venta validada)", -r.fijos, r.fijos / (r.vendidoTotal || 1)],
                ["Bonos del cielo es el límite", -r.bonos, r.bonos / (r.vendidoTotal || 1)],
                ["Gastos operativos", -(r.operativos ?? 0), (r.operativos ?? 0) / (r.vendidoTotal || 1)],
              ].map(([txt, monto, pct]: any) => (
                <tr key={txt}>
                  <td>{txt}</td>
                  <td className="mono" style={{ textAlign: "right", color: monto < 0 ? "var(--noquiso)" : undefined }}>
                    {monto < 0 ? "− " : ""}{soles(Math.abs(monto))}
                  </td>
                  <td className="mono" style={{ textAlign: "right" }}>{Math.round(pct * 100)}%</td>
                </tr>
              ))}
              <tr style={{ background: "#F6F9F3", fontWeight: 700 }}>
                <td>Te queda</td>
                <td className="mono" style={{ textAlign: "right", color: r.utilidad >= 0 ? "var(--acepto)" : "var(--noquiso)" }}>{soles(r.utilidad)}</td>
                <td className="mono" style={{ textAlign: "right" }}>{Math.round((r.utilidad / (r.vendidoTotal || 1)) * 100)}%</td>
              </tr>
            </tbody></table></div>
            <div className="tip">Pendiente de pagar al equipo: <b>{soles(r.porPagar)}</b> · ya pagado: {soles(r.totalPagado)}</div>
          </div>

          <div className="tarjeta">
            <h2>Ventas por día</h2>
            <div className="grid2" style={{ marginBottom: 12 }}>
              <div><label>Desde</label><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
              <div><label>Hasta</label><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
            </div>
            {(desde || hasta) && (
              <div className="tip">
                En el rango elegido: <b>{soles(d.vendidoRango)}</b> en {d.diasRango.reduce((n: number, x: any) => n + x.ventas, 0)} venta(s).
                <button className="btn sec chico" style={{ marginLeft: 10 }} onClick={() => { setDesde(""); setHasta(""); }}>Ver todo</button>
              </div>
            )}
            <div className="tabla-scroll"><table><tbody>
              <tr><th>Día</th><th>Ventas</th><th>Validadas</th><th style={{ textAlign: "right" }}>Vendido</th><th style={{ width: "35%" }} /></tr>
              {(desde || hasta ? d.diasRango : d.dias).slice(0, 40).map((x: any) => {
                const max = Math.max(...d.dias.map((y: any) => y.monto), 1);
                return (
                  <tr key={x.dia}>
                    <td className="mono">{soloDia(x.dia)}</td>
                    <td className="mono">{x.ventas}</td>
                    <td className="mono">{x.validadas}</td>
                    <td className="mono" style={{ textAlign: "right", fontWeight: 600 }}>{soles(x.monto)}</td>
                    <td><div className="barra"><span style={{ width: `${(x.monto / max) * 100}%` }} /></div></td>
                  </tr>
                );
              })}
              {!d.dias.length && <tr><td colSpan={5} style={{ color: "var(--tinta2)" }}>Todavía no hay ventas.</td></tr>}
            </tbody></table></div>
          </div>
        </>
      )}

      {tab === "pagar" && <Pagar trabajadores={d.trabajadores} alPagar={setBoleta} />}

      {tab === "gastos" && (
        <div className="tarjeta">
          <h2>Gastos operativos</h2>
          <p className="sub">Aparte del 20% de inversión. Todo lo que cargues acá se resta de tu utilidad.</p>
          <div className="grid4" style={{ alignItems: "end", marginTop: 6 }}>
            <div style={{ gridColumn: "span 2" }}>
              <label>Concepto</label>
              <input value={gasto.concepto} onChange={(e) => setGasto({ ...gasto, concepto: e.target.value })} placeholder="Ej: recarga de minutos, alquiler, publicidad" />
            </div>
            <div><label>Monto (S/)</label>
              <input className="mono" inputMode="decimal" value={gasto.monto} onChange={(e) => setGasto({ ...gasto, monto: e.target.value.replace(/[^\d.]/g, "") })} placeholder="0.00" />
            </div>
            <div><label>Fecha</label>
              <input type="date" value={gasto.fecha} onChange={(e) => setGasto({ ...gasto, fecha: e.target.value })} />
            </div>
          </div>
          <button className="btn" style={{ marginTop: 12 }} disabled={!gasto.concepto.trim() || !(Number(gasto.monto) > 0)}
                  onClick={async () => {
                    await fetch("/api/gastos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(gasto) });
                    setGasto({ concepto: "", monto: "", fecha: "", categoria: "" }); traer();
                  }}>Agregar gasto</button>

          <div className="tabla-scroll" style={{ marginTop: 16 }}><table><tbody>
            <tr><th>Fecha</th><th>Concepto</th><th style={{ textAlign: "right" }}>Monto</th><th /></tr>
            {d.gastos?.map((g: any) => (
              <tr key={g.id}>
                <td className="mono">{new Date(g.fecha).toLocaleDateString("es", { day: "2-digit", month: "2-digit", year: "2-digit" })}</td>
                <td>{g.concepto}</td>
                <td className="mono" style={{ textAlign: "right", fontWeight: 600, color: "var(--noquiso)" }}>− {soles(g.monto)}</td>
                <td>
                  <button className="btn chico sec" onClick={async () => {
                    if (!confirm(`¿Eliminar el gasto "${g.concepto}" de ${soles(g.monto)}?`)) return;
                    await fetch("/api/gastos", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: g.id }) });
                    traer();
                  }}>Eliminar</button>
                </td>
              </tr>
            ))}
            {!d.gastos?.length && <tr><td colSpan={4} style={{ color: "var(--tinta2)" }}>Todavía no cargaste gastos.</td></tr>}
          </tbody></table></div>
          {!!d.gastos?.length && <div className="tip">Total de gastos operativos: <b>{soles(d.resumen.operativos ?? 0)}</b> — ya descontados de tu utilidad.</div>}
        </div>
      )}

      {tab === "semanal" && (
        <>
          <div className="tarjeta">
            <h2>Ganancias por semana</h2>
            <p className="sub">Lo que ganó cada trabajador en cada semana (lunes a domingo). Sirve para ver cuánto te toca pagar por semana.</p>
          </div>
          {(!d.historialSemanal || !d.historialSemanal.length) && (
            <div className="tarjeta"><p className="sub">Todavía no hay semanas con ganancias registradas.</p></div>
          )}
          {(d.historialSemanal ?? []).map((sem: any) => (
            <div className="tarjeta" key={sem.semana}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <h3 style={{ fontSize: 16 }}>Semana del {rangoSemana(sem.semana)}</h3>
                <span className="mono" style={{ marginLeft: "auto", fontWeight: 700, color: "var(--acepto)" }}>Total: {soles(sem.total)}</span>
              </div>
              <div className="tabla-scroll" style={{ marginTop: 10 }}><table><tbody>
                <tr><th>Trabajador</th><th>Rol</th><th style={{ textAlign: "right" }}>Ganó</th></tr>
                {sem.trabajadores.map((t: any, i: number) => (
                  <tr key={i}>
                    <td><b>{t.nombre}</b></td>
                    <td className="sub">{ROL[t.rol] ?? t.rol}</td>
                    <td className="mono" style={{ textAlign: "right", fontWeight: 600 }}>{soles(t.ganado)}</td>
                  </tr>
                ))}
              </tbody></table></div>
            </div>
          ))}
        </>
      )}

      {tab === "historial" && (
        <div className="tarjeta">
          <h2>Historial de pagos</h2>
          <p className="sub">Todo lo que le pagaste a cada persona, con la fecha y el método.</p>
          <div className="tabla-scroll"><table><tbody>
            <tr><th>Fecha</th><th>Persona</th><th>Concepto</th><th>Método</th><th>Lote</th><th style={{ textAlign: "right" }}>Monto</th><th /></tr>
            {d.pagos.map((p: any) => (
              <tr key={p.id}>
                <td className="mono">{fecha(p.creadoEn)}</td>
                <td><b>{p.nombre}</b></td>
                <td className="sub">{p.concepto}</td>
                <td>{p.metodo ?? "—"}</td>
                <td className="mono sub">{p.lote}</td>
                <td className="mono" style={{ textAlign: "right", fontWeight: 700 }}>{soles(p.monto)}</td>
                <td>
                  <button className="btn chico sec" onClick={async () => {
                    if (!confirm(`¿Anular el pago de ${soles(p.monto)} a ${p.nombre}? Vuelve a quedar como saldo pendiente.`)) return;
                    await fetch("/api/finanzas", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id }) });
                    traer();
                  }}>Anular</button>
                </td>
              </tr>
            ))}
            {!d.pagos.length && <tr><td colSpan={7} style={{ color: "var(--tinta2)" }}>Todavía no registraste pagos.</td></tr>}
          </tbody></table></div>
          {!!d.pagos.length && (
            <div className="tip">Total pagado hasta hoy: <b>{soles(d.resumen.totalPagado)}</b></div>
          )}
        </div>
      )}
    </>
  );
}

/* Pantalla para pagar: se elige a quién y cuánto, y sale la boleta. */
function Pagar({ trabajadores, alPagar }: { trabajadores: any[]; alPagar: (b: any) => void }) {
  const conSaldo = trabajadores.filter((t) => t.saldo > 0.5);
  const [montos, setMontos] = useState<Record<string, string>>({});
  const [verPre, setVerPre] = useState<any>(null);
  const [metodo, setMetodo] = useState("Efectivo");
  const [nota, setNota] = useState("");
  const [msg, setMsg] = useState("");

  const valor = (t: any) => montos[t.id] !== undefined ? Number(montos[t.id] || 0) : t.saldo;
  const marcados = conSaldo.filter((t) => valor(t) > 0);
  const total = marcados.reduce((n, t) => n + valor(t), 0);

  async function pagar() {
    const cuerpo = {
      metodo, nota,
      pagos: marcados.map((t) => ({ usuarioId: t.id, monto: Number(valor(t).toFixed(2)), concepto: `Pago a ${ROL[t.rol]}` })),
    };
    const r = await fetch("/api/finanzas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
    const res = await r.json();
    if (!r.ok) return setMsg(res.error ?? "No se pudo registrar el pago.");
    alPagar({
      lote: res.lote, metodo, nota, fecha: new Date().toISOString(),
      lineas: marcados.map((t) => ({ ...t, pagado: valor(t) })), total,
    });
  }

  return (
    <div className="tarjeta">
      {verPre && <PredPago persona={verPre} cerrar={() => setVerPre(null)} />}
      <h2>Pagar al equipo</h2>
      <p className="sub">
        Podés pagar cualquier día y cuantas veces quieras: el sistema lleva el saldo. Por defecto viene cargado
        el saldo completo de cada uno, pero podés poner menos y el resto queda pendiente.
      </p>

      <div className="tabla-scroll" style={{ marginTop: 14 }}><table><tbody>
        <tr><th>Persona</th><th>Rol</th><th>Ganado</th><th>Ya pagado</th><th>Saldo</th><th style={{ width: 150 }}>A pagar ahora</th><th /></tr>
        {conSaldo.map((t) => (
          <tr key={t.id}>
            <td><b>{t.nombre}</b><br /><span className="mono sub">{t.usuario}</span></td>
            <td>{ROL[t.rol] ?? t.rol}</td>
            <td className="mono">{soles(t.ganado)}</td>
            <td className="mono">{soles(t.pagado)}</td>
            <td className="mono" style={{ fontWeight: 700 }}>{soles(t.saldo)}</td>
            <td>
              <input className="mono" inputMode="decimal" style={{ textAlign: "right" }}
                     value={montos[t.id] ?? t.saldo.toFixed(2)}
                     onChange={(e) => setMontos({ ...montos, [t.id]: e.target.value.replace(/[^\d.]/g, "") })} />
            </td>
            <td><button className="btn chico sec" onClick={() => setVerPre(t)}>Ver detalle</button></td>
          </tr>
        ))}
        {!conSaldo.length && <tr><td colSpan={7} style={{ color: "var(--tinta2)" }}>Nadie tiene saldo pendiente. Todo al día. 👌</td></tr>}
      </tbody></table></div>

      {!!conSaldo.length && (
        <>
          <div className="grid2" style={{ marginTop: 14 }}>
            <div><label>Método de pago</label>
              <select value={metodo} onChange={(e) => setMetodo(e.target.value)}>
                <option>Efectivo</option><option>Yape</option><option>Plin</option>
                <option>Transferencia</option><option>Otro</option>
              </select>
            </div>
            <div><label>Nota (opcional)</label><input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej: adelanto de la semana" /></div>
          </div>
          {msg && <div className="error">{msg}</div>}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 16, flexWrap: "wrap" }}>
            <div>
              <span className="rotulo">Total a pagar</span>
              <div className="mono" style={{ fontSize: 30, fontWeight: 700 }}>{soles(total)}</div>
            </div>
            <button className="btn" style={{ marginLeft: "auto" }} disabled={!marcados.length} onClick={pagar}>
              Registrar pago y emitir boleta
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* Boleta detallada, lista para imprimir o guardar como PDF. */
function Boleta({ datos, cerrar }: { datos: any; cerrar: () => void }) {
  return (
    <div className="velo" onClick={cerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div id="boleta">
          <div style={{ textAlign: "center", borderBottom: "2px solid var(--linea)", paddingBottom: 12 }}>
            <h2 style={{ fontSize: 22 }}>LIMA LIMÓN</h2>
            <p className="sub">Boleta de pago al equipo</p>
            <p className="mono" style={{ fontSize: 13 }}>
              Lote {datos.lote} · {new Date(datos.fecha).toLocaleString("es")}
            </p>
          </div>

          <table style={{ marginTop: 14 }}><tbody>
            <tr><th>Persona</th><th>Rol</th><th>Detalle</th><th style={{ textAlign: "right" }}>Pagado</th></tr>
            {datos.lineas.map((l: any) => (
              <tr key={l.id}>
                <td><b>{l.nombre}</b></td>
                <td>{ROL[l.rol] ?? l.rol}</td>
                <td className="sub">
                  {l.comision > 0 && <>comisión {soles(l.comision)}<br /></>}
                  {l.fijo > 0 && <>{l.validadas} validada(s) → fijo {soles(l.fijo)}<br /></>}
                  {l.bono > 0 && <>bonos {soles(l.bono)}<br /></>}
                  {l.pagado < l.saldo && <b>queda pendiente {soles(l.saldo - l.pagado)}</b>}
                </td>
                <td className="mono" style={{ textAlign: "right", fontWeight: 700 }}>{soles(l.pagado)}</td>
              </tr>
            ))}
            <tr style={{ background: "#F6F9F3" }}>
              <td colSpan={3} style={{ fontWeight: 700 }}>TOTAL · {datos.metodo}</td>
              <td className="mono" style={{ textAlign: "right", fontWeight: 700, fontSize: 17 }}>{soles(datos.total)}</td>
            </tr>
          </tbody></table>

          {datos.nota && <p className="sub" style={{ marginTop: 10 }}>Nota: {datos.nota}</p>}
          <p className="sub" style={{ marginTop: 14, textAlign: "center" }}>
            Documento interno de control. No es comprobante de pago electrónico.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button className="btn" style={{ flex: 1 }} onClick={() => window.print()}>Imprimir o guardar PDF</button>
          <button className="btn sec" onClick={cerrar}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}


/* Pre-pago: el detalle completo del trabajo de una persona, listo para PDF. */
function PredPago({ persona: t, cerrar }: { persona: any; cerrar: () => void }) {
  const hoy = new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });
  const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit" });
  const detalle = t.detalle ?? [];
  const validadas = detalle.filter((v: any) => v.validada);

  // Etiquetas según el rol.
  const cfgs: Record<string, { titulo: string; col: string; muestra: string }> = {
    CALLER:    { titulo: "clientes que aceptaron", col: "Cliente", muestra: "caller" },
    CARGADOR:  { titulo: "ventas generadas por tu data", col: "Cliente", muestra: "spamer" },
    PROCESADOR:{ titulo: "pagos procesados", col: "Cliente", muestra: "proc" },
    ENCARGADO: { titulo: "ventas de tu equipo", col: "Cliente", muestra: "equipo" },
  };
  const cfg = cfgs[t.rol] ?? { titulo: "operaciones", col: "Cliente", muestra: "" };

  return (
    <div className="velo" onClick={cerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
        <div id="boleta">
          <div style={{ textAlign: "center", borderBottom: "2px solid var(--linea)", paddingBottom: 12 }}>
            <h2 style={{ fontSize: 22 }}>LIMA LIMÓN</h2>
            <p className="sub">Detalle de trabajo y liquidación</p>
            <p className="mono" style={{ fontSize: 13 }}>{hoy}</p>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, flexWrap: "wrap", gap: 8 }}>
            <div>
              <span className="rotulo">Trabajador</span>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{t.nombre}</div>
              <div className="sub">{ROL[t.rol] ?? t.rol}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <span className="rotulo">Saldo a pagar hoy</span>
              <div className="mono" style={{ fontSize: 26, fontWeight: 700, color: "var(--acepto)" }}>{soles(t.saldo)}</div>
            </div>
          </div>

          {t.rol === "ENCARGADO" && !!t.equipo?.length && (
            <p className="sub" style={{ marginTop: 8 }}>Equipo a cargo: {t.equipo.map((x: any) => x.nombre).join(", ")}</p>
          )}

          <h3 style={{ marginTop: 18, fontSize: 15 }}>Detalle de {cfg.titulo} ({detalle.length})</h3>
          <table style={{ marginTop: 6 }}><tbody>
            <tr>
              <th>Fecha</th><th>{cfg.col}</th><th>DNI</th>
              {cfg.muestra === "spamer" && <th>Caller</th>}
              {cfg.muestra === "equipo" && <th>Caller</th>}
              {cfg.muestra === "caller" && <th>Spamer</th>}
              <th style={{ textAlign: "right" }}>Monto</th><th>Estado</th>
            </tr>
            {detalle.map((v: any, i: number) => (
              <tr key={i} style={{ opacity: v.validada ? 1 : 0.6 }}>
                <td className="mono">{fecha(v.fecha)}</td>
                <td>{v.cliente}</td>
                <td className="mono">{v.dni}</td>
                {(cfg.muestra === "spamer" || cfg.muestra === "equipo") && <td>{v.caller}</td>}
                {cfg.muestra === "caller" && <td>{v.spamer}</td>}
                <td className="mono" style={{ textAlign: "right" }}>{soles(v.monto)}</td>
                <td>{v.validada ? "✓ validada" : "en revisión"}</td>
              </tr>
            ))}
            {!detalle.length && <tr><td colSpan={6} style={{ color: "var(--tinta2)" }}>Sin operaciones registradas.</td></tr>}
          </tbody></table>

          <h3 style={{ marginTop: 18, fontSize: 15 }}>Cómo se calcula tu pago</h3>
          <table style={{ marginTop: 6 }}><tbody>
            {t.rol !== "PROCESADOR" && t.rol !== "ENCARGADO" ? (
              <>
                <tr><td>Ventas / data validada</td><td className="mono" style={{ textAlign: "right" }}>{validadas.length} de {detalle.length}</td></tr>
                <tr><td>Comisión (% sobre lo vendido validado)</td><td className="mono" style={{ textAlign: "right" }}>{soles(t.comision)}</td></tr>
                <tr><td>Pago fijo (S/ 10 por venta validada)</td><td className="mono" style={{ textAlign: "right" }}>{soles(t.fijo)}</td></tr>
                {t.rol === "CALLER" && t.incentivo > 0 && <tr><td>🎁 Incentivo domingo (5% extra)</td><td className="mono" style={{ textAlign: "right", color: "var(--acepto)" }}>{soles(t.incentivo)}</td></tr>}
                <tr><td>Bono “El cielo es el límite”</td><td className="mono" style={{ textAlign: "right" }}>{t.bono ? soles(t.bono) : "—"}</td></tr>
              </>
            ) : (
              <tr><td>Comisión ({t.rol === "PROCESADOR" ? "10% de lo procesado" : "10% de las ventas del equipo"})</td><td className="mono" style={{ textAlign: "right" }}>{soles(t.comision)}</td></tr>
            )}
            <tr style={{ fontWeight: 700 }}><td>Total ganado</td><td className="mono" style={{ textAlign: "right" }}>{soles(t.ganado)}</td></tr>
            <tr><td>Ya cobrado antes</td><td className="mono" style={{ textAlign: "right" }}>− {soles(t.pagado)}</td></tr>
            <tr style={{ background: "#F6F9F3", fontWeight: 700 }}>
              <td>SALDO A PAGAR HOY</td>
              <td className="mono" style={{ textAlign: "right", fontSize: 16, color: "var(--acepto)" }}>{soles(t.saldo)}</td>
            </tr>
          </tbody></table>

          {t.rol === "CALLER" && !!t.diasFijo?.length && (
            <>
              <h3 style={{ marginTop: 18, fontSize: 15 }}>Fijo por día (S/10 por cada venta validada)</h3>
              <table style={{ marginTop: 6 }}><tbody>
                <tr><th>Día</th><th style={{ textAlign: "right" }}>Ventas validadas</th><th style={{ textAlign: "right" }}>Fijo</th></tr>
                {t.diasFijo.map((d: any) => (
                  <tr key={d.dia} style={{ opacity: d.paga ? 1 : 0.55 }}>
                    <td className="mono">{new Date(d.dia + "T12:00:00").toLocaleDateString("es", { day: "2-digit", month: "2-digit" })}</td>
                    <td className="mono" style={{ textAlign: "right", color: "var(--acepto)" }}>{d.validadas}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{d.paga ? soles(d.validadas * 10) : "—"}</td>
                  </tr>
                ))}
              </tbody></table>
              <p className="sub" style={{ marginTop: 6 }}>Se paga S/10 por cada venta validada, desde la primera.</p>
            </>
          )}

          <p className="sub" style={{ marginTop: 14, textAlign: "center" }}>
            Solo cuentan las ventas validadas. Documento interno de control, no es comprobante de pago electrónico.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button className="btn" style={{ flex: 1 }} onClick={() => window.print()}>Descargar PDF / Imprimir</button>
          <button className="btn sec" onClick={cerrar}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}


/* ============ META Y PROYECCIÓN (solo admin) ============ */
function Meta() {
  const [d, setD] = useState<any>(null);
  const [editar, setEditar] = useState(false);
  const [meta, setMeta] = useState("1000000"), [fecha, setFecha] = useState("");

  const traer = useCallback(() => {
    fetch("/api/metas").then((r) => (r.ok ? r.json() : null)).then((x) => {
      setD(x); if (x) { setMeta(String(x.metaUtilidad)); setFecha(x.metaFecha ?? ""); }
    });
  }, []);
  useEffect(() => { traer(); }, [traer]);
  if (!d) return <div className="tarjeta">Cargando…</div>;

  async function guardar() {
    await fetch("/api/metas", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metaUtilidad: Number(meta), metaFecha: fecha }) });
    setEditar(false); traer();
  }

  const pct = Math.min(100, (d.utilidadAcumulada / d.metaUtilidad) * 100);
  const semLabel = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("es", { day: "2-digit", month: "2-digit" });
  const maxU = Math.max(...d.series.map((x: any) => x.utilidad), 1);

  return (
    <>
      <div className="tarjeta" style={{ textAlign: "center", background: "linear-gradient(180deg,#14532D,#1B6B3A)", color: "#EAF4F6", border: 0 }}>
        <span className="rotulo" style={{ color: "#9FC9D2" }}>Utilidad acumulada hacia la meta</span>
        <div className="mono" style={{ fontSize: 46, fontWeight: 700, lineHeight: 1.1, margin: "4px 0" }}>{soles(d.utilidadAcumulada)}</div>
        <p style={{ opacity: .9 }}>de {soles(d.metaUtilidad)} · {pct.toFixed(1)}%</p>
        <div className="barra" style={{ marginTop: 12, height: 16, background: "rgba(255,255,255,.2)" }}>
          <span style={{ width: `${pct}%`, background: "var(--lima-pulpa)" }} />
        </div>
      </div>

      <div className="grid4">
        <div className="metrica"><span className="rotulo">Margen real</span><b style={{ fontSize: 22, color: "var(--acepto)" }}>{Math.round(d.margenActual * 100)}%</b></div>
        <div className="metrica"><span className="rotulo">Utilidad por semana (ritmo)</span><b style={{ fontSize: 20 }}>{soles(d.ritmoSemanal)}</b></div>
        <div className="metrica"><span className="rotulo">Te falta</span><b style={{ fontSize: 20 }}>{soles(d.falta)}</b></div>
        <div className="metrica">
          <span className="rotulo">Al ritmo actual llegás en</span>
          <b style={{ fontSize: 20 }}>{d.semanasRestantes ? `${d.semanasRestantes} sem` : "—"}</b>
        </div>
      </div>

      {d.metaFecha && (
        <div className="tarjeta" style={{ borderLeft: `6px solid ${d.enCamino ? "var(--acepto)" : "var(--noquiso)"}` }}>
          <h2>{d.enCamino ? "✅ Vas en camino" : "⚠️ Vas atrasado para la fecha"}</h2>
          <p className="sub">Meta para el {new Date(d.metaFecha).toLocaleDateString("es", { day: "2-digit", month: "long", year: "numeric" })} · quedan {d.semanasHastaFecha} semana(s).</p>
          <div className="grid2" style={{ marginTop: 12 }}>
            <div className="metrica">
              <span className="rotulo">Utilidad que necesitás por semana</span>
              <b style={{ fontSize: 22 }}>{soles(d.utilidadSemanalNecesaria)}</b>
              <span className="sub">hoy hacés {soles(d.ritmoSemanal)}</span>
            </div>
            <div className="metrica">
              <span className="rotulo">Para eso tenés que vender por semana</span>
              <b style={{ fontSize: 22 }}>{d.ventaSemanalNecesaria ? soles(d.ventaSemanalNecesaria) : "—"}</b>
              <span className="sub">a tu margen del {Math.round(d.margenActual * 100)}%</span>
            </div>
          </div>
          {!d.enCamino && d.ritmoSemanal > 0 && (
            <div className="tip">
              Para llegar a tiempo necesitás casi <b>{Math.ceil(d.utilidadSemanalNecesaria / d.ritmoSemanal)}×</b> tu ritmo actual.
              Cada punto de margen que recuperás baja la venta que necesitás: subir del {Math.round(d.margenActual * 100)}% al {Math.round(d.margenActual * 100) + 5}% te ahorra {soles(d.utilidadSemanalNecesaria / d.margenActual - d.utilidadSemanalNecesaria / (d.margenActual + 0.05))} de venta semanal.
            </div>
          )}
        </div>
      )}

      <div className="tarjeta">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h2>Utilidad y margen por semana</h2>
          <button className="btn sec chico" style={{ marginLeft: "auto" }} onClick={() => setEditar(!editar)}>
            {editar ? "Cerrar" : "Configurar meta"}
          </button>
        </div>

        {editar && (
          <div className="grid2" style={{ margin: "12px 0", padding: 12, background: "var(--papel)", borderRadius: 10 }}>
            <div><label>Meta de utilidad (S/)</label><input className="mono" value={meta} onChange={(e) => setMeta(e.target.value.replace(/[^\d]/g, ""))} /></div>
            <div><label>Fecha objetivo</label><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
            <button className="btn" style={{ gridColumn: "span 2" }} onClick={guardar}>Guardar meta</button>
          </div>
        )}

        <div className="tabla-scroll"><table><tbody>
          <tr><th>Semana</th><th style={{ textAlign: "right" }}>Vendido</th><th style={{ textAlign: "right" }}>Utilidad</th><th style={{ textAlign: "right" }}>Margen</th><th style={{ width: "30%" }} /></tr>
          {[...d.series].reverse().map((x: any) => (
            <tr key={x.semana}>
              <td className="mono">{semLabel(x.semana)}</td>
              <td className="mono" style={{ textAlign: "right" }}>{soles(x.vendido)}</td>
              <td className="mono" style={{ textAlign: "right", fontWeight: 600, color: "var(--acepto)" }}>{soles(x.utilidad)}</td>
              <td className="mono" style={{ textAlign: "right" }}>{Math.round(x.margen * 100)}%</td>
              <td><div className="barra"><span style={{ width: `${(x.utilidad / maxU) * 100}%` }} /></div></td>
            </tr>
          ))}
          {!d.series.length && <tr><td colSpan={5} style={{ color: "var(--tinta2)" }}>Todavía no hay semanas con ventas.</td></tr>}
        </tbody></table></div>
        <div className="tip">
          Vigilá la columna <b>Margen</b>: si baja mientras crecés, el crecimiento te está comiendo la ganancia.
          Mantener el margen vale más que sumar ventas.
        </div>
      </div>
    </>
  );
}


/* ============ MIS FINANZAS (personal, solo el admin) ============ */
const CAT_GASTO = ["Comida", "Transporte", "Ocio", "Compras", "Servicios", "Salud", "Hogar", "Otros"];

function Personal() {
  const [d, setD] = useState<any>(null);
  const [tab, setTab] = useState<"panel" | "registrar" | "presupuestos" | "config">("panel");
  const [mes, setMes] = useState("");
  const traer = useCallback(() => {
    fetch(`/api/personal${mes ? `?mes=${mes}` : ""}`).then((r) => (r.ok ? r.json() : null)).then(setD);
  }, [mes]);
  useEffect(() => { traer(); }, [traer]);
  if (!d) return <div className="tarjeta">Cargando…</div>;

  const mesLindo = (m: string) => new Date(m + "-15").toLocaleDateString("es", { month: "long", year: "numeric" });

  return (
    <>
      <div className="tarjeta" style={{ background: "#FEF9E7", borderLeft: "5px solid var(--ambar)" }}>
        <b>🔒 Espacio privado.</b> Esto es tu control personal de plata, separado del negocio. Nadie del equipo lo ve.
      </div>

      {!!d.alertas.length && (
        <div className="tarjeta" style={{ borderLeft: "5px solid var(--noquiso)", background: "#FDEDEC" }}>
          <b style={{ color: "var(--noquiso)" }}>⚠️ Alertas de gasto</b>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            {d.alertas.map((a: any) => (
              <li key={a.categoria}>
                {a.excedido
                  ? <><b>{a.categoria}</b>: te pasaste del límite ({soles(a.gastado)} de {soles(a.limite)})</>
                  : <><b>{a.categoria}</b>: estás cerca del límite ({soles(a.gastado)} de {soles(a.limite)})</>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="tarjeta" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {([["panel", "Panel"], ["registrar", "Registrar"], ["presupuestos", "Presupuestos"], ["config", "Ajustes"]] as [any, string][])
          .map(([k, t]) => <button key={k} className={`btn chico ${tab === k ? "" : "sec"}`} onClick={() => setTab(k)}>{t}</button>)}
        {d.mesesDisponibles.length > 1 && (
          <select style={{ marginLeft: "auto", width: "auto" }} value={mes || d.mes} onChange={(e) => setMes(e.target.value)}>
            {d.mesesDisponibles.map((m: string) => <option key={m} value={m}>{mesLindo(m)}</option>)}
          </select>
        )}
      </div>

      {tab === "panel" && (
        <>
          <div className="grid4">
            <div className="metrica"><span className="rotulo">Saldo actual</span><b style={{ fontSize: 22 }}>{soles(d.saldoActual)}</b></div>
            <div className="metrica"><span className="rotulo">Ingresos del mes</span><b style={{ fontSize: 20, color: "var(--acepto)" }}>{soles(d.ingresosMes)}</b></div>
            <div className="metrica"><span className="rotulo">Gastos del mes</span><b style={{ fontSize: 20, color: "var(--noquiso)" }}>{soles(d.gastosMes)}</b></div>
            <div className="metrica">
              <span className="rotulo">Ahorro del mes</span>
              <b style={{ fontSize: 20, color: d.ahorroMes >= 0 ? "var(--acepto)" : "var(--noquiso)" }}>{soles(d.ahorroMes)}</b>
            </div>
          </div>

          {d.metaAhorro > 0 && (
            <div className="tarjeta" style={{ borderLeft: `5px solid ${d.cumpleAhorro ? "var(--acepto)" : "var(--ambar)"}` }}>
              <b>{d.cumpleAhorro ? "✅ Vas cumpliendo tu meta de ahorro" : "🎯 Meta de ahorro del mes"}</b>
              <p className="sub" style={{ marginTop: 4 }}>Meta: {soles(d.metaAhorro)} · llevás {soles(d.ahorroMes)}</p>
              <div className="barra" style={{ marginTop: 8, height: 12 }}>
                <span style={{ width: `${Math.min(100, Math.max(0, (d.ahorroMes / d.metaAhorro) * 100))}%` }} />
              </div>
            </div>
          )}

          <div className="tarjeta">
            <h2>Gasto por categoría · {mesLindo(d.mes)}</h2>
            <div className="tabla-scroll"><table><tbody>
              <tr><th>Categoría</th><th style={{ textAlign: "right" }}>Gastado</th><th style={{ textAlign: "right" }}>Límite</th><th style={{ width: "35%" }} /></tr>
              {d.categorias.map((c: any) => (
                <tr key={c.categoria}>
                  <td><b>{c.categoria}</b></td>
                  <td className="mono" style={{ textAlign: "right", color: c.excedido ? "var(--noquiso)" : undefined }}>{soles(c.gastado)}</td>
                  <td className="mono" style={{ textAlign: "right" }}>{c.limite ? soles(c.limite) : "—"}</td>
                  <td>
                    {c.limite ? (
                      <div className="barra" title={`${c.pct}%`}>
                        <span style={{ width: `${Math.min(100, c.pct)}%`, background: c.excedido ? "var(--noquiso)" : c.cerca ? "var(--ambar)" : "var(--acepto)" }} />
                      </div>
                    ) : <span className="sub">sin límite</span>}
                  </td>
                </tr>
              ))}
              {!d.categorias.length && <tr><td colSpan={4} style={{ color: "var(--tinta2)" }}>Sin gastos este mes.</td></tr>}
            </tbody></table></div>
          </div>

          {d.tendencia.length > 1 && (
            <div className="tarjeta">
              <h2>Últimos meses</h2>
              <div className="tabla-scroll"><table><tbody>
                <tr><th>Mes</th><th style={{ textAlign: "right" }}>Ingresos</th><th style={{ textAlign: "right" }}>Gastos</th><th style={{ textAlign: "right" }}>Ahorro</th></tr>
                {[...d.tendencia].reverse().map((t: any) => (
                  <tr key={t.mes}>
                    <td>{mesLindo(t.mes)}</td>
                    <td className="mono" style={{ textAlign: "right", color: "var(--acepto)" }}>{soles(t.ingresos)}</td>
                    <td className="mono" style={{ textAlign: "right", color: "var(--noquiso)" }}>{soles(t.gastos)}</td>
                    <td className="mono" style={{ textAlign: "right", fontWeight: 700, color: t.ahorro >= 0 ? "var(--acepto)" : "var(--noquiso)" }}>{soles(t.ahorro)}</td>
                  </tr>
                ))}
              </tbody></table></div>
            </div>
          )}

          <div className="tarjeta">
            <h2>Movimientos del mes</h2>
            <div className="tabla-scroll"><table><tbody>
              <tr><th>Fecha</th><th>Tipo</th><th>Categoría</th><th>Nota</th><th style={{ textAlign: "right" }}>Monto</th><th /></tr>
              {d.movimientos.map((m: any) => (
                <tr key={m.id}>
                  <td className="mono">{new Date(m.fecha).toLocaleDateString("es", { day: "2-digit", month: "2-digit" })}</td>
                  <td>{m.tipo === "ingreso" ? "🟢 Ingreso" : "🔴 Gasto"}</td>
                  <td>{m.categoria}</td>
                  <td className="sub">{m.nota ?? "—"}</td>
                  <td className="mono" style={{ textAlign: "right", fontWeight: 600, color: m.tipo === "ingreso" ? "var(--acepto)" : "var(--noquiso)" }}>
                    {m.tipo === "ingreso" ? "+" : "−"} {soles(m.monto)}
                  </td>
                  <td><button className="btn chico sec" onClick={async () => {
                    if (!confirm("¿Eliminar este movimiento?")) return;
                    await fetch("/api/personal", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: m.id }) });
                    traer();
                  }}>✕</button></td>
                </tr>
              ))}
              {!d.movimientos.length && <tr><td colSpan={6} style={{ color: "var(--tinta2)" }}>Sin movimientos este mes.</td></tr>}
            </tbody></table></div>
          </div>
        </>
      )}

      {tab === "registrar" && <RegistrarMov categorias={d.presupuestos.map((p: any) => p.categoria)} alGuardar={() => { traer(); setTab("panel"); }} />}

      {tab === "presupuestos" && (
        <PresupuestosTab presupuestos={d.presupuestos} categorias={d.categorias} recargar={traer} />
      )}

      {tab === "config" && (
        <AjustesTab saldoInicial={d.saldoInicial} metaAhorro={d.metaAhorro} recargar={traer} />
      )}
    </>
  );
}

function RegistrarMov({ categorias, alGuardar }: { categorias: string[]; alGuardar: () => void }) {
  const [tipo, setTipo] = useState<"gasto" | "ingreso">("gasto");
  const [m, setM] = useState({ monto: "", categoria: "", nota: "", fecha: "" });
  const [msg, setMsg] = useState("");
  const cats = [...new Set([...CAT_GASTO, ...categorias])];

  async function guardar() {
    const r = await fetch("/api/personal", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "movimiento", tipo, ...m }) });
    const res = await r.json();
    if (!r.ok) return setMsg(res.error);
    alGuardar();
  }

  return (
    <div className="tarjeta">
      <h2>Registrar movimiento</h2>
      <div style={{ display: "flex", gap: 8, margin: "10px 0" }}>
        <button className={`btn ${tipo === "gasto" ? "" : "sec"}`} style={{ flex: 1, background: tipo === "gasto" ? "var(--noquiso)" : undefined }} onClick={() => setTipo("gasto")}>🔴 Gasto</button>
        <button className={`btn ${tipo === "ingreso" ? "" : "sec"}`} style={{ flex: 1, background: tipo === "ingreso" ? "var(--acepto)" : undefined }} onClick={() => setTipo("ingreso")}>🟢 Ingreso</button>
      </div>
      <label>Monto (S/)</label>
      <input className="mono" inputMode="decimal" autoFocus style={{ fontSize: 24, fontWeight: 700, textAlign: "center" }}
             value={m.monto} onChange={(e) => setM({ ...m, monto: e.target.value.replace(/[^\d.]/g, "") })} placeholder="0.00" />
      <label>Categoría</label>
      {tipo === "gasto" ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {cats.map((c) => (
            <button key={c} type="button" className={`btn chico ${m.categoria === c ? "" : "sec"}`} onClick={() => setM({ ...m, categoria: c })}>{c}</button>
          ))}
        </div>
      ) : (
        <input value={m.categoria} onChange={(e) => setM({ ...m, categoria: e.target.value })} placeholder="Ej: sueldo, negocio, otro" />
      )}
      <label>Nota (opcional)</label>
      <input value={m.nota} onChange={(e) => setM({ ...m, nota: e.target.value })} placeholder="Ej: almuerzo con cliente" />
      <label>Fecha (vacío = hoy)</label>
      <input type="date" value={m.fecha} onChange={(e) => setM({ ...m, fecha: e.target.value })} />
      {msg && <div className="error">{msg}</div>}
      <button className="btn" style={{ marginTop: 14, width: "100%" }} disabled={!(Number(m.monto) > 0) || !m.categoria.trim()} onClick={guardar}>
        Guardar {tipo}
      </button>
    </div>
  );
}

function PresupuestosTab({ presupuestos, categorias, recargar }: { presupuestos: any[]; categorias: any[]; recargar: () => void }) {
  const [cat, setCat] = useState(""), [lim, setLim] = useState("");
  const cats = [...new Set([...CAT_GASTO, ...categorias.map((c) => c.categoria)])];
  async function guardar() {
    if (!cat || !(Number(lim) > 0)) return;
    await fetch("/api/personal", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "presupuesto", categoria: cat, limite: Number(lim) }) });
    setCat(""); setLim(""); recargar();
  }
  return (
    <div className="tarjeta">
      <h2>Presupuesto mensual por categoría</h2>
      <p className="sub">Poné un tope a cada categoría. Cuando lo superes o estés al 80%, te aviso en el panel.</p>
      <div className="grid4" style={{ alignItems: "end", marginTop: 10 }}>
        <div style={{ gridColumn: "span 2" }}>
          <label>Categoría</label>
          <select value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">Elegí…</option>
            {cats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div><label>Límite (S/)</label><input className="mono" value={lim} onChange={(e) => setLim(e.target.value.replace(/[^\d.]/g, ""))} /></div>
        <button className="btn" onClick={guardar} disabled={!cat || !(Number(lim) > 0)}>Guardar</button>
      </div>
      <div className="tabla-scroll" style={{ marginTop: 16 }}><table><tbody>
        <tr><th>Categoría</th><th style={{ textAlign: "right" }}>Límite mensual</th><th /></tr>
        {presupuestos.map((p: any) => (
          <tr key={p.categoria}>
            <td><b>{p.categoria}</b></td>
            <td className="mono" style={{ textAlign: "right" }}>{soles(p.limite)}</td>
            <td><button className="btn chico sec" onClick={async () => {
              await fetch("/api/personal", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ categoria: p.categoria }) });
              recargar();
            }}>Quitar</button></td>
          </tr>
        ))}
        {!presupuestos.length && <tr><td colSpan={3} style={{ color: "var(--tinta2)" }}>Todavía no pusiste límites.</td></tr>}
      </tbody></table></div>
    </div>
  );
}

function AjustesTab({ saldoInicial, metaAhorro, recargar }: { saldoInicial: number; metaAhorro: number; recargar: () => void }) {
  const [saldo, setSaldo] = useState(String(saldoInicial || ""));
  const [meta, setMeta] = useState(String(metaAhorro || ""));
  const [msg, setMsg] = useState("");
  async function guardar() {
    await fetch("/api/personal", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "ajuste", saldoInicial: Number(saldo) || 0, metaAhorro: Number(meta) || 0 }) });
    setMsg("Guardado."); recargar();
  }
  return (
    <div className="tarjeta">
      <h2>Ajustes</h2>
      <label>Saldo inicial (lo que tenés hoy)</label>
      <input className="mono" value={saldo} onChange={(e) => setSaldo(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Ej: 208000" />
      <p className="sub">Desde acá el sistema suma tus ingresos y resta tus gastos para mostrarte el saldo real.</p>
      <label style={{ marginTop: 12 }}>Meta de ahorro mensual (S/)</label>
      <input className="mono" value={meta} onChange={(e) => setMeta(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Ej: 15000" />
      <p className="sub">Cuánto querés que te sobre cada mes. El panel te muestra si lo estás cumpliendo.</p>
      {msg && <div className="ok">{msg}</div>}
      <button className="btn" style={{ marginTop: 14 }} onClick={guardar}>Guardar ajustes</button>
    </div>
  );
}

/* ============ ASISTENCIA Y CALL LIBRE (admin / encargado) ============ */
function Asistencia() {
  const [d, setD] = useState<any>(null);
  const [dias, setDias] = useState(7);
  const [abierto, setAbierto] = useState<string | null>(null);
  const traer = useCallback(() => {
    fetch(`/api/asistencia?dias=${dias}`).then((r) => (r.ok ? r.json() : null)).then(setD);
  }, [dias]);
  useEffect(() => { traer(); const t = setInterval(traer, 60000); return () => clearInterval(t); }, [traer]);
  if (!d) return <div className="tarjeta">Cargando…</div>;

  return (
    <>
      {d.libresAhora.length > 0 && (
        <div className="tarjeta" style={{ borderLeft: "5px solid var(--noquiso)", background: "#FDEDEC" }}>
          <b style={{ color: "var(--noquiso)" }}>🔴 Conectados pero sin llamar ahora ({d.libresAhora.length})</b>
          <p className="sub" style={{ marginTop: 4 }}>Están logueados pero llevan {d.libreMin}+ min sin marcar ninguna llamada: {d.libresAhora.join(", ")}. Un toque al encargado y a mover.</p>
        </div>
      )}

      <div className="tarjeta" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span className="rotulo">Entrada esperada: {d.horaEntrada} (+{d.tolerancia} min de gracia)</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {[7, 15, 30].map((n) => <button key={n} className={`btn chico ${dias === n ? "" : "sec"}`} onClick={() => setDias(n)}>{n} días</button>)}
        </span>
      </div>

      <div className="tarjeta">
        <h2>Resumen por caller · últimos {dias} días</h2>
        <div className="tabla-scroll"><table><tbody>
          <tr><th>Caller</th><th>Estado</th><th style={{ textAlign: "right" }}>Entrada promedio</th><th style={{ textAlign: "right" }}>Tardanzas</th><th style={{ textAlign: "right" }}>Días</th><th /></tr>
          {d.callers.map((c: any) => (
            <Fragment key={c.id}>
              <tr>
                <td><b>{c.nombre}</b></td>
                <td>
                  {c.callLibre ? <span className="eti" style={{ color: "var(--noquiso)", borderColor: "var(--noquiso)" }}>call libre</span>
                    : c.activoAhora ? <span className="eti" style={{ color: "var(--acepto)", borderColor: "var(--acepto)" }}>trabajando</span>
                    : <span className="sub">desconectado</span>}
                </td>
                <td className="mono" style={{ textAlign: "right" }}>{c.promedioEntrada}</td>
                <td className="mono" style={{ textAlign: "right", color: c.tardanzas > 0 ? "var(--noquiso)" : "var(--acepto)" }}>{c.tardanzas}</td>
                <td className="mono" style={{ textAlign: "right" }}>{c.diasTrabajados}</td>
                <td><button className="btn chico sec" onClick={() => setAbierto(abierto === c.id ? null : c.id)}>{abierto === c.id ? "Ocultar" : "Ver días"}</button></td>
              </tr>
              {abierto === c.id && (
                <tr><td colSpan={6} style={{ background: "var(--papel)" }}>
                  <table><tbody>
                    <tr><th>Día</th><th>Ingreso (1ra llamada)</th><th>Salida (última)</th><th>Abrió CRM</th><th style={{ textAlign: "right" }}>Llamadas</th><th /></tr>
                    {c.filas.map((f: any) => (
                      <tr key={f.dia}>
                        <td className="mono">{f.dia}</td>
                        <td className="mono" style={{ color: f.tarde ? "var(--noquiso)" : undefined }}>{f.entrada}{f.tarde ? ` (+${f.minutosTarde}m)` : ""}</td>
                        <td className="mono">{f.salida}</td>
                        <td className="mono" style={{ color: "var(--tinta2)" }}>{f.abrioCrm}</td>
                        <td className="mono" style={{ textAlign: "right" }}>{f.llamadas}</td>
                        <td>{f.tarde ? "⏰ tarde" : f.entrada !== "—" ? "✓" : ""}</td>
                      </tr>
                    ))}
                    {!c.filas.length && <tr><td colSpan={6} style={{ color: "var(--tinta2)" }}>Sin registros en el período.</td></tr>}
                  </tbody></table>
                </td></tr>
              )}
            </Fragment>
          ))}
        </tbody></table></div>
        <div className="tip">
          El <b>ingreso</b> se marca con la <b>primera llamada</b> del día (no con abrir el CRM): es cuando empezó a trabajar de verdad. La <b>salida</b> es su última llamada.
          La columna <b>abrió CRM</b> queda solo de referencia. La tardanza se mide contra las {d.horaEntrada} (+{d.tolerancia} min de gracia) sobre la primera llamada.
        </div>
      </div>
    </>
  );
}

/* ============ SEGURIDAD: detección de cosecha de data (admin) ============ */
function Seguridad() {
  const [d, setD] = useState<any>(null);
  const [dias, setDias] = useState(7);
  const [abierto, setAbierto] = useState<string | null>(null);
  useEffect(() => { fetch(`/api/seguridad?dias=${dias}`).then((r) => (r.ok ? r.json() : null)).then(setD); }, [dias]);
  if (!d) return <div className="tarjeta">Cargando…</div>;

  return (
    <>
      <div className="tarjeta" style={{ background: "#FEF9E7", borderLeft: "5px solid var(--ambar)" }}>
        <b>🛡️ Cuidado de la data.</b> Acá ves quién abre muchas fichas sin llamarlas — el patrón típico de alguien que copia data en vez de trabajarla.
        No frena a nadie: es para que vos mires y decidas. Un caller que trabaja normal abre una ficha, llama y la cierra; el que cosecha abre muchas de golpe sin llamar.
      </div>

      {d.sospechosos.length > 0 && (
        <div className="tarjeta" style={{ borderLeft: "5px solid var(--noquiso)", background: "#FDEDEC" }}>
          <b style={{ color: "var(--noquiso)" }}>⚠️ Para revisar: {d.sospechosos.join(", ")}</b>
          <p className="sub" style={{ marginTop: 4 }}>Tienen un patrón que no parece trabajo normal. Miralo en detalle abajo antes de sacar conclusiones.</p>
        </div>
      )}

      <div className="tarjeta" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span className="rotulo">Período</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {[1, 7, 15, 30].map((n) => <button key={n} className={`btn chico ${dias === n ? "" : "sec"}`} onClick={() => setDias(n)}>{n === 1 ? "hoy" : `${n} días`}</button>)}
        </span>
      </div>

      <div className="tarjeta">
        <h2>Actividad por caller</h2>
        <div className="tabla-scroll"><table><tbody>
          <tr>
            <th>Caller</th><th style={{ textAlign: "right" }}>Fichas abiertas</th><th style={{ textAlign: "right" }}>Llamó</th>
            <th style={{ textAlign: "right" }}>% que llamó</th><th style={{ textAlign: "right" }}>Abiertas sin llamar</th><th style={{ textAlign: "right" }}>Pico/hora</th><th />
          </tr>
          {d.callers.map((c: any) => (
            <Fragment key={c.id}>
              <tr style={{ background: c.sospechoso ? "#FDEDEC" : undefined }}>
                <td><b>{c.nombre}</b>{!c.activo && <span className="sub"> (inactivo)</span>} {c.sospechoso && "⚠️"}</td>
                <td className="mono" style={{ textAlign: "right" }}>{c.totalAbiertas}</td>
                <td className="mono" style={{ textAlign: "right" }}>{c.totalLlamadas}</td>
                <td className="mono" style={{ textAlign: "right", color: c.ratio < 50 ? "var(--noquiso)" : "var(--acepto)" }}>{c.ratio}%</td>
                <td className="mono" style={{ textAlign: "right", color: c.abiertasSinLlamar >= 15 ? "var(--noquiso)" : undefined }}>{c.abiertasSinLlamar}</td>
                <td className="mono" style={{ textAlign: "right" }}>{c.picoPorHora}</td>
                <td>{c.rafagas.length > 0 && <button className="btn chico sec" onClick={() => setAbierto(abierto === c.id ? null : c.id)}>{abierto === c.id ? "Ocultar" : `${c.rafagas.length} ráfaga(s)`}</button>}</td>
              </tr>
              {abierto === c.id && (
                <tr><td colSpan={7} style={{ background: "var(--papel)" }}>
                  <b>Ráfagas de aperturas sin llamar</b> (5+ fichas en 5 minutos sin marcar ninguna):
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                    {c.rafagas.map((r: any, i: number) => <li key={i}>{r.desde} — abrió {r.aperturas} fichas seguidas sin llamar</li>)}
                  </ul>
                </td></tr>
              )}
            </Fragment>
          ))}
          {!d.callers.length && <tr><td colSpan={7} style={{ color: "var(--tinta2)" }}>Sin actividad en el período.</td></tr>}
        </tbody></table></div>
        <div className="tip">
          Lo más revelador es <b>"% que llamó"</b> y <b>"abiertas sin llamar"</b>: el que trabaja tiene un porcentaje alto porque llama a casi todo lo que abre.
          El que abre 80 fichas y llama a 10 no está vendiendo, está mirando datos. Cruzá esto con la pestaña Asistencia para ver el cuadro completo de esa persona.
        </div>
      </div>
    </>
  );
}

/* ============ REGISTRO DE LLAMADAS 1x1 (admin) ============ */
function RegistroLlamadas() {
  const [llamadas, setLlamadas] = useState<any[]>([]);
  const [fCaller, setFCaller] = useState(""), [fRes, setFRes] = useState("");
  useEffect(() => { fetch("/api/llamadas").then((r) => (r.ok ? r.json() : { llamadas: [] })).then((d) => setLlamadas(d.llamadas ?? [])); }, []);

  const callers = [...new Set(llamadas.map((l) => l.caller?.nombre).filter(Boolean))];
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const filtradas = llamadas.filter((l) =>
    (!fCaller || l.caller?.nombre === fCaller) && (!fRes || l.resultado === fRes));

  return (
    <div className="tarjeta">
      <h2>Registro de llamadas · una por una</h2>
      <p className="sub">Todas las llamadas de todos los callers: qué marcó, cuánto duró y a quién.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0" }}>
        <select value={fCaller} onChange={(e) => setFCaller(e.target.value)} style={{ width: "auto" }}>
          <option value="">Todos los callers</option>
          {callers.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={fRes} onChange={(e) => setFRes(e.target.value)} style={{ width: "auto" }}>
          <option value="">Todos los resultados</option>
          {Object.entries(ETI).map(([k, v]) => <option key={k} value={k}>{v.txt}</option>)}
        </select>
        <span className="sub" style={{ marginLeft: "auto", alignSelf: "center" }}>{filtradas.length} llamada(s)</span>
      </div>
      <div className="tabla-scroll"><table><tbody>
        <tr><th>Fecha/hora</th><th>Caller</th><th>Cliente</th><th>Spamer</th><th>Resultado</th><th>Motivo</th><th style={{ textAlign: "right" }}>Duración</th><th style={{ textAlign: "right" }}>Monto</th></tr>
        {filtradas.map((l) => (
          <tr key={l.id}>
            <td className="mono" style={{ whiteSpace: "nowrap" }}>{new Date(l.creadoEn).toLocaleString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
            <td><b>{l.caller?.nombre ?? "—"}</b></td>
            <td>{l.lead?.nombre ?? "—"}</td>
            <td className="sub">{l.lead?.cargadoPor?.nombre ?? "—"}</td>
            <td><span className="eti" style={{ color: eti(l.resultado).color, borderColor: eti(l.resultado).color }}>{eti(l.resultado).txt}</span></td>
            <td className="sub">{l.motivo ?? "—"}</td>
            <td className="mono" style={{ textAlign: "right" }}>{mmss(l.duracion ?? 0)}</td>
            <td className="mono" style={{ textAlign: "right" }}>{l.monto ? soles(l.monto) : "—"}</td>
          </tr>
        ))}
        {!filtradas.length && <tr><td colSpan={8} style={{ color: "var(--tinta2)" }}>Sin llamadas registradas.</td></tr>}
      </tbody></table></div>
      <div className="tip">Las llamadas cortas (menos de 20s) suelen ser cuelgues o buzón — cruzalas con la pestaña Seguridad si un caller tiene muchas.</div>
    </div>
  );
}

/* ============ ARCHIVO: fichas viejas sacadas de la cola (admin) ============ */
function Archivo() {
  const [d, setD] = useState<any>(null);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  const traer = () => fetch("/api/archivo").then((r) => (r.ok ? r.json() : null)).then(setD);
  useEffect(() => { traer(); }, []);

  async function archivarAhora() {
    if (!confirm("¿Archivar ahora todas las fichas de “volver a llamar” y “no contestó” con más de 7 días sin movimiento?")) return;
    const r = await fetch("/api/archivo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "archivar_ahora" }) });
    const j = await r.json();
    setMsg(r.ok ? `Se archivaron ${j.archivadas} ficha(s).` : (j.error ?? "No se pudo."));
    traer();
  }
  async function recuperar(id: number) {
    const r = await fetch("/api/archivo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "recuperar", id }) });
    if (r.ok) { setMsg("Ficha devuelta a la cola del caller."); traer(); }
  }

  if (!d) return <div className="tarjeta">Cargando…</div>;
  const norm = (t: string) => (t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const term = norm(q.trim()), dig = q.replace(/\D/g, "");
  const filas = (d.leads ?? []).filter((l: any) =>
    !q.trim() || norm(l.nombre).includes(term) || (dig && (l.dni?.includes(dig) || l.telefono?.replace(/\D/g, "").includes(dig))));

  return (
    <>
      <div className="tarjeta" style={{ background: "#F4F6F8" }}>
        <b>🗄️ Archivo de fichas viejas.</b> Acá van las fichas de <b>“volver a llamar”</b> y <b>“no contestó”</b> que pasaron <b>{d.dias} días</b> sin cerrarse.
        Salen de la cola de los callers para que no se sature, pero <b>no se borran</b>: podés recuperarlas cuando quieras.
        El sistema las archiva solo cada día; con el botón de abajo lo hacés ahora mismo.
        <div style={{ marginTop: 10 }}>
          <button className="btn" onClick={archivarAhora}>Archivar las viejas ahora</button>
        </div>
        {msg && <div className="tip" style={{ marginTop: 8 }}>{msg}</div>}
      </div>

      <div className="tarjeta">
        <h2>Archivadas · {d.total}</h2>
        <input placeholder="Buscar por nombre, DNI o teléfono…" value={q} onChange={(e) => setQ(e.target.value)} style={{ margin: "8px 0" }} />
        <div className="tabla-scroll"><table><tbody>
          <tr><th>Archivada</th><th>Cargada</th><th>Contacto</th><th>DNI</th><th>Teléfono</th><th>Caller</th><th>Spamer</th><th>Estado</th><th>Intentos</th><th /></tr>
          {filas.map((l: any) => (
            <tr key={l.id}>
              <td className="mono" style={{ whiteSpace: "nowrap" }}>{fechaHora(l.archivadoEn)}</td>
              <td className="mono" style={{ whiteSpace: "nowrap" }}>{fechaHora(l.creadoEn)}</td>
              <td><b>{l.nombre}</b></td>
              <td className="mono">{l.dni}</td>
              <td className="mono">{l.telefono}</td>
              <td>{l.asignadoA?.nombre ?? "—"}</td>
              <td>{l.cargadoPor?.nombre ?? "—"}</td>
              <td><span className="eti" style={{ color: eti(l.estado).color, borderColor: eti(l.estado).color }}>{eti(l.estado).txt}</span></td>
              <td className="mono">{l.intentos}</td>
              <td><button className="btn sec chico" onClick={() => recuperar(l.id)}>Recuperar</button></td>
            </tr>
          ))}
          {!filas.length && <tr><td colSpan={10} style={{ color: "var(--tinta2)" }}>{q.trim() ? "No hay coincidencias." : "No hay fichas archivadas."}</td></tr>}
        </tbody></table></div>
      </div>
    </>
  );
}

/* ============ EN VIVO: monitor de callers para encargados y procesadores ============ */
function EnVivo() {
  const [d, setD] = useState<any>(null);
  useTicker(true); // refresca el cronómetro cada segundo
  useEffect(() => {
    const traer = () => fetch("/api/envivo").then((r) => (r.ok ? r.json() : null)).then((x) => x && setD(x));
    traer();
    const t = setInterval(traer, 5000); // actividad al día: cada 5 segundos
    return () => clearInterval(t);
  }, []);
  if (!d) return <div className="tarjeta">Cargando…</div>;

  const seg = (iso?: string | null) => iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 1000) : 0;

  return (
    <>
      <div className="grid4">
        <div className="metrica"><span className="rotulo">En llamada ahora</span><b style={{ color: "var(--acepto)" }}>{d.enLlamada}</b></div>
        <div className="metrica"><span className="rotulo">Conectados</span><b>{d.conectados}</b></div>
        <div className="metrica"><span className="rotulo">Callers totales</span><b>{d.total}</b></div>
      </div>

      <div className="tarjeta">
        <h2>Callers en vivo</h2>
        <p className="sub">Se actualiza solo. Arriba los que están en llamada ahora.</p>
        <div className="tabla-scroll"><table><tbody>
          <tr><th>Caller</th><th>Estado</th><th>Cliente</th><th>Spamer</th><th style={{ textAlign: "right" }}>Hablando hace</th></tr>
          {d.callers.map((c: any) => (
            <tr key={c.id} style={{ background: c.enLlamada ? "#EAF7EE" : undefined }}>
              <td><b>{c.nombre}</b></td>
              <td>
                {c.enLlamada
                  ? <span className="eti" style={{ color: "var(--acepto)", borderColor: "var(--acepto)" }}>● En llamada</span>
                  : c.conectado
                    ? <span className="eti" style={{ color: "var(--petroleo)", borderColor: "var(--petroleo)" }}>Conectado</span>
                    : <span className="sub">Desconectado</span>}
              </td>
              <td>{c.cliente ?? "—"}</td>
              <td className="sub">{c.spamer ?? "—"}</td>
              <td className="mono" style={{ textAlign: "right", fontWeight: c.enLlamada ? 700 : 400 }}>{c.enLlamada ? mmss(seg(c.desde)) : "—"}</td>
            </tr>
          ))}
          {!d.callers.length && <tr><td colSpan={5} style={{ color: "var(--tinta2)" }}>No hay callers activos.</td></tr>}
        </tbody></table></div>
      </div>
    </>
  );
}
