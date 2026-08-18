"use client";
/**
 * Marca de Lima Limón.
 *
 * La idea: la cáscara de la rodaja de limón ES la vincha del auricular.
 * Los gajos hacen de ondas de sonido saliendo del centro, y el brazo del
 * micrófono cierra la figura. Un solo trazo, legible a 20 px o a pantalla completa.
 */
export function Logo({ size = 34, className = "" }: { size?: number; className?: string }) {
  const gajos = Array.from({ length: 8 }, (_, i) => i * 45 + 22.5);
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" className={className}
         fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* pulpa */}
      <circle cx="60" cy="58" r="34" fill="var(--lima-pulpa, #E9F26A)" />
      {/* gajos */}
      <g stroke="var(--lima-cascara, #14532D)" strokeWidth="3" strokeLinecap="round" opacity=".85">
        {gajos.map((g) => {
          const r = (g * Math.PI) / 180;
          return (
            <line key={g}
                  x1={60 + Math.cos(r) * 7} y1={58 + Math.sin(r) * 7}
                  x2={60 + Math.cos(r) * 29} y2={58 + Math.sin(r) * 29} />
          );
        })}
      </g>
      <circle cx="60" cy="58" r="6.5" fill="var(--lima-cascara, #14532D)" />

      {/* cáscara = vincha del auricular */}
      <circle cx="60" cy="58" r="34" stroke="var(--lima-cascara, #14532D)" strokeWidth="9" />

      {/* auriculares */}
      <rect x="6" y="50" width="22" height="38" rx="11" fill="var(--lima-cascara, #14532D)" />
      <rect x="92" y="50" width="22" height="38" rx="11" fill="var(--lima-cascara, #14532D)" />

      {/* brazo del micrófono */}
      <path d="M101 80 C103 104, 88 114, 70 113" stroke="var(--lima-cascara, #14532D)"
            strokeWidth="7" strokeLinecap="round" fill="none" />
      <circle cx="66" cy="113" r="8" fill="var(--lima-acento, #A8C425)" />
    </svg>
  );
}

/** Logo + nombre, para la barra superior y el login. */
export function Marca({ size = 34, sub }: { size?: number; sub?: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <Logo size={size} />
      <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.05 }}>
        <b style={{ fontFamily: '"IBM Plex Sans Condensed", sans-serif', fontSize: size * 0.55, letterSpacing: ".04em", textTransform: "uppercase" }}>
          Lima Limón
        </b>
        {sub && (
          <span style={{ fontSize: size * 0.3, letterSpacing: ".18em", textTransform: "uppercase", opacity: .75 }}>
            {sub}
          </span>
        )}
      </span>
    </span>
  );
}
