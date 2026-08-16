"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Avisador from "./Avisador";

type Sesion = { id: string; usuario: string; nombre: string; rol: "ADMIN" | "CARGADOR" | "CALLER" };
type Lead = {
  id: number; nombre: string; dni: string; telefono: string; ciudad?: string | null; nota?: string | null;
  estado: string; intentos: number; asignadoA: { nombre: string }; cargadoPor: { nombre: string };
  llamadas: { nota?: string | null; creadoEn: string }[];
};
type Usuario = { id: string; usuario: string; nombre: string; rol: string; telefono?: string | null; telegramId?: string | null; codigoTg?: string | null; notificar: boolean; activo: boolean };

const ETI: Record<string, { txt: string; color: string }> = {
  PENDIENTE: { txt: "Sin llamar", color: "var(--petroleo)" },
  NO_CONTESTO: { txt: "No contestó", color: "var(--nocontesto)" },
  VOLVER_A_LLAMAR: { txt: "Volver a llamar", color: "var(--volver)" },
  ACEPTO: { txt: "Aceptó", color: "var(--acepto)" },
  NO_QUISO: { txt: "No quiso", color: "var(--noquiso)" },
};
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export default function Panel({ sesion }: { sesion: Sesion }) {
  const pestanas =
    sesion.rol === "CALLER" ? [["cola", "Mi cola"], ["historial", "Mis llamadas"]] :
    sesion.rol === "CARGADOR" ? [["cargar", "Cargar contactos"], ["mias", "Lo que subí"]] :
    [["cargar", "Cargar contactos"], ["todos", "Todos los contactos"], ["usuarios", "Usuarios"], ["avisos", "Avisos"]];

  const marca =
    sesion.rol === "CALLER" ? { titulo: "Mesa de llamadas", color: "#0F4C5C" } :
    sesion.rol === "CARGADOR" ? { titulo: "Mesa de carga", color: "#5B3A8C" } :
    { titulo: "Supervisión", color: "#123B2C" };
  const [vista, setVista] = useState(pestanas[0][0]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const router = useRouter();

  const cargar = useCallback(async () => {
    const r = await fetch("/api/leads");
    if (r.status === 401) return router.push("/");
    setLeads((await r.json()).leads ?? []);
    if (sesion.rol !== "CALLER") {
      const u = await fetch("/api/usuarios");
      if (u.ok) setUsuarios((await u.json()).usuarios ?? []);
    }
  }, [router, sesion.rol]);

  useEffect(() => { cargar(); const t = setInterval(cargar, 30000); return () => clearInterval(t); }, [cargar]);

  return (
    <>
      <header className="tope" style={{ background: marca.color }}>
        <div className="tope-in">
          <span style={{ display: "flex", gap: 9, alignItems: "center", fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase" }}>
            <span className="jack" /> Central · {marca.titulo}
          </span>
          <span style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center", fontSize: 13 }}>
            {sesion.nombre} <span className="chapa">{sesion.rol}</span>
            <button className="btn chico sec" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/"); }}>Salir</button>
          </span>
        </div>
        <nav className="pestanas">
          {pestanas.map(([k, t]) => (
            <button key={k} className="pestana" data-on={vista === k} onClick={() => setVista(k)}>{t}</button>
          ))}
        </nav>
      </header>
      <main>
        <Avisador />
        {vista === "cola" && <Cola leads={leads} recargar={cargar} />}
        {vista === "historial" && <MiHistorial leads={leads} sesion={sesion} />}
        {vista === "cargar" && <Cargar usuarios={usuarios} recargar={cargar} />}
        {(vista === "mias" || vista === "todos") && <Tabla leads={leads} />}
        {vista === "usuarios" && <Usuarios usuarios={usuarios} recargar={cargar} />}
        {vista === "avisos" && <Avisos />}
      </main>
    </>
  );
}

/* ---------------- CALLER ---------------- */
function Cola({ leads, recargar }: { leads: Lead[]; recargar: () => void }) {
  const [abierta, setAbierta] = useState<number | null>(null);
  const [nota, setNota] = useState(""), [seg, setSeg] = useState(0), [msg, setMsg] = useState("");
  const lead = leads.find((l) => l.id === abierta) ?? leads[0];

  useEffect(() => { setSeg(0); const t = setInterval(() => setSeg((s) => s + 1), 1000); return () => clearInterval(t); }, [lead?.id]);

  async function registrar(resultado: string) {
    if (!lead) return;
    const r = await fetch(`/api/leads/${lead.id}/resultado`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resultado, nota, duracion: seg }),
    });
    setMsg(r.ok ? `Registrado: ${ETI[resultado].txt}` : "No se pudo registrar. Probá de nuevo.");
    setNota(""); setAbierta(null); recargar();
  }

  if (!lead) return <div className="tarjeta"><h2>Cola vacía</h2><p className="sub">Cuando el equipo de carga te asigne un contacto te llega un aviso por WhatsApp.</p></div>;

  return (
    <>
      {msg && <div className="ok">{msg}</div>}
      <div className="tarjeta">
        <div className="ficha-cab">
          <div>
            <span className="rotulo" style={{ color: "#9FC9D2" }}>Ficha {String(lead.id).padStart(4, "0")}</span>
            <div style={{ fontSize: 19, fontWeight: 700 }}>{lead.nombre}</div>
          </div>
          <span className="cronometro">{mmss(seg)} en línea</span>
        </div>
        <span className="rotulo">Tocá el número para llamar</span>
        <a className="numero" href={`tel:${lead.telefono.replace(/\D/g, "")}`}>{lead.telefono}</a>
        <p className="sub">DNI <span className="mono">{lead.dni}</span> · {lead.ciudad ?? "sin ciudad"} · {lead.intentos} intento(s) · cargado por {lead.cargadoPor.nombre}</p>
        {lead.nota && <p style={{ marginTop: 8 }}><b>Nota:</b> {lead.nota}</p>}
        <label htmlFor="n">Nota de la llamada</label>
        <textarea id="n" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej: pidió que lo llamen después de las 18 h" />
        <div className="tip">Al marcar “No contestó” o “Volver a llamar”, el sistema te vuelve a avisar por WhatsApp según los minutos que configuró tu administrador.</div>
        <div className="resultados">
          <button className="res a" onClick={() => registrar("ACEPTO")}>Aceptó</button>
          <button className="res n" onClick={() => registrar("NO_CONTESTO")}>No contestó</button>
          <button className="res x" onClick={() => registrar("NO_QUISO")}>No quiso</button>
          <button className="res v" onClick={() => registrar("VOLVER_A_LLAMAR")}>Volver a llamar</button>
        </div>
      </div>
      <div className="tarjeta">
        <h2>Mi cola · {leads.length} pendiente(s)</h2>
        <div className="tabla-scroll"><table><tbody>
          <tr><th>Contacto</th><th>DNI</th><th>Teléfono</th><th>Estado</th><th /></tr>
          {leads.map((l) => (
            <tr key={l.id}>
              <td><b>{l.nombre}</b></td>
              <td className="mono">{l.dni}</td>
              <td className="mono">{l.telefono}</td>
              <td><span className="eti" style={{ color: ETI[l.estado].color, borderColor: ETI[l.estado].color }}>{ETI[l.estado].txt}</span></td>
              <td><button className="btn sec chico" onClick={() => { setAbierta(l.id); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Abrir</button></td>
            </tr>
          ))}
        </tbody></table></div>
      </div>
    </>
  );
}

/* ---------------- CARGA DE DATOS ---------------- */
function Cargar({ usuarios, recargar }: { usuarios: Usuario[]; recargar: () => void }) {
  const vacio = { nombre: "", dni: "", telefono: "", ciudad: "", nota: "", asignadoA: "" };
  const [f, setF] = useState(vacio);
  const [masivo, setMasivo] = useState(""), [msg, setMsg] = useState<any>(null);
  const callers = usuarios.filter((u) => u.rol === "CALLER" && u.activo);
  const soloNum = (t: string) => t.replace(/\D/g, "");
  const faltan = !f.nombre.trim() || soloNum(f.dni).length < 6 || soloNum(f.telefono).length < 6;

  async function enviar(cuerpo: any) {
    const r = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
    const d = await r.json();
    setMsg(r.ok ? d : { error: d.error });
    recargar();
  }

  return (
    <>
      <div className="tarjeta">
        <h2>Cargar un contacto</h2>
        <p className="sub">Al guardarlo, al caller le llega el aviso por WhatsApp en el momento.</p>
        <div className="grid2">
          <div>
            <label>Nombre y apellido <b style={{ color: "var(--noquiso)" }}>*</b></label>
            <input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Ej: Carla Méndez" />
          </div>
          <div>
            <label>DNI <b style={{ color: "var(--noquiso)" }}>*</b></label>
            <input className="mono" inputMode="numeric" value={f.dni}
                   onChange={(e) => setF({ ...f, dni: e.target.value })} placeholder="Solo números" />
            {f.dni && soloNum(f.dni).length < 6 && <p className="sub" style={{ color: "var(--noquiso)" }}>El DNI es muy corto.</p>}
          </div>
          <div>
            <label>Teléfono <b style={{ color: "var(--noquiso)" }}>*</b></label>
            <input className="mono" inputMode="tel" value={f.telefono}
                   onChange={(e) => setF({ ...f, telefono: e.target.value })} placeholder="Ej: 987 654 321" />
          </div>
          <div><label>Ciudad</label><input value={f.ciudad} onChange={(e) => setF({ ...f, ciudad: e.target.value })} /></div>
          <div><label>Asignar a</label>
            <select value={f.asignadoA} onChange={(e) => setF({ ...f, asignadoA: e.target.value })}>
              <option value="">Reparto automático (menos cola)</option>
              {callers.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
        </div>
        <label>Nota para el caller</label>
        <textarea value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} />
        {msg?.error && <div className="error">{msg.error}</div>}
        {msg?.creados > 0 && <div className="ok">{msg.creados} contacto(s) cargados y avisados.</div>}
        {msg?.rechazados?.length > 0 && <div className="error">Rechazados: {msg.rechazados.join(" · ")}</div>}
        <button className="btn" style={{ marginTop: 14 }} disabled={faltan}
                onClick={() => { enviar(f); setF({ ...vacio, asignadoA: f.asignadoA }); }}>
          {faltan ? "Completá nombre, DNI y teléfono" : "Guardar y avisar"}
        </button>
      </div>

      <div className="tarjeta">
        <h2>Carga masiva</h2>
        <p className="sub">Una línea por persona: <span className="mono">nombre, DNI, teléfono, ciudad, nota</span></p>
        <textarea className="mono" style={{ minHeight: 120 }} value={masivo} onChange={(e) => setMasivo(e.target.value)} />
        <button className="btn sec" style={{ marginTop: 12 }} onClick={() => {
          const contactos = masivo.split("\n").map((l) => l.split(/[,;\t]/).map((t) => t.trim())).filter((p) => p[0])
            .map(([nombre, dni, telefono, ciudad, ...resto]) => ({ nombre, dni, telefono, ciudad, nota: resto.join(", ") }));
          enviar({ contactos }); setMasivo("");
        }}>Cargar la lista</button>
      </div>
    </>
  );
}

/* ---------------- TABLAS Y ADMIN ---------------- */
function Tabla({ leads }: { leads: Lead[] }) {
  return (
    <div className="tarjeta">
      <h2>Contactos</h2>
      <div className="tabla-scroll"><table><tbody>
        <tr><th>Ficha</th><th>Contacto</th><th>Teléfono</th><th>Caller</th><th>Estado</th><th>Intentos</th><th>Última nota</th></tr>
        {leads.map((l) => (
          <tr key={l.id}>
            <td className="mono">{String(l.id).padStart(4, "0")}</td>
            <td><b>{l.nombre}</b><br /><span style={{ color: "var(--tinta2)" }}>{l.ciudad ?? "—"}</span></td>
            <td className="mono">{l.dni}</td>
            <td className="mono">{l.telefono}</td>
            <td>{l.asignadoA.nombre}</td>
            <td><span className="eti" style={{ color: ETI[l.estado].color, borderColor: ETI[l.estado].color }}>{ETI[l.estado].txt}</span></td>
            <td className="mono">{l.intentos}</td>
            <td>{l.llamadas[0]?.nota ?? "—"}</td>
          </tr>
        ))}
      </tbody></table></div>
    </div>
  );
}

function Usuarios({ usuarios, recargar }: { usuarios: Usuario[]; recargar: () => void }) {
  const [f, setF] = useState({ nombre: "", usuario: "", clave: "", rol: "CALLER", telefono: "" });
  const [msg, setMsg] = useState("");

  async function crear() {
    const r = await fetch("/api/usuarios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const d = await r.json();
    setMsg(r.ok ? "Usuario creado." : d.error);
    if (r.ok) { setF({ nombre: "", usuario: "", clave: "", rol: "CALLER", telefono: "" }); recargar(); }
  }
  async function editar(id: string, cambios: any) {
    await fetch("/api/usuarios", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...cambios }) });
    recargar();
  }

  return (
    <>
      <div className="tarjeta">
        <h2>Crear usuario</h2>
        <p className="sub">Después de crearlo, generá su código de Telegram y pasáselo: tiene que mandarle <span className="mono">/start CODIGO</span> al bot para empezar a recibir las fichas.</p>
        <div className="grid2">
          <div><label>Nombre</label><input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></div>
          <div><label>Usuario</label><input className="mono" value={f.usuario} onChange={(e) => setF({ ...f, usuario: e.target.value })} /></div>
          <div><label>Contraseña (mín. 8)</label><input value={f.clave} onChange={(e) => setF({ ...f, clave: e.target.value })} /></div>
          <div><label>WhatsApp</label><input className="mono" value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} /></div>
          <div><label>Rol</label>
            <select value={f.rol} onChange={(e) => setF({ ...f, rol: e.target.value })}>
              <option value="CALLER">Caller</option><option value="CARGADOR">Carga de datos</option><option value="ADMIN">Administrador</option>
            </select>
          </div>
        </div>
        {msg && <div className={msg === "Usuario creado." ? "ok" : "error"}>{msg}</div>}
        <button className="btn" style={{ marginTop: 14 }} onClick={crear}>Crear usuario</button>
      </div>
      <div className="tarjeta">
        <h2>Equipo</h2>
        <div className="tabla-scroll"><table><tbody>
          <tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Telegram</th><th>Avisos</th><th>Estado</th><th /></tr>
          {usuarios.map((u) => (
            <tr key={u.id}>
              <td><b>{u.nombre}</b></td><td className="mono">{u.usuario}</td><td>{u.rol}</td>
              <td className="mono">
                {u.telegramId ? "vinculado" : u.codigoTg
                  ? <>código <b>{u.codigoTg}</b></>
                  : <button className="btn sec chico" onClick={() => editar(u.id, { generarCodigo: true })}>Generar código</button>}
              </td>
              <td><button className="btn sec chico" onClick={() => editar(u.id, { notificar: !u.notificar })}>{u.notificar ? "Sí" : "No"}</button></td>
              <td>{u.activo ? "Activo" : "Desactivado"}</td>
              <td><button className="btn sec chico" onClick={() => editar(u.id, { activo: !u.activo })}>{u.activo ? "Desactivar" : "Reactivar"}</button></td>
            </tr>
          ))}
        </tbody></table></div>
      </div>
    </>
  );
}

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
      <h2>Reglas de aviso por WhatsApp</h2>
      <p className="sub">El cron revisa cada 5 minutos y manda un solo mensaje por caller, aunque tenga varias fichas vencidas.</p>
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


/* ---------------- HISTORIAL DEL CALLER ---------------- */
function MiHistorial({ leads, sesion }: { leads: Lead[]; sesion: Sesion }) {
  const [todas, setTodas] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/llamadas").then((r) => (r.ok ? r.json() : { llamadas: [] })).then((d) => setTodas(d.llamadas ?? []));
  }, []);
  const acep = todas.filter((l) => l.resultado === "ACEPTO").length;
  return (
    <>
      <div className="grid4">
        <div className="metrica"><span className="rotulo">Llamadas hechas</span><b>{todas.length}</b></div>
        <div className="metrica"><span className="rotulo">Aceptaron</span><b>{acep}</b></div>
        <div className="metrica"><span className="rotulo">Efectividad</span><b>{todas.length ? Math.round((acep / todas.length) * 100) : 0}%</b></div>
        <div className="metrica"><span className="rotulo">En cola ahora</span><b>{leads.length}</b></div>
      </div>
      <div className="tarjeta">
        <h2>Mis llamadas</h2>
        <p className="sub">Cada línea quedó firmada con tu usuario y no se puede editar.</p>
        <div className="tabla-scroll"><table><tbody>
          <tr><th>Fecha</th><th>Contacto</th><th>DNI</th><th>Resultado</th><th>Nota</th></tr>
          {todas.map((l) => (
            <tr key={l.id}>
              <td className="mono">{new Date(l.creadoEn).toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
              <td>{l.lead?.nombre}</td>
              <td className="mono">{l.lead?.dni}</td>
              <td><span className="eti" style={{ color: ETI[l.resultado].color, borderColor: ETI[l.resultado].color }}>{ETI[l.resultado].txt}</span></td>
              <td>{l.nota ?? "—"}</td>
            </tr>
          ))}
          {!todas.length && <tr><td colSpan={5} style={{ color: "var(--tinta2)" }}>Todavía no registraste llamadas.</td></tr>}
        </tbody></table></div>
      </div>
    </>
  );
}
