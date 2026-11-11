import { useId, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import type { VillageMap } from "../world/village";
import type { Pt } from "../world/geom";

/** Tons fixos de pergaminho: o mapa é um "documento" do mundo, igual nas duas paletas. */
export const MAP_COLORS = {
  ground: "#ece2c9",
  field: "#e1d3a9",
  fieldLine: "#c7b685",
  road: "#f7f1e1",
  roadEdge: "#8c7d61",
  water: "#9fc2cc",
  waterEdge: "#5e8793",
  house: ["#d8c6a0", "#cdb98f", "#dccdb0", "#c9b48c"],
  houseEdge: "#3a3125",
  tree: "#b3c191",
  treeEdge: "#6b7a4f",
};

const path = (pts: Pt[]) =>
  pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("");
const poly = (pts: Pt[]) => path(pts) + "Z";

export interface Viewer {
  x: number;
  y: number;
  yaw: number;
}

/**
 * O mini mapa: roda do mouse ou botões dão zoom, arrastar move. Com
 * `onPick`, um clique escolhe um ponto (para a vista de rua).
 */
export function PlaceMap({
  map,
  name,
  viewer,
  onPick,
}: {
  map: VillageMap;
  name: string;
  viewer?: Viewer | null;
  onPick?(p: Pt): void;
}) {
  const ids = useId();
  const svg = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, w: map.width, h: map.height });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(
    null,
  );

  const toMap = (clientX: number, clientY: number): Pt => {
    const r = svg.current!.getBoundingClientRect();
    return [
      view.x + ((clientX - r.left) / r.width) * view.w,
      view.y + ((clientY - r.top) / r.height) * view.h,
    ];
  };
  const zoom = (factor: number, at?: Pt) => {
    setView((v) => {
      const w = Math.max(map.width / 8, Math.min(map.width, v.w * factor));
      const h = (w / map.width) * map.height;
      const [ax, ay] = at ?? [v.x + v.w / 2, v.y + v.h / 2];
      const x = ax - ((ax - v.x) / v.w) * w;
      const y = ay - ((ay - v.y) / v.h) * h;
      return {
        w,
        h,
        x: Math.max(0, Math.min(map.width - w, x)),
        y: Math.max(0, Math.min(map.height - h, y)),
      };
    });
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, toMap(e.clientX, e.clientY));
  };
  const onDown = (e: PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
  };
  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const r = svg.current!.getBoundingClientRect();
    const dx = ((e.clientX - d.x) / r.width) * view.w;
    const dy = ((e.clientY - d.y) / r.height) * view.h;
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 4) d.moved = true;
    setView((v) => ({
      ...v,
      x: Math.max(0, Math.min(map.width - v.w, d.vx - dx)),
      y: Math.max(0, Math.min(map.height - v.h, d.vy - dy)),
    }));
  };
  const onUp = (e: PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved && onPick) onPick(toMap(e.clientX, e.clientY));
  };

  return (
    <div className={"place-map" + (onPick ? " picking" : "")}>
      <svg
        ref={svg}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        role="img"
        aria-label={`Mapa de ${name}`}
        onWheel={onWheel}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
      >
        <defs>
          {map.fields.map((f, i) => (
            <pattern
              key={i}
              id={`${ids}-f${i}`}
              width="4"
              height="4"
              patternUnits="userSpaceOnUse"
              patternTransform={`rotate(${((f.angle * 180) / Math.PI).toFixed(1)})`}
            >
              <rect width="4" height="4" fill={MAP_COLORS.field} />
              <line x1="0" y1="0" x2="0" y2="4" stroke={MAP_COLORS.fieldLine} strokeWidth="1" />
            </pattern>
          ))}
        </defs>
        <rect width={map.width} height={map.height} fill={MAP_COLORS.ground} />
        {map.fields.map((f, i) => (
          <path
            key={i}
            d={poly(f.corners)}
            fill={`url(#${ids}-f${i})`}
            stroke={MAP_COLORS.fieldLine}
            strokeWidth="0.8"
          />
        ))}
        {map.river && (
          <>
            <path
              d={path(map.river.points)}
              fill="none"
              stroke={MAP_COLORS.waterEdge}
              strokeWidth={map.river.width + 1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={path(map.river.points)}
              fill="none"
              stroke={MAP_COLORS.water}
              strokeWidth={map.river.width}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )}
        {map.roads.map((r, i) => (
          <path
            key={`e${i}`}
            d={path(r.points)}
            fill="none"
            stroke={MAP_COLORS.roadEdge}
            strokeWidth={r.width + 1.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {map.roads.map((r, i) => (
          <path
            key={`r${i}`}
            d={path(r.points)}
            fill="none"
            stroke={MAP_COLORS.road}
            strokeWidth={r.width}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {map.trees.map((t, i) => (
          <circle
            key={i}
            cx={t.x}
            cy={t.y}
            r={t.r}
            fill={MAP_COLORS.tree}
            stroke={MAP_COLORS.treeEdge}
            strokeWidth="0.7"
          />
        ))}
        {map.plaza && (
          <circle
            cx={map.plaza.x}
            cy={map.plaza.y}
            r={map.plaza.r}
            fill="#f3ead4"
            stroke={MAP_COLORS.roadEdge}
            strokeWidth="0.8"
          />
        )}
        {map.buildings.map((b, i) => (
          <path
            key={i}
            d={poly(b.corners)}
            fill={b.kind === "templo" ? "#a8916b" : MAP_COLORS.house[b.tone]}
            stroke={MAP_COLORS.houseEdge}
            strokeWidth={b.kind === "templo" ? 1.4 : 0.9}
            strokeLinejoin="round"
          />
        ))}
        {map.citadel && (
          <g>
            <path
              d={poly(map.citadel)}
              fill="#bda983"
              stroke={MAP_COLORS.houseEdge}
              strokeWidth="2.4"
              strokeLinejoin="round"
            />
            {map.citadel.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r="2.8" fill="#8c7a5a" stroke={MAP_COLORS.houseEdge} />
            ))}
          </g>
        )}
        {map.wall && (
          <g>
            <path
              d={poly(map.wall)}
              fill="none"
              stroke={MAP_COLORS.houseEdge}
              strokeWidth="2.6"
              strokeLinejoin="round"
            />
            {map.wall.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r="3" fill="#8c7a5a" stroke={MAP_COLORS.houseEdge} />
            ))}
          </g>
        )}
        {viewer && (
          <g
            transform={`translate(${viewer.x} ${viewer.y}) rotate(${(viewer.yaw * 180) / Math.PI})`}
          >
            <path d="M0 0L26 -14A30 30 0 0 1 26 14Z" fill="#c0392b" fillOpacity="0.25" />
            <circle r="3.2" fill="#c0392b" stroke="#fff" strokeWidth="1.2" />
          </g>
        )}
      </svg>
      <div className="place-map-zoom">
        <button type="button" aria-label="Aproximar" onClick={() => zoom(1 / 1.4)}>
          +
        </button>
        <button type="button" aria-label="Afastar" onClick={() => zoom(1.4)}>
          −
        </button>
      </div>
    </div>
  );
}
