"use client";
import { useEffect, useState, useCallback, useRef, Fragment } from "react";
import { useRouter } from "next/navigation";
import Avisador from "./Avisador";
import { Marca } from "../Logo";

type Sesion = { id: string; usuario: string; nombre: string; rol: "ADMIN" | "CARGADOR" | "CALLER" };
type Lead = {
  id: number; nombre: string; dni: string; telefono: string; nota?: string | null;
  estado: string; intentos: number; enLlamadaDesde?: string | null;
  asignadoA: { nombre: string }; asignadoAId: string; cargadoPor: { nombre: string };
  llamadas: { nota?: string | null; creadoEn: string }[];
};
type Usuario = { id: string; usuario: string; nombre: string; rol: string; telefono?: string | null; telegramId?: string | null; codigoTg?: string | null; notificar: boolean; activo: boolean };
type Llamada = { id: number; resultado: string; nota?: string | null; creadoEn: string; leadId: number; caller?: { nombre: string }; lead?: { nombre: string; dni: string; telefono: string; cargadoPor?: { nombre: string } } };

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
    sesion.rol === "CALLER" ? [["cola", "Mi cola"], ["historial", "Mis llamadas"], ["liquidacion", "💵 Mi liquidación"], ["ranking", "🏆 Ranking"], ["cielo", "☁️ El cielo es el límite"]] :
    sesion.rol === "CARGADOR" ? [["cargar", "Cargar contactos"], ["mias", "Lo que subí"], ["ranking", "🏆 Ranking"], ["cielo", "☁️ El cielo es el límite"]] :
    [["monitor", "En vivo"], ["supervision", "Supervisión"], ["cargar", "Cargar contactos"], ["todos", "Todos los contactos"], ["usuarios", "Usuarios"], ["avisos", "Avisos"], ["liquidacion", "💵 Liquidación"], ["ranking", "🏆 Ranking"], ["cielo", "☁️ El cielo es el límite"]];

  const marca =
    sesion.rol === "CALLER" ? { titulo: "Mesa de llamadas", color: "#14532D" } :
    sesion.rol === "CARGADOR" ? { titulo: "Mesa de spamer", color: "#4C1D95" } :
    { titulo: "Supervisión", color: "#1F2937" };

  const [vista, setVista] = useState(pestanas[0][0]);
  const [avisosOk, setAvisosOk] = useState(sesion.rol !== "CALLER");
  const [saludo, setSaludo] = useState<any>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const router = useRouter();

  const cargar = useCallback(async () => {
    const r = await fetch("/api/leads");
    // 409 = alguien entró con esta misma cuenta en otro dispositivo.
    if (r.status === 409) return router.push("/?m=desplazada");
    if (r.status === 440) return router.push("/?m=inactividad");
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

  // Al entrar, le recordamos en qué puesto está: lo primero que ve al abrir la app.
  useEffect(() => {
    if (sesion.rol === "ADMIN") return;
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

  return (
    <>
      <header className="tope" style={{ background: marca.color }}>
        <div className="tope-in">
          <Marca size={36} sub={marca.titulo} />
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
        {vista === "ranking" && <Ranking sesion={sesion} />}
        {vista === "cielo" && <Cielo sesion={sesion} />}
        {vista === "liquidacion" && <Liquidacion sesion={sesion} />}
      </main>
    </>
  );
}

/* ============ CALLER: cola con confirmación antes de llamar ============ */
function Cola({ leads, recargar }: { leads: Lead[]; recargar: () => void }) {
  const [porConfirmar, setPorConfirmar] = useState<Lead | null>(null);
  const [nota, setNota] = useState(""), [msg, setMsg] = useState("");
  const [cobro, setCobro] = useState<{ monto: string; referencia: string } | null>(null);
  const [festejo, setFestejo] = useState<any>(null);
  const enCurso = leads.find((l) => l.enLlamadaDesde);
  useTicker(!!enCurso);

  async function tomar(id: number, si: boolean) {
    await fetch(`/api/leads/${id}/tomar`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tomar: si }),
    });
    setPorConfirmar(null);
    recargar();
  }

  async function registrar(id: number, resultado: string, extra: any = {}) {
    const r = await fetch(`/api/leads/${id}/resultado`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resultado, nota, ...extra }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg(d.error ?? "No se pudo registrar.");

    if (resultado === "ACEPTO") {
      setFestejo({ monto: Number(extra.monto), comision: Number(extra.monto) * 0.1, escalon: d.subioEscalon });
      setCobro(null);
    } else {
      setMsg(`Registrado: ${eti(resultado).txt}`);
    }
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
            <p className="sub">Data cargada por <b>{porConfirmar.cargadoPor?.nombre ?? "—"}</b></p>
            <div className="numero" style={{ fontSize: 26, margin: "10px 0" }}>{porConfirmar.telefono}</div>
            <p className="sub">Si decís que sí, tu supervisor va a ver que estás en llamada y arranca el cronómetro.</p>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button className="btn" style={{ flex: 1 }} onClick={() => tomar(porConfirmar.id, true)}>Sí, voy a llamar</button>
              <button className="btn sec" style={{ flex: 1 }} onClick={() => setPorConfirmar(null)}>No, todavía no</button>
            </div>
          </div>
        </div>
      )}

      {cobro && enCurso && (
        <div className="velo">
          <div className="modal" style={{ maxWidth: 440 }}>
            <span className="rotulo">Cerrando la venta</span>
            <h2>¿Cuánto pagó el cliente?</h2>
            <p className="sub">{enCurso.nombre} · DNI {enCurso.dni}</p>
            <label htmlFor="mto">Monto cobrado en soles *</label>
            <input id="mto" className="mono" inputMode="decimal" autoFocus
                   style={{ fontSize: 26, fontWeight: 700, textAlign: "center" }}
                   placeholder="0.00" value={cobro.monto}
                   onChange={(e) => setCobro({ ...cobro, monto: e.target.value.replace(/[^\d.]/g, "") })} />
            {!!Number(cobro.monto) && (
              <p className="sub" style={{ textAlign: "center", marginTop: 6 }}>
                Tu comisión: <b className="mono" style={{ color: "var(--acepto)", fontSize: 17 }}>
                  S/ {(Number(cobro.monto) * 0.1).toFixed(2)}
                </b>
              </p>
            )}
            <label htmlFor="ref">N° de operación o voucher (opcional)</label>
            <input id="ref" className="mono" placeholder="Ej: 0098234" value={cobro.referencia}
                   onChange={(e) => setCobro({ ...cobro, referencia: e.target.value })} />
            <div className="tip">Sin monto no se puede cerrar como “Aceptó”. Tu supervisor revisa y valida cada venta.</div>
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button className="btn" style={{ flex: 1 }} disabled={!(Number(cobro.monto) > 0)}
                      onClick={() => registrar(enCurso.id, "ACEPTO", { monto: Number(cobro.monto), referencia: cobro.referencia })}>
                Confirmar venta
              </button>
              <button className="btn sec" onClick={() => setCobro(null)}>Volver</button>
            </div>
          </div>
        </div>
      )}

      {festejo && (
        <div className="velo" onClick={() => setFestejo(null)}>
          <div className="modal" style={{ maxWidth: 420, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 62, lineHeight: 1 }}>{festejo.escalon ? "☁️" : "🎉"}</div>
            <h2>{festejo.escalon ? "¡Subiste de escalón!" : "¡Venta cerrada!"}</h2>
            <p className="sub" style={{ fontSize: 15 }}>Cobraste S/ {festejo.monto.toFixed(2)} al cliente.</p>
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
          <a className="numero" href={`tel:${enCurso.telefono.replace(/\D/g, "")}`}>{enCurso.telefono}</a>
          <p className="sub">
            DNI <span className="mono">{enCurso.dni}</span> · {enCurso.intentos} intento(s) ·
            data de <b>{enCurso.cargadoPor?.nombre ?? "—"}</b>
          </p>
          {enCurso.nota && <p style={{ marginTop: 8 }}><b>Nota:</b> {enCurso.nota}</p>}
          <label>Nota de la llamada</label>
          <textarea value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej: pidió que lo llamen después de las 18 h" />
          <div className="resultados">
            <button className="res a" onClick={() => setCobro({ monto: "", referencia: "" })}>Aceptó</button>
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
          <tr><th>Contacto</th><th>DNI</th><th>Teléfono</th><th>Spamer</th><th>Estado</th><th>Intentos</th><th /></tr>
          {pendientes.map((l) => (
            <tr key={l.id}>
              <td><b>{l.nombre}</b></td>
              <td className="mono">{l.dni}</td>
              <td className="mono">{l.telefono}</td>
              <td>{l.cargadoPor?.nombre ?? "—"}</td>
              <td><span className="eti" style={{ color: eti(l.estado).color, borderColor: eti(l.estado).color }}>{eti(l.estado).txt}</span></td>
              <td className="mono">{l.intentos}</td>
              <td><button className="btn sec chico" disabled={!!enCurso} onClick={() => setPorConfirmar(l)}>Llamar</button></td>
            </tr>
          ))}
          {!pendientes.length && <tr><td colSpan={7} style={{ color: "var(--tinta2)" }}>No tenés contactos pendientes.</td></tr>}
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
          <tr><th>Última llamada</th><th>Contacto</th><th>DNI</th><th>Spamer</th><th>Resultado actual</th><th>Intentos</th><th>Nota</th></tr>
          {filas.map((f) => (
            <Fragment key={f.ultima.leadId}>
              <tr>
                <td className="mono">{new Date(f.ultima.creadoEn).toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                <td>{f.ultima.lead?.nombre}</td>
                <td className="mono">{f.ultima.lead?.dni}</td>
                <td>{f.ultima.lead?.cargadoPor?.nombre ?? "—"}</td>
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
                  <td colSpan={3} style={{ color: "var(--tinta2)" }}>intento previo</td>
                  <td><span className="eti" style={{ color: eti(i.resultado).color, borderColor: eti(i.resultado).color }}>{eti(i.resultado).txt}</span></td>
                  <td />
                  <td>{i.nota ?? "—"}</td>
                </tr>
              ))}
            </Fragment>
          ))}
          {!filas.length && <tr><td colSpan={7} style={{ color: "var(--tinta2)" }}>Todavía no registraste llamadas.</td></tr>}
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
          <tr><th>Caller</th><th>Estado</th><th>Contacto</th><th>Spamer</th><th>Teléfono</th><th>Tiempo</th><th /></tr>
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
                <td>{l?.cargadoPor?.nombre ?? "—"}</td>
                <td className="mono">{l?.telefono ?? "—"}</td>
                <td className="mono" style={{ fontSize: 16, fontWeight: 600 }}>{l ? mmss(desde(l.enLlamadaDesde)) : "—"}</td>
                <td>{l && <button className="btn sec chico" onClick={async () => {
                  await fetch(`/api/leads/${l.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ liberar: true }) });
                  recargar();
                }}>Liberar ficha</button>}</td>
              </tr>
            );
          })}
          {!callers.length && <tr><td colSpan={7} style={{ color: "var(--tinta2)" }}>No hay callers activos.</td></tr>}
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
  const [msg, setMsg] = useState<any>(null);
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
            <th>Ficha</th><th>Contacto</th><th>DNI</th><th>Teléfono</th><th>Spamer</th><th>Caller</th><th>Estado</th><th>Intentos</th><th>Última nota</th>{editable && <th />}
          </tr>
          {leads.map((l) => (
            <tr key={l.id}>
              <td className="mono">{String(l.id).padStart(4, "0")}</td>
              <td><b>{l.nombre}</b></td>
              <td className="mono">{l.dni}</td>
              <td className="mono">{l.telefono}</td>
              <td>{l.cargadoPor?.nombre ?? "—"}</td>
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
          {!leads.length && <tr><td colSpan={editable ? 10 : 9} style={{ color: "var(--tinta2)" }}>Todavía no hay contactos cargados.</td></tr>}
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
        {msg && <div className={msg.includes("creado") || msg.includes("eliminado") ? "ok" : "error"}>{msg}</div>}
        <button className="btn" style={{ marginTop: 14 }} onClick={crear}>Crear usuario</button>
      </div>
      <div className="tarjeta">
        <h2>Equipo</h2>
        <p className="sub">“Eliminar” solo funciona con usuarios que nunca cargaron datos ni hicieron llamadas. Si ya trabajaron, usá “Desactivar”: no pueden entrar más, pero su historial se conserva.</p>
        <div className="tabla-scroll"><table><tbody>
          <tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Avisos</th><th>Estado</th><th>Contraseña</th><th /><th /></tr>
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
  const [tab, setTab] = useState<"equipo" | "spamers" | "alertas" | "bitacora">("equipo");

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
          {([["equipo", "Callers"], ["spamers", "Spamers"], ["alertas", `Alertas (${d.sospechosas.length})`], ["bitacora", "Bitácora"]] as [any, string][]).map(([k, t]) => (
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

      {(sesion.rol === "CALLER" || sesion.rol === "ADMIN") && (
        <>
          <Podio titulo="Callers · más clientes que aceptaron" unidad="aceptaron"
                 gente={d.callers} yo={sesion.id} />
          <Premio vigentes={d.bonoVigente?.caller} tabla={d.callers} yo={sesion.id} />
        </>
      )}
      {(sesion.rol === "CARGADOR" || sesion.rol === "ADMIN") && (
        <>
          <Podio titulo="Spamers · más data subida" unidad="contactos"
                 gente={d.spamers} yo={sesion.id} />
          <Premio vigentes={d.bonoVigente?.spamer} tabla={d.spamers} yo={sesion.id} />
        </>
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

function Liquidacion({ sesion }: { sesion: Sesion }) {
  const [d, setD] = useState<any>(null);
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
        <div className="grid4">
          <div className="metrica"><span className="rotulo">Vendido esta semana</span><b style={{ fontSize: 22 }}>{soles(d.totales.vendido)}</b></div>
          <div className="metrica"><span className="rotulo">Ventas cerradas</span><b>{d.totales.ventas}</b></div>
          <div className="metrica"><span className="rotulo">Comisiones</span><b style={{ fontSize: 22 }}>{soles(d.totales.comision)}</b></div>
          <div className="metrica"><span className="rotulo">Total a pagar</span><b style={{ fontSize: 22, color: "var(--noquiso)" }}>{soles(d.totales.aPagar)}</b></div>
        </div>

        <div className="tarjeta">
          <h2>Por caller</h2>
          <p className="sub">Comisión + bono de escalón. El total a pagar incluye los S/ {d.totales.bonos} de bonos.</p>
          <div className="tabla-scroll"><table><tbody>
            <tr><th>Caller</th><th>Ventas</th><th>Vendido</th><th>Ticket promedio</th><th>Tasa</th><th>Comisión</th><th>Bono</th><th>Total</th><th>Sin validar</th></tr>
            {d.filas.map((f: any) => (
              <tr key={f.id}>
                <td><b>{f.nombre}</b></td>
                <td className="mono">{f.ventas}{f.anuladas > 0 && <span style={{ color: "var(--noquiso)" }}> (−{f.anuladas})</span>}</td>
                <td className="mono">{soles(f.vendido)}</td>
                <td className="mono">{soles(f.ticket)}</td>
                <td className="mono">{Math.round(f.tasa * 100)}%</td>
                <td className="mono">{soles(f.comision)}</td>
                <td className="mono">{f.bono ? soles(f.bono) : "—"}</td>
                <td className="mono" style={{ fontWeight: 700 }}>{soles(f.total)}</td>
                <td className="mono" style={{ color: f.pendientesValidar ? "var(--nocontesto)" : undefined }}>{f.pendientesValidar}</td>
              </tr>
            ))}
          </tbody></table></div>
        </div>

        <div className="tarjeta">
          <h2>Ventas de la semana</h2>
          <p className="sub">Validá las que confirmaste que entraron y anulá las que se cayeron. Una venta anulada no paga comisión ni suma al ranking.</p>
          <div className="tabla-scroll"><table><tbody>
            <tr><th>Fecha</th><th>Caller</th><th>Cliente</th><th>Monto</th><th>Referencia</th><th>Estado</th><th /></tr>
            {d.ventas.map((v: any) => (
              <tr key={v.id} style={v.anulada ? { opacity: .55 } : undefined}>
                <td className="mono">{new Date(v.creadoEn).toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                <td>{v.caller}</td>
                <td>{v.lead?.nombre}<br /><span className="mono sub">{v.lead?.dni}</span></td>
                <td className="mono" style={{ fontWeight: 700 }}>{soles(v.monto ?? 0)}</td>
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
                    ? <button className="btn chico sec" onClick={() => confirm("¿Anular esta venta? No paga comisión ni cuenta para el ranking.") && revisar(v.id, { anulada: true, validada: false })}>Anular</button>
                    : <button className="btn chico sec" onClick={() => revisar(v.id, { anulada: false })}>Restaurar</button>}
                  <button className="btn chico sec" onClick={() => {
                    const m = prompt("Corregir el monto en soles:", String(v.monto ?? 0));
                    if (m !== null && Number(m) > 0) revisar(v.id, { monto: Number(m) });
                  }}>Monto</button>
                </td>
              </tr>
            ))}
            {!d.ventas.length && <tr><td colSpan={7} style={{ color: "var(--tinta2)" }}>Sin ventas esta semana.</td></tr>}
          </tbody></table></div>
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
          {soles(m.comision)} de comisión{m.bono > 0 && <> + {soles(m.bono)} de bono</>}
        </p>
      </div>

      <div className="grid4">
        <div className="metrica"><span className="rotulo">Ventas</span><b>{m.ventas}</b></div>
        <div className="metrica"><span className="rotulo">Vendido</span><b style={{ fontSize: 21 }}>{soles(m.vendido)}</b></div>
        <div className="metrica"><span className="rotulo">Tu tasa</span><b>{Math.round(m.tasa * 100)}%</b></div>
        <div className="metrica"><span className="rotulo">Venta promedio</span><b style={{ fontSize: 21 }}>{soles(m.ticket)}</b></div>
      </div>

      {m.siguiente && (
        <div className="tarjeta">
          <b>Te faltan {m.siguiente.meta - m.ventas} ventas para el bono de S/ {m.siguiente.bono}</b>
          <div className="barra" style={{ marginTop: 10, height: 12 }}>
            <span style={{ width: `${Math.min(100, (m.ventas / m.siguiente.meta) * 100)}%` }} />
          </div>
          <p className="sub" style={{ marginTop: 8 }}>
            {m.tasa > 0.1
              ? "Estás cobrando al 12% por haber salido 1° la semana pasada."
              : "Si salís 1° en el ranking, la próxima semana cobrás al 12%."}
          </p>
        </div>
      )}

      <div className="tarjeta">
        <h2>Mis ventas de la semana</h2>
        <p className="sub">Tu supervisor valida cada una. Si se cae una venta, se anula y deja de contar.</p>
        <div className="tabla-scroll"><table><tbody>
          <tr><th>Fecha</th><th>Cliente</th><th>Monto</th><th>Tu comisión</th><th>Estado</th></tr>
          {d.detalle.map((v: any) => (
            <tr key={v.id} style={v.anulada ? { opacity: .55 } : undefined}>
              <td className="mono">{new Date(v.creadoEn).toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
              <td>{v.lead?.nombre}</td>
              <td className="mono">{soles(v.monto ?? 0)}</td>
              <td className="mono" style={{ color: "var(--acepto)", fontWeight: 600 }}>{soles((v.monto ?? 0) * m.tasa)}</td>
              <td>
                {v.anulada
                  ? <span className="eti" style={{ color: "var(--noquiso)", borderColor: "var(--noquiso)" }}>Anulada</span>
                  : v.validada
                    ? <span className="eti" style={{ color: "var(--acepto)", borderColor: "var(--acepto)" }}>Validada</span>
                    : <span className="eti" style={{ color: "var(--nocontesto)", borderColor: "var(--nocontesto)" }}>En revisión</span>}
              </td>
            </tr>
          ))}
          {!d.detalle.length && <tr><td colSpan={5} style={{ color: "var(--tinta2)" }}>Todavía no cerraste ventas esta semana.</td></tr>}
        </tbody></table></div>
      </div>
    </>
  );
}
