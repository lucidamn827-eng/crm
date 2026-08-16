"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function Formulario() {
  const [usuario, setUsuario] = useState(""), [clave, setClave] = useState("");
  const [error, setError] = useState(""), [cargando, setCargando] = useState(false);
  const router = useRouter();
  const motivo = useSearchParams().get("m");
  const aviso =
    motivo === "desplazada" ? "Tu sesión se cerró porque entraste con esta cuenta en otro dispositivo."
    : motivo === "vencida" ? "Tu sesión ya no es válida. Volvé a entrar."
    : "";

  async function entrar() {
    setCargando(true); setError("");
    const r = await fetch("/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario, clave }),
    });
    const d = await r.json();
    setCargando(false);
    if (!r.ok) return setError(d.error ?? "No se pudo entrar.");
    router.push("/panel");
  }

  return (
    <div className="login">
      <div>
        <div style={{ display: "flex", gap: 9, alignItems: "center", color: "var(--petroleo)", marginBottom: 14, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase" }}>
          <span className="jack" /> Central
        </div>
        <div className="tarjeta">
          <h1>Entrar a la central</h1>
          <p className="sub">Cada persona entra con su usuario. Todo queda firmado con su nombre.</p>
          <label htmlFor="u">Usuario</label>
          <input id="u" value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="username" />
          <label htmlFor="c">Contraseña</label>
          <input id="c" type="password" value={clave} onChange={(e) => setClave(e.target.value)}
                 onKeyDown={(e) => e.key === "Enter" && entrar()} autoComplete="current-password" />
          {aviso && !error && <div className="error">{aviso}</div>}
          {error && <div className="error">{error}</div>}
          <button className="btn" style={{ width: "100%", marginTop: 16 }} onClick={entrar} disabled={cargando}>
            {cargando ? "Entrando..." : "Entrar"}
          </button>
        </div>
      </div>
    </div>
  );
}


export default function Login() {
  return (
    <Suspense fallback={<div className="login"><div className="tarjeta">Cargando…</div></div>}>
      <Formulario />
    </Suspense>
  );
}
