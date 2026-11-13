import { useId, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import type { ArchStyle, Building, VillageMap } from "../world/village";
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

/** Cores dos prédios e ruas por época: pergaminho, ou cidade de concreto e asfalto. */
const ERA_COLORS = {
  atual: {
    road: "#f4f4f2",
    roadEdge: "#8d9096",
    house: ["#cfd2d6", "#bfc4ca", "#dcd9d2", "#c8bfb3"],
    houseEdge: "#4a4f57",
  },
} as const;
function colorsFor(era: VillageMap["era"]) {
  return era ? ERA_COLORS[era] : MAP_COLORS;
}

/** Telhados (claro, escuro) por estilo; o `tone` da casa escolhe o par. */
const ROOFS: Record<ArchStyle, [string, string][]> = {
  moderno: [
    ["#c8805f", "#a4604a"],
    ["#8e9399", "#6f747a"],
    ["#b56b52", "#8f523e"],
    ["#7b8188", "#5d6268"],
  ],
  temperado: [
    ["#c97a5c", "#a65a42"],
    ["#b9694f", "#93503b"],
    ["#c78f62", "#a06c45"],
    ["#9a7b66", "#7a5f4d"],
  ],
  deserto: [
    ["#ecd5a6", "#d4b680"],
    ["#e4c693", "#c9a774"],
    ["#f0dfbc", "#d9c197"],
    ["#ddb98a", "#c09a6b"],
  ],
  tropical: [
    ["#d9b86c", "#b8954c"],
    ["#cfae62", "#ad8b44"],
    ["#e0c27c", "#bf9d57"],
    ["#c4a05a", "#a1803f"],
  ],
  frio: [
    ["#7c6450", "#5d4a3b"],
    ["#6f5a48", "#52423a"],
    ["#8a7058", "#695442"],
    ["#5f5248", "#463c35"],
  ],
  neve: [
    ["#f7f9fa", "#d3dce2"],
    ["#f1f4f6", "#cbd5dc"],
    ["#fafbfc", "#dbe2e7"],
    ["#eef2f4", "#c5d0d8"],
  ],
  montanha: [
    ["#8f979e", "#6d757d"],
    ["#858c90", "#646b70"],
    ["#9aa1a6", "#787f85"],
    ["#7f878f", "#5f666e"],
  ],
  nomade: [
    ["#f2ebdb", "#d8cbb0"],
    ["#ece1c8", "#d0c09f"],
    ["#e9dcc4", "#cdbb98"],
    ["#d9c7a6", "#b9a47f"],
  ],
  caca: [
    ["#a88c5f", "#86704a"],
    ["#9c8257", "#7c6644"],
    ["#b39867", "#8f7850"],
    ["#93794f", "#735e3c"],
  ],
};

/** Árvores de cada lugar: copa redonda, pinheiro ou palmeira. */
const TREES: Record<ArchStyle, { kind: "copa" | "pinho" | "palma"; fill: string; edge: string }> = {
  moderno: { kind: "copa", fill: "#9fbb7f", edge: "#5d7446" },
  temperado: { kind: "copa", fill: "#a9bb84", edge: "#647448" },
  deserto: { kind: "palma", fill: "#9fb06e", edge: "#5f6d3b" },
  tropical: { kind: "palma", fill: "#8fb36f", edge: "#4f7040" },
  frio: { kind: "pinho", fill: "#7f9a76", edge: "#465c43" },
  neve: { kind: "pinho", fill: "#8aa08a", edge: "#4c604f" },
  montanha: { kind: "pinho", fill: "#8ea283", edge: "#52654a" },
  nomade: { kind: "copa", fill: "#b4bf8c", edge: "#6c774c" },
  caca: { kind: "copa", fill: "#97ad7a", edge: "#566a45" },
};

const FIELD_TONES = ["#e1d3a9", "#d5d69f", "#e6cf9a", "#cfc69a"];
const SHADOW = "rgba(58, 42, 25, 0.22)";
/** Lajes de concreto dos prédios modernos (claro, escuro). */
const CONCRETE: [string, string][] = [
  ["#d9dbdd", "#b4b8bc"],
  ["#cfd3d8", "#a9afb6"],
  ["#e2dfd8", "#bdb8ae"],
  ["#c5ccd3", "#9ea7b0"],
];

const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const shrink = (pts: Pt[], c: Pt, k: number) => pts.map((p) => lerp(c, p, k));
const len = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);
/** Luz do noroeste: a água do telhado virada para cima/esquerda fica clara. */
const lit = (face: Pt[], c: Pt) => {
  const m = face.reduce((s, p) => [s[0] + p[0] / face.length, s[1] + p[1] / face.length], [0, 0]);
  return m[0] - c[0] + (m[1] - c[1]) < 0;
};

function BuildingShape({ b, style }: { b: Building; style: ArchStyle }) {
  const flatModern = style === "moderno" && b.roof === "plano" && !b.kind;
  const pair =
    b.kind === "templo"
      ? TEMPLE[style]
      : flatModern
        ? CONCRETE[b.tone]!
        : (ROOFS[style][b.tone] ?? ROOFS[style][0]!);
  const [light, dark] = b.kind === "armazem" ? (["#a58d6a", "#846e50"] as const) : pair;
  const roof = b.roof ?? "duas-aguas";
  const c = b.center;
  const sw = b.kind ? 1.1 : 0.7;
  // Sombra cresce com a altura (com limite, para arranha-céus não cobrirem o bairro).
  const sh = Math.min(6, 0.45 * b.floors);
  const shadowT = `translate(${0.9 + sh} ${1.1 + sh * 1.2})`;
  // Deixa o lado 0→1 como o comprido.
  let k = b.corners;
  if (len(k[0]!, k[1]!) < len(k[1]!, k[2]!)) k = [k[1]!, k[2]!, k[3]!, k[0]!];
  const [c0, c1, c2, c3] = k as [Pt, Pt, Pt, Pt];
  const edge = MAP_COLORS.houseEdge;

  if (roof === "redondo" || roof === "tenda") {
    const r = Math.min(len(c0, c1), len(c1, c2)) / 2;
    const spokes = roof === "tenda" ? 6 : 8;
    return (
      <g>
        <circle cx={c[0]} cy={c[1]} r={r} fill={SHADOW} transform={shadowT} />
        <circle cx={c[0]} cy={c[1]} r={r} fill={light} stroke={edge} strokeWidth={sw} />
        <path
          d={`M${c[0]} ${c[1]}m0 ${-r}a${r} ${r} 0 0 1 0 ${2 * r}Z`}
          fill={dark}
          opacity="0.55"
          transform={`rotate(45 ${c[0]} ${c[1]})`}
        />
        {Array.from({ length: spokes }, (_, i) => {
          const a = (i / spokes) * Math.PI * 2;
          return (
            <line
              key={i}
              x1={c[0] + Math.cos(a) * r * 0.3}
              y1={c[1] + Math.sin(a) * r * 0.3}
              x2={c[0] + Math.cos(a) * r * 0.95}
              y2={c[1] + Math.sin(a) * r * 0.95}
              stroke={dark}
              strokeWidth="0.35"
            />
          );
        })}
        <circle
          cx={c[0]}
          cy={c[1]}
          r={r * (roof === "tenda" ? 0.3 : 0.18)}
          fill={roof === "tenda" ? "#fbf7ee" : dark}
          stroke={edge}
          strokeWidth="0.4"
        />
        {b.kind === "templo" && (
          <circle cx={c[0]} cy={c[1]} r={r * 0.62} fill="none" stroke={edge} strokeWidth="0.6" />
        )}
      </g>
    );
  }

  const base = poly(k);
  const shadow = <path d={base} fill={SHADOW} transform={shadowT} />;

  if (roof === "plano" || roof === "patio") {
    const inner = shrink(k, c, roof === "patio" ? 0.5 : 0.78);
    return (
      <g>
        {shadow}
        <path d={base} fill={dark} stroke={edge} strokeWidth={sw} strokeLinejoin="round" />
        {roof === "patio" ? (
          <>
            <path d={poly(shrink(k, c, 0.86))} fill={light} />
            <path d={poly(inner)} fill="#efe3c6" stroke={edge} strokeWidth="0.5" />
            <circle cx={c[0]} cy={c[1]} r={len(c0, c1) * 0.09} fill="#8fae7a" />
          </>
        ) : (
          <path d={poly(inner)} fill={light} />
        )}
        {flatModern && b.floors >= 4 && (
          <>
            <path
              d={poly(shrink(k, lerp(c, c0, 0.35), 0.22))}
              fill={dark}
              stroke={edge}
              strokeWidth="0.3"
            />
            <path
              d={poly(shrink(k, lerp(c, c2, 0.3), 0.15))}
              fill="#eef0f2"
              stroke={edge}
              strokeWidth="0.3"
            />
          </>
        )}
        {flatModern && b.floors >= 20 && (
          <circle
            cx={c[0]}
            cy={c[1]}
            r={Math.min(len(c0, c1), len(c1, c2)) * 0.18}
            fill="none"
            stroke="#f2c14e"
            strokeWidth="0.6"
          />
        )}
        {b.kind === "templo" && (
          <>
            <circle
              cx={c[0]}
              cy={c[1]}
              r={Math.min(len(c0, c1), len(c1, c2)) * 0.36}
              fill="#e9dcc0"
              stroke={edge}
              strokeWidth="0.8"
            />
            <circle
              cx={c[0] - 1}
              cy={c[1] - 1}
              r={Math.min(len(c0, c1), len(c1, c2)) * 0.16}
              fill="#fffaf0"
            />
          </>
        )}
      </g>
    );
  }

  // Duas ou quatro águas: cumeeira no meio, ao longo do lado comprido.
  const m03 = lerp(c0, c3, 0.5);
  const m12 = lerp(c1, c2, 0.5);
  const inset = roof === "quatro-aguas" ? len(c1, c2) / 2 / len(c0, c1) : 0;
  const r0 = lerp(m03, m12, Math.min(0.45, inset));
  const r1 = lerp(m12, m03, Math.min(0.45, inset));
  const sideA: Pt[] = [c0, c1, r1, r0];
  const sideB: Pt[] = [r0, r1, c2, c3];
  const aLit = lit(sideA, c);
  // Torre do templo numa das pontas.
  const tower: Pt[] | null =
    b.kind === "templo" ? [c0, lerp(c0, c1, 0.3), lerp(c3, c2, 0.3), c3] : null;
  return (
    <g>
      {shadow}
      <path d={poly(sideA)} fill={aLit ? light : dark} />
      <path d={poly(sideB)} fill={aLit ? dark : light} />
      {roof === "quatro-aguas" && (
        <>
          <path d={poly([c0, r0, c3])} fill={lit([c0, r0, c3], c) ? light : dark} opacity="0.85" />
          <path d={poly([c1, c2, r1])} fill={lit([c1, c2, r1], c) ? light : dark} opacity="0.85" />
          <path
            d={`M${c0[0]} ${c0[1]}L${r0[0]} ${r0[1]}L${c3[0]} ${c3[1]}M${c1[0]} ${c1[1]}L${r1[0]} ${r1[1]}L${c2[0]} ${c2[1]}`}
            fill="none"
            stroke={edge}
            strokeWidth="0.35"
            opacity="0.7"
          />
        </>
      )}
      <path
        d={`M${r0[0]} ${r0[1]}L${r1[0]} ${r1[1]}`}
        stroke={edge}
        strokeWidth="0.55"
        opacity="0.8"
      />
      <path d={base} fill="none" stroke={edge} strokeWidth={sw} strokeLinejoin="round" />
      {tower && (
        <>
          <path d={poly(tower)} fill="#8a7458" stroke={edge} strokeWidth="0.9" />
          <path
            d={`M${tower[0]![0]} ${tower[0]![1]}L${tower[2]![0]} ${tower[2]![1]}M${tower[1]![0]} ${tower[1]![1]}L${tower[3]![0]} ${tower[3]![1]}`}
            stroke={edge}
            strokeWidth="0.5"
          />
        </>
      )}
    </g>
  );
}

const TEMPLE: Record<ArchStyle, [string, string]> = {
  moderno: ["#a39486", "#7f7266"],
  temperado: ["#9c8a74", "#7a6a57"],
  deserto: ["#f2e6cc", "#d8c59f"],
  tropical: ["#c8a258", "#a3803c"],
  frio: ["#6a5644", "#4e3f33"],
  neve: ["#eef2f4", "#c3ced6"],
  montanha: ["#7d858c", "#5e656c"],
  nomade: ["#f4ead2", "#d6c49c"],
  caca: ["#9c7f50", "#7a6239"],
};

function TreeShape({ t, style }: { t: VillageMap["trees"][number]; style: ArchStyle }) {
  const look = TREES[style];
  const { x, y, r } = t;
  if (look.kind === "pinho") {
    const d = `M${x} ${y - r * 1.25}L${x + r} ${y + r * 0.85}L${x - r} ${y + r * 0.85}Z`;
    return (
      <g>
        <path d={d} fill={SHADOW} transform="translate(1 1.2)" />
        <path d={d} fill={look.fill} stroke={look.edge} strokeWidth="0.6" strokeLinejoin="round" />
      </g>
    );
  }
  if (look.kind === "palma") {
    const leaves = Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2 + (x % 1);
      return `M${x} ${y}Q${x + Math.cos(a + 0.4) * r * 0.8} ${y + Math.sin(a + 0.4) * r * 0.8} ${x + Math.cos(a) * r * 1.2} ${y + Math.sin(a) * r * 1.2}`;
    }).join("");
    return (
      <g>
        <circle cx={x + 1} cy={y + 1.2} r={r * 0.8} fill={SHADOW} />
        <path d={leaves} fill="none" stroke={look.edge} strokeWidth="1.6" strokeLinecap="round" />
        <path d={leaves} fill="none" stroke={look.fill} strokeWidth="0.9" strokeLinecap="round" />
        <circle cx={x} cy={y} r="0.8" fill="#7a5c3a" />
      </g>
    );
  }
  return (
    <g>
      <circle cx={x + 1} cy={y + 1.2} r={r} fill={SHADOW} />
      <circle cx={x} cy={y} r={r} fill={look.fill} stroke={look.edge} strokeWidth="0.6" />
      <circle cx={x - r * 0.3} cy={y - r * 0.3} r={r * 0.4} fill="#fff" opacity="0.18" />
    </g>
  );
}

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
  const C = colorsFor(map.era);
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
              <rect width="4" height="4" fill={FIELD_TONES[i % FIELD_TONES.length]} />
              <line x1="0" y1="0" x2="0" y2="4" stroke={MAP_COLORS.fieldLine} strokeWidth="1" />
            </pattern>
          ))}
        </defs>
        <rect width={map.width} height={map.height} fill={map.ground ?? MAP_COLORS.ground} />
        {map.fields.map((f, i) => (
          <path
            key={i}
            d={poly(f.corners)}
            fill={`url(#${ids}-f${i})`}
            stroke={MAP_COLORS.fieldLine}
            strokeWidth="0.8"
          />
        ))}
        {/* O rio se funde à água: a margem dele fica por baixo do mar (que a
            cobre), e a água do rio por cima da linha da costa, na mesma cor. */}
        {map.river && (
          <path
            d={path(map.river.points)}
            fill="none"
            stroke={MAP_COLORS.waterEdge}
            strokeWidth={map.river.width + 1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {map.sea && (
          <>
            <path d={poly(map.sea.poly)} fill={MAP_COLORS.water} />
            <path
              d={path(map.sea.coast)}
              fill="none"
              stroke={MAP_COLORS.waterEdge}
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </>
        )}
        {map.river && (
          <path
            d={path(map.river.points)}
            fill="none"
            stroke={MAP_COLORS.water}
            strokeWidth={map.river.width}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {map.docks.map((d, i) => (
          <g key={`d${i}`}>
            {d.boats.map((bt, j) => {
              const ca = Math.cos(bt.angle);
              const sa = Math.sin(bt.angle);
              const h = bt.len / 2;
              const w = bt.len * 0.2;
              const P = (u: number, v: number) =>
                `${(bt.x + ca * u - sa * v).toFixed(1)} ${(bt.y + sa * u + ca * v).toFixed(1)}`;
              return (
                <path
                  key={j}
                  d={`M${P(-h, 0)}Q${P(-h * 0.4, -w * 1.6)} ${P(h, 0)}Q${P(-h * 0.4, w * 1.6)} ${P(-h, 0)}Z`}
                  fill="#8b6a46"
                  stroke={MAP_COLORS.houseEdge}
                  strokeWidth="0.5"
                />
              );
            })}
            <path d={poly(d.pier)} fill={SHADOW} transform="translate(0.8 1)" />
            <path
              d={poly(d.pier)}
              fill="#b0916a"
              stroke={MAP_COLORS.houseEdge}
              strokeWidth="0.7"
              strokeLinejoin="round"
            />
          </g>
        ))}
        {map.roads.map((r, i) => (
          <path
            key={`e${i}`}
            d={path(r.points)}
            fill="none"
            stroke={C.roadEdge}
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
            stroke={C.road}
            strokeWidth={r.width}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {map.trees.map((t, i) => (
          <TreeShape key={i} t={t} style={map.style} />
        ))}
        {map.plaza && (
          <circle
            cx={map.plaza.x}
            cy={map.plaza.y}
            r={map.plaza.r}
            fill="#f3ead4"
            stroke={C.roadEdge}
            strokeWidth="0.8"
          />
        )}
        {map.plaza && (
          <circle
            cx={map.plaza.x}
            cy={map.plaza.y}
            r={map.plaza.r * 0.62}
            fill="none"
            stroke={MAP_COLORS.roadEdge}
            strokeWidth="0.35"
            strokeDasharray="1.2 1.4"
          />
        )}
        {map.plaza && (
          <circle
            cx={map.plaza.x}
            cy={map.plaza.y}
            r="2"
            fill={MAP_COLORS.water}
            stroke={MAP_COLORS.houseEdge}
            strokeWidth="0.6"
          />
        )}
        {map.buildings.map((b, i) => (
          <BuildingShape key={i} b={b} style={map.style} />
        ))}
        {map.citadel && (
          <g>
            <path
              d={poly(map.citadel)}
              fill="#bda983"
              stroke={C.houseEdge}
              strokeWidth="2.4"
              strokeLinejoin="round"
            />
            {map.citadel.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r="2.8" fill="#8c7a5a" stroke={C.houseEdge} />
            ))}
          </g>
        )}
        {map.wall && (
          <g>
            <path
              d={poly(map.wall)}
              fill="none"
              stroke={C.houseEdge}
              strokeWidth="2.6"
              strokeLinejoin="round"
            />
            {map.wall.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r="3" fill="#8c7a5a" stroke={C.houseEdge} />
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
