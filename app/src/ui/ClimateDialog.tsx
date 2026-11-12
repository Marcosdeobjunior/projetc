import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  CLIMATE_PRESETS,
  EARTH_WINDS,
  normalizeClimate,
  seaLevelTemp,
  type WorldClimate,
} from "../world/worldgen";
import { Icon } from "./Icon";

/** Cor de uma temperatura (°C): azul no gelo, verde no ameno, vermelho no calor. */
function tempColor(t: number): string {
  const stops: [number, [number, number, number]][] = [
    [-40, [70, 60, 160]],
    [-20, [90, 130, 210]],
    [-5, [120, 200, 230]],
    [5, [150, 220, 170]],
    [15, [200, 230, 120]],
    [22, [250, 220, 110]],
    [28, [245, 160, 90]],
    [38, [215, 70, 70]],
  ];
  if (t <= stops[0]![0]) return `rgb(${stops[0]![1].join(",")})`;
  for (let k = 1; k < stops.length; k++) {
    const [t1, c1] = stops[k]!;
    const [t0, c0] = stops[k - 1]!;
    if (t <= t1) {
      const f = (t - t0) / (t1 - t0);
      return `rgb(${c0.map((v, i) => Math.round(v + (c1[i]! - v) * f)).join(",")})`;
    }
  }
  return `rgb(${stops[stops.length - 1]![1].join(",")})`;
}

const BANDS = ["90°–60°N", "60°–30°N", "30°N–0°", "0°–30°S", "30°–60°S", "60°–90°S"];
const COMPASS = ["norte", "nordeste", "leste", "sudeste", "sul", "sudoeste", "oeste", "noroeste"];
const windName = (deg: number) => COMPASS[Math.round(deg / 45) % 8]!;

/**
 * "Configurar mundo": temperatura no equador e nos polos, chuva e ventos de
 * cada faixa de latitude. Mostra um globo com as faixas de temperatura.
 */
export function ClimateDialog({
  climate,
  onApply,
  onClose,
}: {
  climate: WorldClimate | undefined;
  onApply(c: WorldClimate): void;
  onClose(): void;
}) {
  const [draft, setDraft] = useState(() => normalizeClimate(climate));
  const [auto, setAuto] = useState(true);
  const [pos, setPos] = useState({ x: 160, y: 40 });
  const [min, setMin] = useState(false);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const applied = useRef(JSON.stringify(normalizeClimate(climate)));

  const apply = (c: WorldClimate) => {
    const key = JSON.stringify(c);
    if (key === applied.current) return;
    applied.current = key;
    onApply(c);
  };
  const change = (patch: Partial<WorldClimate>) => {
    const next = normalizeClimate({ ...draft, ...patch });
    setDraft(next);
    if (auto) {
      // Espera o arraste do controle parar antes de refazer o mundo.
      clearTimeout(timer.current);
      timer.current = setTimeout(() => apply(next), 350);
    }
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const onDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
  };
  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (d)
      setPos({ x: Math.max(0, d.px + e.clientX - d.x), y: Math.max(0, d.py + e.clientY - d.y) });
  };

  const field = (
    key: "equator" | "northPole" | "southPole" | "precipitation",
    label: string,
    unit: string,
    lo: number,
    hi: number,
    hint: string,
  ) => (
    <label className="climate-field" title={hint}>
      <span>{label}</span>
      <input
        type="range"
        min={lo}
        max={hi}
        value={draft[key]}
        onChange={(e) => change({ [key]: Number(e.target.value) })}
      />
      <input
        className="text-input"
        type="number"
        min={lo}
        max={hi}
        value={draft[key]}
        onChange={(e) => e.target.value !== "" && change({ [key]: Number(e.target.value) })}
      />
      <em>{unit}</em>
    </label>
  );

  // Globo: faixas de 3° de latitude pintadas pela temperatura ao nível do mar.
  const R = 118;
  const cx = 150;
  const cy = 140;
  const yOf = (lat: number) => cy - R * Math.sin((lat * Math.PI) / 180);
  const stripes = [];
  for (let lat = -90; lat < 90; lat += 3) {
    const y0 = yOf(lat + 3);
    const y1 = yOf(lat);
    stripes.push(
      <rect
        key={lat}
        x={cx - R}
        y={y0}
        width={R * 2}
        height={y1 - y0 + 0.6}
        fill={tempColor(seaLevelTemp(draft, lat + 1.5))}
      />,
    );
  }
  const meridians = [-75, -50, -25, 25, 50, 75].map((lon) => (
    <ellipse
      key={lon}
      cx={cx}
      cy={cy}
      rx={Math.abs(Math.sin((lon * Math.PI) / 180)) * R}
      ry={R}
      fill="none"
      stroke="rgba(0,0,0,0.18)"
      strokeWidth="0.8"
    />
  ));
  const parallels = [-60, -30, 30, 60].map((lat) => {
    const y = yOf(lat);
    const w = Math.cos((lat * Math.PI) / 180) * R;
    return (
      <line
        key={lat}
        x1={cx - w}
        x2={cx + w}
        y1={y}
        y2={y}
        stroke="rgba(0,0,0,0.3)"
        strokeWidth="0.8"
      />
    );
  });

  return (
    <div
      className="burg-dialog climate-dialog"
      style={{ left: pos.x, top: pos.y }}
      role="dialog"
      aria-label="Configurar mundo"
    >
      <header
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={() => (drag.current = null)}
      >
        <h2>Configurar mundo</h2>
        <button
          type="button"
          aria-label={min ? "Mostrar" : "Minimizar"}
          title={min ? "Mostrar" : "Minimizar"}
          onClick={() => setMin((v) => !v)}
        >
          <Icon name={min ? "plus" : "minus"} size={14} />
        </button>
        <button type="button" aria-label="Fechar" title="Fechar" onClick={onClose}>
          <Icon name="close" size={14} />
        </button>
      </header>
      {!min && (
        <div className="burg-body">
          <div className="climate-grid">
            <div className="climate-fields">
              {field(
                "equator",
                "Equador",
                "°C",
                -20,
                50,
                "Temperatura média anual no equador, ao nível do mar",
              )}
              {field("northPole", "Polo Norte", "°C", -60, 30, "Temperatura média no Polo Norte")}
              {field("southPole", "Polo Sul", "°C", -60, 30, "Temperatura média no Polo Sul")}
              {field(
                "precipitation",
                "Precipitação",
                "%",
                0,
                300,
                "Chuva em relação à da Terra (100% = normal)",
              )}
              <p className="climate-note">
                A temperatura cai do equador até cada polo (mais devagar nos trópicos) e 6,5 °C a
                cada quilômetro de altitude. Os ventos de cada faixa trazem a chuva do mar: chove
                nas encostas voltadas para o vento e pouco atrás das serras.
              </p>
              <p className="climate-note">
                Equador: {draft.equator}°C · 45°N: {Math.round(seaLevelTemp(draft, 45))}°C · 45°S:{" "}
                {Math.round(seaLevelTemp(draft, -45))}°C
              </p>
            </div>
            <div className="climate-globe">
              <svg viewBox="0 0 330 285" role="img" aria-label="Temperatura por latitude">
                <defs>
                  <clipPath id="climate-clip">
                    <circle cx={cx} cy={cy} r={R} />
                  </clipPath>
                  <radialGradient id="climate-shade" cx="0.38" cy="0.35" r="0.75">
                    <stop offset="0" stopColor="#fff" stopOpacity="0.25" />
                    <stop offset="1" stopColor="#000" stopOpacity="0.28" />
                  </radialGradient>
                </defs>
                <g clipPath="url(#climate-clip)">
                  {stripes}
                  {meridians}
                  {parallels}
                  <line
                    x1={cx}
                    x2={cx}
                    y1={cy - R}
                    y2={cy + R}
                    stroke="#3a4fd0"
                    strokeWidth="1.2"
                  />
                  <line
                    x1={cx - R}
                    x2={cx + R}
                    y1={cy}
                    y2={cy}
                    stroke="#d03a3a"
                    strokeWidth="1.4"
                  />
                  <circle cx={cx} cy={cy} r={R} fill="url(#climate-shade)" />
                </g>
                <circle cx={cx} cy={cy} r={R} fill="none" stroke="#333" strokeWidth="1" />
                {[60, 30, 0, -30, -60].map((lat) => (
                  <text
                    key={lat}
                    x={cx - R - 8}
                    y={yOf(lat) + 4}
                    textAnchor="end"
                    className="climate-lat"
                  >
                    {Math.abs(lat)}°{lat > 0 ? "N" : lat < 0 ? "S" : ""}
                  </text>
                ))}
                <text x={cx} y={14} textAnchor="middle" className="climate-lat">
                  {draft.northPole}°C
                </text>
                <text x={cx} y={cy + R + 16} textAnchor="middle" className="climate-lat">
                  {draft.southPole}°C
                </text>
              </svg>
              {/* Ventos: um botão por faixa de 30°; clique gira 45° (Shift gira para o outro lado). */}
              <div className="climate-winds" aria-label="Ventos">
                {draft.winds.map((w, k) => {
                  const lat = 75 - k * 30;
                  return (
                    <button
                      key={k}
                      type="button"
                      style={{ top: `${(yOf(lat) / 285) * 100}%` }}
                      title={`Vento de ${BANDS[k]}: sopra para ${windName(w)} (clique para girar)`}
                      aria-label={`Vento de ${BANDS[k]}: sopra para ${windName(w)}`}
                      onClick={(e) => {
                        const winds = [...draft.winds];
                        winds[k] = (w + (e.shiftKey ? 315 : 45)) % 360;
                        change({ winds });
                      }}
                    >
                      <svg viewBox="-10 -10 20 20" style={{ transform: `rotate(${w}deg)` }}>
                        <path d="M0 8 V-7 M-4 -3 L0 -7 L4 -3" />
                      </svg>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                className="btn ghost sm climate-reset"
                onClick={() => change({ winds: EARTH_WINDS })}
              >
                Restaurar ventos
              </button>
            </div>
          </div>
          <div className="climate-presets">
            <span>Predefinições:</span>
            {CLIMATE_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                className="btn ghost sm"
                title={p.hint}
                onClick={() => change(p.climate)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <footer className="climate-footer">
            <label className="region-check">
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
              aplicar alterações automaticamente
            </label>
            <button
              type="button"
              className="btn primary sm"
              onClick={() => {
                clearTimeout(timer.current);
                apply(draft);
              }}
            >
              Atualizar mundo
            </button>
          </footer>
        </div>
      )}
    </div>
  );
}
