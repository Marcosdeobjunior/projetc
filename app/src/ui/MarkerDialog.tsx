import { useRef, useState, type PointerEvent } from "react";
import {
  MARKER_TYPES,
  MARKER_TYPES_BY_ERA,
  markerIcon,
  type Marker,
  type MarkerType,
} from "../world/society";
import type { Era } from "../world/worldgen";
import { Icon } from "./Icon";
import { Select } from "./Select";

/** Ícones extras para marcadores do autor (além dos de cada tipo). */
const EXTRA_ICONS = [
  "⭐",
  "🏰",
  "⛪",
  "🗿",
  "🐉",
  "💀",
  "🔮",
  "⚓",
  "🏔️",
  "🌲",
  "🌊",
  "🔥",
  "💎",
  "📜",
  "🗝️",
  "🏹",
  "🛡️",
  "👑",
  "🕯️",
  "❓",
];

export interface MarkerPatch {
  type?: MarkerType;
  icon?: string;
  name?: string;
  legend?: string;
}

/**
 * Editar marcador: tipo, ícone, nome e lenda. Um marcador gerado pelo mapa vira
 * do autor na primeira mudança (o gerado some e fica a cópia editada).
 */
export function MarkerDialog({
  marker,
  era,
  onChange,
  onDelete,
  onClose,
}: {
  marker: Marker;
  era: Era;
  onChange(patch: MarkerPatch): void;
  onDelete(): void;
  onClose(): void;
}) {
  const [pos, setPos] = useState({ x: 160, y: 24 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const types = [...new Set([...MARKER_TYPES_BY_ERA[era], marker.type])];
  const icons = [...new Set([...types.map((t) => MARKER_TYPES[t].icon), ...EXTRA_ICONS])];
  const current = markerIcon(marker);

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

  return (
    <div
      className="burg-dialog marker-dialog"
      style={{ left: pos.x, top: pos.y }}
      role="dialog"
      aria-label="Editar marcador"
    >
      <header
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={() => (drag.current = null)}
      >
        <h2>Editar marcador</h2>
        <button type="button" aria-label="Fechar" title="Fechar" onClick={onClose}>
          <Icon name="close" size={14} />
        </button>
      </header>
      <div className="burg-body">
        <div className="marker-head">
          <span className="marker-big" aria-hidden="true">
            {current}
          </span>
          <div className="burg-fields">
            <label>
              <span>Nome</span>
              <input
                className="text-input"
                key={marker.key + marker.name}
                defaultValue={marker.name}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== marker.name) onChange({ name: v });
                }}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              />
            </label>
            <label>
              <span>Tipo</span>
              <Select
                value={marker.type}
                options={types.map((t) => ({ value: t, label: MARKER_TYPES[t].label }))}
                onChange={(v) => v && v !== marker.type && onChange({ type: v as MarkerType })}
              />
            </label>
          </div>
        </div>
        <div className="marker-icons" role="radiogroup" aria-label="Ícone">
          {icons.map((ic) => (
            <button
              key={ic}
              type="button"
              role="radio"
              aria-checked={ic === current}
              className={ic === current ? "on" : ""}
              onClick={() => ic !== current && onChange({ icon: ic })}
            >
              {ic}
            </button>
          ))}
        </div>
        <label className="marker-legend">
          <span>Lenda</span>
          <textarea
            className="text-input"
            key={marker.key + marker.legend}
            defaultValue={marker.legend}
            placeholder="O que há neste lugar, quem conta histórias sobre ele…"
            onBlur={(e) => e.target.value !== marker.legend && onChange({ legend: e.target.value })}
          />
        </label>
        <p className="field-hint">
          {marker.user
            ? "Arraste o ícone no mapa (ferramenta Mover) para mudá-lo de lugar."
            : "Marcador gerado pelo mapa: ao editar ou mover, ele vira seu."}
        </p>
        <footer>
          <span />
          <button type="button" className="btn ghost sm danger" onClick={onDelete}>
            <Icon name="trash" size={14} /> {marker.user ? "Excluir" : "Tirar do mapa"}
          </button>
        </footer>
      </div>
    </div>
  );
}
