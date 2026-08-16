"use client";
import { useEffect, useState, useCallback, useRef, Fragment } from "react";
import { useRouter } from "next/navigation";
import Avisador from "./Avisador";

type Sesion = { id: string; usuario: string; nombre: string; rol: "ADMIN" | "CARGADOR" | "CALLER" };
type Lead = {
  id: number; nombre: string; dni: string; telefono: string; nota?: string | null;
  estado: string; intentos: number; enLlamadaDesde?: string | null;
  asignadoA: { nombre: string }; asignadoAId: string; cargadoPor: { nombre: string };
  llamadas: { nota?: string | null; creadoEn: string }[];
};
type Usuario = { id: string; usuario: string; nombre: string; rol: string; telefono?: string | null; telegramId?: string | null; codigoTg?: string | null; notificar: boolean; activo: boolean };
type Llamada = { id: number; resultado: string; nota?: string | null; creadoEn: string; leadId: number; caller?: { nombre: string }; lead?: { nombre: string; dni: string; telefono: string } };

const ETI: Record<string, { txt: string; color: string }> = {
  PENDIENTE: { txt: "Sin llamar", color: "var(--petroleo)" },
  NO_CONTESTO: { txt: "No contestó", color: "var(--nocontesto)" },
  VOLVER_A_LLAMAR: { txt: "Volver a llamar", color: "var(--volver)" },
  ACEPTO: { txt: "Aceptó", color: "var(--acepto)" },
  NO_QUISO: { txt: "No quiso", color: "var(--noquiso)" },
};
const ROL: Record<string, string> = { ADMIN: "Administrador", CARGADOR: "Spamer", CALLER: "Caller" };
const eti = (e: string) => ETI[e] ?? { txt: e, color: "var(--tinta2)" };
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
    sesion.rol === "CALLER" ? [["cola", "Mi cola"], ["historial", "Mis llamadas"]] :
    sesion.rol === "CARGADOR" ? [["cargar", "Cargar contactos"], ["mias", "Lo que subí"]] :
    [["monitor", "En vivo"], ["supervision", "Supervisión"], ["cargar", "Cargar contactos"], ["todos", "Todos los contactos"], ["usuarios", "Usuarios"], ["avisos", "Avisos"]];

  const marca =
    sesion.rol === "CALLER" ? { titulo: "Mesa de llamadas", color: "#0F4C5C" } :
    sesion.rol === "CARGADOR" ? { titulo: "Mesa de spamer", color: "#5B3A8C" } :
    { titulo: "Supervisión", color: "#123B2C" };

  const [vista, setVista] = useState(pestanas[0][0]);
  const [avisosOk, setAvisosOk] = useState(sesion.rol !== "CALLER");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const router = useRouter();

  const cargar = useCallback(async () => {
    const r = await fetch("/api/leads");
    // 409 = alguien entró con esta misma cuenta en otro dispositivo.
    if (r.status === 409) return router.push("/?m=desplazada");
    if (r.status === 401) return router.push("/?m=vencida");
    if (r.ok) setLeads((await r.json()).leads ?? []);
    if (sesion.rol !== "CALLER") {
      const u = await fetch("/api/usuarios");
      if (u.ok) setUsuarios((await u.json()).usuarios ?? []);
    }
  }, [router, sesion.rol]);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, sesion.rol === "ADMIN" ? 10000 : 30000);
    return () => clearInterval(t);
  }, [cargar, sesion.rol]);

  // Latido: deja constancia de quién está realmente con el panel abierto.
  useEffect(() => {
    const latir = () => fetch("/api/latido", { method: "POST" })
      .then((r) => { if (r.status === 409) router.push("/?m=desplazada"); })
      .catch(() => {});
    latir();
    const t = setInterval(latir, 60000);
    return () => clearInterval(t);
  }, [router]);

  return (
    <>
      <header className="tope" style={{ background: marca.color }}>
        <div className="tope-in">
          <span style={{ display: "flex", gap: 9, alignItems: "center", fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase" }}>
            <span className="jack" /> Central · {marca.titulo}
          </span>
          <span style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center", fontSize: 13 }}>
            {sesion.nombre} <span className="chapa">{ROL[sesion.rol]}</span>
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
        <Avisador bloqueante={sesion.rol === "CALLER"} onListo={setAvisosOk} />
        {vista === "cola" && (avisosOk
          ? <Cola leads={leads} recargar={cargar} />
          : <div className="tarjeta"><h2>Avisos desactivados</h2><p className="sub">Tu cola aparece apenas actives las notificaciones. Es obligatorio para trabajar.</p></div>)}
        {vista === "historial" && <Historial soyAdmin={false} />}
        {vista === "cargar" && <Cargar usuarios={usuarios} recargar={cargar} />}
        {vista === "mias" && <TablaLeads leads={leads} editable="spamer" recargar={cargar} />}
        {vista === "todos" && <TablaLeads leads={leads} admin editable="admin" usuarios={usuarios} recargar={cargar} />}
        {vista === "supervision" && <Supervision />}
        {vista === "monitor" && <Monitor leads={leads} usuarios={usuarios} recargar={cargar} />}
        {vista === "usuarios" && <Usuarios usuarios={usuarios} recargar={cargar} />}
        {vista === "avisos" && <Avisos />}
      </main>
    </>
  );
}

/* ============ CALLER: cola con confirmación antes de llamar ============ */
function Cola({ leads, recargar }: { leads: Lead[]; recargar: () => void }) {
  const [porConfirmar, setPorConfirmar] = useState<Lead | null>(null);
  const [nota, setNota] = useState(""), [msg, setMsg] = useState("");
  const enCurso = leads.find((l) => l.enLlamadaDesde);
  useTicker(!!enCurso);

  async function tomar(id: number, si: boolean) {
    await fetch(`/api/leads/${id}/tomar`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tomar: si }),
    });
    setPorConfirmar(null);
    recargar();
  }

  async function registrar(id: number, resultado: string) {
    const r = await fetch(`/api/leads/${id}/resultado`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resultado, nota, duracion: desde(enCurso?.enLlamadaDesde) }),
    });
    setMsg(r.ok ? `Registrado: ${eti(resultado).txt}` : "No se pudo registrar.");
    setNota(""); recargar();
  }

  const pendientes = leads.filter((l) => !l.enLlamadaDesde);

  return (
    <>
      {msg && <div className="ok">{msg}</div>}

      {porConfirmar && (
        <div className="velo" onClick={() => setPorConfirmar(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>¿Vas a llamar a este cliente ahora?</h2>
            <p className="sub">{porConfirmar.nombre} · DNI {porConfirmar.dni}</p>
            <div className="numero" style={{ fontSize: 26, margin: "10px 0" }}>{porConfirmar.telefono}</div>
            <p className="sub">Si decís que sí, tu supervisor va a ver que estás en llamada y arranca el cronómetro.</p>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button className="btn" style={{ flex: 1 }} onClick={() => tomar(porConfirmar.id, true)}>Sí, voy a llamar</button>
              <button className="btn sec" style={{ flex: 1 }} onClick={() => setPorConfirmar(null)}>No, todavía no</button>
            </div>
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
          <a className="numero" href={`tel:${enCurso.telefono.replace(/\D/g, "")}`}>{enCurso.telefono}</a>
          <p className="sub">DNI <span className="mono">{enCurso.dni}</span> · {enCurso.intentos} intento(s)</p>
          {enCurso.nota && <p style={{ marginTop: 8 }}><b>Nota:</b> {enCurso.nota}</p>}
          <label>Nota de la llamada</label>
          <textarea value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej: pidió que lo llamen después de las 18 h" />
          <div className="resultados">
            <button className="res a" onClick={() => registrar(enCurso.id, "ACEPTO")}>Aceptó</button>
            <button className="res n" onClick={() => registrar(enCurso.id, "NO_CONTESTO")}>No contestó</button>
            <button className="res x" onClick={() => registrar(enCurso.id, "NO_QUISO")}>No quiso</button>
            <button className="res v" onClick={() => registrar(enCurso.id, "VOLVER_A_LLAMAR")}>Volver a llamar</button>
          </div>
          <button className="btn sec chico" style={{ marginTop: 12 }} onClick={() => tomar(enCurso.id, false)}>
            Cancelar: no llegué a llamar
          </button>
        </div>
      ) : (
        <div className="tip">Elegí a quién llamar de tu lista. Al abrir una ficha te va a preguntar si vas a llamar ahora.</div>
      )}

      <div className="tarjeta">
        <h2>Mis pendientes · {pendientes.length}</h2>
        <p className="sub">Solo ves los contactos asignados a vos.</p>
        <div className="tabla-scroll"><table><tbody>
          <tr><th>Contacto</th><th>DNI</th><th>Teléfono</th><th>Estado</th><th>Intentos</th><th /></tr>
          {pendientes.map((l) => (
            <tr key={l.id}>
              <td><b>{l.nombre}</b></td>
              <td className="mono">{l.dni}</td>
              <td className="mono">{l.telefono}</td>
              <td><span className="eti" style={{ color: eti(l.estado).color, borderColor: eti(l.estado).color }}>{eti(l.estado).txt}</span></td>
              <td className="mono">{l.intentos}</td>
              <td><button className="btn sec chico" disabled={!!enCurso} onClick={() => setPorConfirmar(l)}>Llamar</button></td>
            </tr>
          ))}
          {!pendientes.length && <tr><td colSpan={6} style={{ color: "var(--tinta2)" }}>No tenés contactos pendientes.</td></tr>}
        </tbody></table></div>
        {enCurso && <div className="tip">Terminá la llamada en curso antes de abrir otra ficha.</div>}
      </div>
    </>
  );
}

/* ============ HISTORIAL: una fila por contacto, no por intento ============ */
function Historial({ soyAdmin }: { soyAdmin: boolean }) {
  const [llamadas, setLlamadas] = useState<Llamada[]>([]);
  const [abierto, setAbierto] = useState<number | null>(null);
  const traer = useCallback(() => {
    fetch("/api/llamadas").then((r) => (r.ok ? r.json() : { llamadas: [] })).then((d) => setLlamadas(d.llamadas ?? []));
  }, []);
  useEffect(() => { traer(); }, [traer]);

  // Agrupo por contacto: la última llamada manda, las anteriores quedan como intentos.
  const porLead = new Map<number, Llamada[]>();
  llamadas.forEach((l) => porLead.set(l.leadId, [...(porLead.get(l.leadId) ?? []), l]));
  const filas = [...porLead.values()].map((ls) => ({ ultima: ls[0], intentos: ls, total: ls.length }));
  const acep = filas.filter((f) => f.ultima.resultado === "ACEPTO").length;

  return (
    <>
      <div className="grid4">
        <div className="metrica"><span className="rotulo">Contactos trabajados</span><b>{filas.length}</b></div>
        <div className="metrica"><span className="rotulo">Llamadas hechas</span><b>{llamadas.length}</b></div>
        <div className="metrica"><span className="rotulo">Aceptaron</span><b>{acep}</b></div>
        <div className="metrica"><span className="rotulo">Efectividad</span><b>{filas.length ? Math.round((acep / filas.length) * 100) : 0}%</b></div>
      </div>
      <div className="tarjeta">
        <h2>Mis contactos trabajados</h2>
        <p className="sub">Una fila por persona, con el resultado más reciente. Tocá los intentos para ver el detalle.</p>
        <div className="tabla-scroll"><table><tbody>
          <tr><th>Última llamada</th><th>Contacto</th><th>DNI</th><th>Resultado actual</th><th>Intentos</th><th>Nota</th></tr>
          {filas.map((f) => (
            <Fragment key={f.ultima.leadId}>
              <tr>
                <td className="mono">{new Date(f.ultima.creadoEn).toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                <td>{f.ultima.lead?.nombre}</td>
                <td className="mono">{f.ultima.lead?.dni}</td>
                <td><span className="eti" style={{ color: eti(f.ultima.resultado).color, borderColor: eti(f.ultima.resultado).color }}>{eti(f.ultima.resultado).txt}</span></td>
                <td>
                  <button className="btn sec chico" onClick={() => setAbierto(abierto === f.ultima.leadId ? null : f.ultima.leadId)}>
                    {f.total} {abierto === f.ultima.leadId ? "▲" : "▼"}
                  </button>
                </td>
                <td>{f.ultima.nota ?? "—"}</td>
              </tr>
              {abierto === f.ultima.leadId && f.intentos.map((i) => (
                <tr key={i.id} style={{ background: "#F6F9FB" }}>
                  <td className="mono" style={{ paddingLeft: 24 }}>{new Date(i.creadoEn).toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                  <td colSpan={2} style={{ color: "var(--tinta2)" }}>intento previo</td>
                  <td><span className="eti" style={{ color: eti(i.resultado).color, borderColor: eti(i.resultado).color }}>{eti(i.resultado).txt}</span></td>
                  <td />
                  <td>{i.nota ?? "—"}</td>
                </tr>
              ))}
            </Fragment>
          ))}
          {!filas.length && <tr><td colSpan={6} style={{ color: "var(--tinta2)" }}>Todavía no registraste llamadas.</td></tr>}
        </tbody></table></div>
      </div>
    </>
  );
}

/* ============ ADMIN: monitor en vivo ============ */
function Monitor({ leads, usuarios, recargar }: { leads: Lead[]; usuarios: Usuario[]; recargar: () => void }) {
  const enLlamada = leads.filter((l) => l.enLlamadaDesde);
  useTicker(true);
  const callers = usuarios.filter((u) => u.rol === "CALLER" && u.activo);

  return (
    <>
      <div className="grid4">
        <div className="metrica"><span className="rotulo">Callers en llamada</span><b>{enLlamada.length}</b></div>
        <div className="metrica"><span className="rotulo">Callers libres</span><b>{callers.length - enLlamada.length}</b></div>
        <div className="metrica"><span className="rotulo">Fichas pendientes</span><b>{leads.filter((l) => ["PENDIENTE", "NO_CONTESTO", "VOLVER_A_LLAMAR"].includes(l.estado)).length}</b></div>
        <div className="metrica"><span className="rotulo">Aceptaron</span><b>{leads.filter((l) => l.estado === "ACEPTO").length}</b></div>
      </div>

      <div className="tarjeta">
        <h2>Quién está llamando ahora</h2>
        <p className="sub">Se actualiza solo cada 10 segundos.</p>
        <div className="tabla-scroll"><table><tbody>
          <tr><th>Caller</th><th>Estado</th><th>Contacto</th><th>Teléfono</th><th>Tiempo</th><th /></tr>
          {callers.map((c) => {
            const l = enLlamada.find((x) => x.asignadoAId === c.id);
            return (
              <tr key={c.id}>
                <td><b>{c.nombre}</b></td>
                <td>
                  <span className="eti" style={{ color: l ? "var(--acepto)" : "var(--tinta2)", borderColor: l ? "var(--acepto)" : "var(--linea)" }}>
                    {l ? "● En llamada" : "Libre"}
                  </span>
                </td>
                <td>{l ? `${l.nombre} (DNI ${l.dni})` : "—"}</td>
                <td className="mono">{l?.telefono ?? "—"}</td>
                <td className="mono" style={{ fontSize: 16, fontWeight: 600 }}>{l ? mmss(desde(l.enLlamadaDesde)) : "—"}</td>
                <td>{l && <button className="btn sec chico" onClick={async () => {
                  await fetch(`/api/leads/${l.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ liberar: true }) });
                  recargar();
                }}>Liberar ficha</button>}</td>
              </tr>
            );
          })}
          {!callers.length && <tr><td colSpan={6} style={{ color: "var(--tinta2)" }}>No hay callers activos.</td></tr>}
        </tbody></table></div>
        <div className="tip">“Liberar ficha” devuelve el contacto a la cola si un caller se quedó trabado o cerró la app en medio de una llamada.</div>
      </div>
    </>
  );
}

/* ============ CARGA DE CONTACTOS ============ */
function Cargar({ usuarios, recargar }: { usuarios: Usuario[]; recargar: () => void }) {
  const vacio = { nombre: "", dni: "", telefono: "", nota: "", asignadoA: "" };
  const [f, setF] = useState(vacio);
  const [masivo, setMasivo] = useState(""), [msg, setMsg] = useState<any>(null);
  const [destinoMasivo, setDestinoMasivo] = useState("");
  const callers = usuarios.filter((u) => u.rol === "CALLER" && u.activo);
  const num = (t: string) => t.replace(/\D/g, "");
  const faltan = !f.nombre.trim() || num(f.dni).length < 6 || num(f.telefono).length < 6 || !f.asignadoA;

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
        <p className="sub">Los cuatro campos con <b style={{ color: "var(--noquiso)" }}>*</b> son obligatorios. Al guardar, al caller elegido le llega el aviso al instante.</p>
        <div className="grid2">
          <div>
            <label>Nombre y apellido <b style={{ color: "var(--noquiso)" }}>*</b></label>
            <input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Ej: Carla Méndez" />
          </div>
          <div>
            <label>DNI <b style={{ color: "var(--noquiso)" }}>*</b></label>
            <input className="mono" inputMode="numeric" value={f.dni} onChange={(e) => setF({ ...f, dni: e.target.value })} placeholder="Solo números" />
            {!!f.dni && num(f.dni).length < 6 && <p className="sub" style={{ color: "var(--noquiso)" }}>El DNI es muy corto.</p>}
          </div>
          <div>
            <label>Teléfono <b style={{ color: "var(--noquiso)" }}>*</b></label>
            <input className="mono" inputMode="tel" value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} placeholder="Ej: 987 654 321" />
          </div>
          <div>
            <label>Caller asignado <b style={{ color: "var(--noquiso)" }}>*</b></label>
            <select value={f.asignadoA} onChange={(e) => setF({ ...f, asignadoA: e.target.value })}>
              <option value="">Elegí a quién se lo asignás…</option>
              {callers.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            {!callers.length && <p className="sub" style={{ color: "var(--noquiso)" }}>No hay callers activos: pedile al administrador que cree uno.</p>}
          </div>
        </div>
        <label>Nota para el caller</label>
        <textarea value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} />
        {msg?.error && <div className="error">{msg.error}</div>}
        {msg?.creados > 0 && <div className="ok">{msg.creados} contacto(s) cargados y avisados.</div>}
        {msg?.rechazados?.length > 0 && <div className="error">Rechazados: {msg.rechazados.join(" · ")}</div>}
        <button className="btn" style={{ marginTop: 14 }} disabled={faltan}
                onClick={() => { enviar(f); setF({ ...vacio, asignadoA: f.asignadoA }); }}>
          {faltan ? "Completá nombre, DNI, teléfono y caller" : "Guardar y avisar"}
        </button>
      </div>

      <div className="tarjeta">
        <h2>Carga masiva</h2>
        <p className="sub">Una línea por persona: <span className="mono">nombre, DNI, teléfono, nota</span></p>
        <label>Caller que recibe toda esta lista <b style={{ color: "var(--noquiso)" }}>*</b></label>
        <select value={destinoMasivo} onChange={(e) => setDestinoMasivo(e.target.value)}>
          <option value="">Elegí el caller…</option>
          {callers.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <textarea className="mono" style={{ minHeight: 120 }} value={masivo} onChange={(e) => setMasivo(e.target.value)}
                  placeholder="Carla Méndez, 45868665, 987654321, pidió info" />
        <button className="btn sec" style={{ marginTop: 12 }} disabled={!destinoMasivo || !masivo.trim()} onClick={() => {
          const contactos = masivo.split("\n").map((l) => l.split(/[,;\t]/).map((t) => t.trim())).filter((p) => p[0])
            .map(([nombre, dni, telefono, ...resto]) => ({ nombre, dni, telefono, nota: resto.join(", "), asignadoA: destinoMasivo }));
          enviar({ contactos }); setMasivo("");
        }}>{destinoMasivo ? "Cargar la lista" : "Elegí el caller primero"}</button>
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
  useTicker(!!admin);

  function abrir(l: Lead) {
    setEdit(l);
    setForm({ nombre: l.nombre, dni: l.dni, telefono: l.telefono, nota: l.nota ?? "", asignadoAId: l.asignadoAId, estado: l.estado });
  }
  async function guardar() {
    const cuerpo = editable === "admin" ? form
      : { nombre: form.nombre, dni: form.dni, telefono: form.telefono, nota: form.nota };
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
        <h2>Contactos · {leads.length}</h2>
        {editable === "admin" && <p className="sub">Tocá “Corregir” para arreglar cualquier dato, reasignar el caller o cambiar el resultado.</p>}
        {editable === "spamer" && <p className="sub">Podés corregir o borrar una ficha mientras el caller no la haya llamado todavía.</p>}
        <div className="tabla-scroll"><table><tbody>
          <tr>
            <th>Ficha</th><th>Contacto</th><th>DNI</th><th>Teléfono</th><th>Caller</th><th>Estado</th><th>Intentos</th><th>Última nota</th>{editable && <th />}
          </tr>
          {leads.map((l) => (
            <tr key={l.id}>
              <td className="mono">{String(l.id).padStart(4, "0")}</td>
              <td><b>{l.nombre}</b></td>
              <td className="mono">{l.dni}</td>
              <td className="mono">{l.telefono}</td>
              <td>{l.asignadoA?.nombre ?? "—"}</td>
              <td>
                {l.enLlamadaDesde
                  ? <span className="eti" style={{ color: "var(--acepto)", borderColor: "var(--acepto)" }}>● En llamada {mmss(desde(l.enLlamadaDesde))}</span>
                  : <span className="eti" style={{ color: eti(l.estado).color, borderColor: eti(l.estado).color }}>{eti(l.estado).txt}</span>}
              </td>
              <td className="mono">{l.intentos}</td>
              <td>{l.llamadas?.[0]?.nota ?? "—"}</td>
              {editable && (
                <td>
                  {editable === "spamer" && l.intentos > 0
                    ? <span className="sub">ya llamada</span>
                    : <button className="btn sec chico" onClick={() => abrir(l)}>Corregir</button>}
                </td>
              )}
            </tr>
          ))}
          {!leads.length && <tr><td colSpan={editable ? 9 : 8} style={{ color: "var(--tinta2)" }}>Todavía no hay contactos cargados.</td></tr>}
        </tbody></table></div>
      </div>
    </>
  );
}

/* ============ USUARIOS ============ */
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
        <p className="sub">Cada persona con su cuenta: así queda claro quién cargó cada dato y quién hizo cada llamada.</p>
        <div className="grid2">
          <div><label>Nombre</label><input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></div>
          <div><label>Usuario</label><input className="mono" value={f.usuario} onChange={(e) => setF({ ...f, usuario: e.target.value })} /></div>
          <div><label>Contraseña (mín. 8)</label><input value={f.clave} onChange={(e) => setF({ ...f, clave: e.target.value })} /></div>
          <div><label>Rol</label>
            <select value={f.rol} onChange={(e) => setF({ ...f, rol: e.target.value })}>
              <option value="CALLER">Caller</option>
              <option value="CARGADOR">Spamer (carga datos)</option>
              <option value="ADMIN">Administrador</option>
            </select>
          </div>
        </div>
        {msg && <div className={msg === "Usuario creado." ? "ok" : "error"}>{msg}</div>}
        <button className="btn" style={{ marginTop: 14 }} onClick={crear}>Crear usuario</button>
      </div>
      <div className="tarjeta">
        <h2>Equipo</h2>
        <div className="tabla-scroll"><table><tbody>
          <tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Avisos</th><th>Estado</th><th>Contraseña</th><th /></tr>
          {usuarios.map((u) => (
            <tr key={u.id}>
              <td><b>{u.nombre}</b></td>
              <td className="mono">{u.usuario}</td>
              <td>{ROL[u.rol] ?? u.rol}</td>
              <td><button className="btn sec chico" onClick={() => editar(u.id, { notificar: !u.notificar })}>{u.notificar ? "Sí" : "No"}</button></td>
              <td>{u.activo ? "Activo" : "Desactivado"}</td>
              <td><button className="btn sec chico" onClick={() => {
                const clave = prompt(`Nueva contraseña para ${u.nombre} (mínimo 8 caracteres):`);
                if (clave) editar(u.id, { clave });
              }}>Cambiar</button></td>
              <td><button className="btn sec chico" onClick={() => editar(u.id, { activo: !u.activo })}>{u.activo ? "Desactivar" : "Reactivar"}</button></td>
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
  const [tab, setTab] = useState<"equipo" | "alertas" | "bitacora">("equipo");

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
      <div className="tarjeta" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span className="rotulo">Período</span>
        {[1, 7, 30].map((n) => (
          <button key={n} className={`btn chico ${dias === n ? "" : "sec"}`} onClick={() => setDias(n)}>
            {n === 1 ? "Hoy" : `${n} días`}
          </button>
        ))}
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {([["equipo", "Equipo"], ["alertas", `Alertas (${d.sospechosas.length})`], ["bitacora", "Bitácora"]] as [any, string][]).map(([k, t]) => (
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
