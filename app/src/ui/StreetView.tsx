import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from "react";
import type { VillageMap } from "../world/village";
import { insidePoly, distToPolyline, type Pt } from "../world/geom";
import { MAP_COLORS, type Viewer } from "./PlaceMap";

/*
 * Vista de rua do mini mapa, desenhada do zero num canvas: cada casa vira uma
 * caixa com telhado de quatro águas, ruas e rio viram faixas no chão e árvores
 * viram copas. Projeção em perspectiva simples, recorte no plano próximo e
 * pintura de trás para frente (sem WebGL).
 */

const EYE = 1.7;
const NEAR = 0.25;
const FAR = 260;
const FOV = (72 * Math.PI) / 180;
const SKY_TOP = [126, 170, 214];
const SKY_LOW = [222, 232, 236];
const FOG = [214, 224, 226];

type V3 = [number, number, number]; // x, y (mapa), h (altura)

interface Face {
  pts: V3[];
  color: [number, number, number];
  ground?: boolean;
}

const hex = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];
const WALLS = ["#e6d8bb", "#d9c39b", "#efe5d0", "#d4bf98"].map(hex);
const ROOFS = ["#9b4a33", "#7d5a3e", "#a8573a", "#6f5b4b"].map(hex);
const GROUND = hex("#a9b27f");

/** Faixa (rua, rio) como quadriláteros no chão. */
function strip(points: Pt[], width: number, color: [number, number, number], lift: number): Face[] {
  const faces: Face[] = [];
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1]!;
    const [bx, by] = points[i]!;
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const nx = (-(by - ay) / len) * (width / 2);
    const ny = ((bx - ax) / len) * (width / 2);
    faces.push({
      pts: [
        [ax + nx, ay + ny, lift],
        [bx + nx, by + ny, lift],
        [bx - nx, by - ny, lift],
        [ax - nx, ay - ny, lift],
      ],
      color,
      ground: true,
    });
  }
  return faces;
}

/** Monta as faces do mundo 3D uma vez por mapa. */
export function buildScene(map: VillageMap) {
  const faces: Face[] = [];
  if (map.sea)
    faces.push({
      pts: map.sea.poly.map(([x, y]) => [x, y, 0.008] as V3),
      color: hex(MAP_COLORS.water),
      ground: true,
    });
  if (map.river)
    faces.push(...strip(map.river.points, map.river.width, hex(MAP_COLORS.water), 0.01));
  for (const f of map.fields)
    faces.push({
      pts: f.corners.map(([x, y]) => [x, y, 0.005] as V3),
      color: hex("#c9bb7e"),
      ground: true,
    });
  for (const r of map.roads) faces.push(...strip(r.points, r.width, hex("#cfc3a6"), 0.02));
  for (const b of map.buildings) {
    const h = 3.2 * b.floors + 0.4;
    const wall = WALLS[b.tone]!;
    const roof = ROOFS[b.tone]!;
    const c = b.corners;
    for (let i = 0; i < 4; i++) {
      const p = c[i]!;
      const q = c[(i + 1) % 4]!;
      faces.push({
        pts: [
          [p[0], p[1], 0],
          [q[0], q[1], 0],
          [q[0], q[1], h],
          [p[0], p[1], h],
        ],
        color: wall,
      });
    }
    // Telhado de quatro águas: cumeeira no meio do lado comprido.
    const [cx, cy] = b.center;
    const long0 = Math.hypot(c[1]![0] - c[0]![0], c[1]![1] - c[0]![1]);
    const long1 = Math.hypot(c[2]![0] - c[1]![0], c[2]![1] - c[1]![1]);
    const axis: Pt =
      long0 >= long1
        ? [(c[1]![0] - c[0]![0]) / long0, (c[1]![1] - c[0]![1]) / long0]
        : [(c[2]![0] - c[1]![0]) / long1, (c[2]![1] - c[1]![1]) / long1];
    const half = (Math.max(long0, long1) - Math.min(long0, long1)) / 2;
    const rh = h + Math.min(long0, long1) * 0.42;
    const r1: V3 = [cx - axis[0] * half, cy - axis[1] * half, rh];
    const r2: V3 = [cx + axis[0] * half, cy + axis[1] * half, rh];
    for (let i = 0; i < 4; i++) {
      const p = c[i]!;
      const q = c[(i + 1) % 4]!;
      const mid: Pt = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      // Cada água sobe para a ponta da cumeeira mais próxima (ou as duas, no lado comprido).
      const d1 = Math.hypot(mid[0] - r1[0], mid[1] - r1[1]);
      const d2 = Math.hypot(mid[0] - r2[0], mid[1] - r2[1]);
      const sideLong = Math.abs((q[0] - p[0]) * axis[0] + (q[1] - p[1]) * axis[1]) > 0.5;
      const top: V3[] = sideLong
        ? (p[0] - q[0]) * axis[0] + (p[1] - q[1]) * axis[1] < 0
          ? [r2, r1]
          : [r1, r2]
        : [d1 < d2 ? r1 : r2];
      faces.push({ pts: [[p[0], p[1], h], [q[0], q[1], h], ...top], color: roof });
    }
  }
  // Muralha e cidadela: paredes altas dos dois lados (sem telhado).
  const stone = hex("#a39a88");
  const wallFaces = (pts: Pt[], h: number) => {
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!;
      const q = pts[(i + 1) % pts.length]!;
      const quad: V3[] = [
        [p[0], p[1], 0],
        [q[0], q[1], 0],
        [q[0], q[1], h],
        [p[0], p[1], h],
      ];
      faces.push({ pts: quad, color: stone });
      faces.push({ pts: [...quad].reverse(), color: stone });
    }
  };
  if (map.wall) wallFaces(map.wall, 7);
  if (map.citadel) wallFaces(map.citadel, 11);
  if (map.plaza) {
    const { x, y, r } = map.plaza;
    faces.push({
      pts: Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2;
        return [x + Math.cos(a) * r, y + Math.sin(a) * r, 0.03] as V3;
      }),
      color: hex("#ddd2b6"),
      ground: true,
    });
  }
  return faces;
}

function mix(a: number[], b: number[], t: number): string {
  return `rgb(${a.map((v, i) => Math.round(v + (b[i]! - v) * t)).join(",")})`;
}

/** Pode ficar nesse ponto? (fora das casas e do rio) */
export function walkable(map: VillageMap, p: Pt): boolean {
  if (p[0] < 0 || p[1] < 0 || p[0] > map.width || p[1] > map.height) return false;
  if (map.sea && insidePoly(p, map.sea.poly)) return false;
  if (map.river && distToPolyline(p, map.river.points) < map.river.width / 2 - 0.5) {
    // Atravessa o rio só pela ponte (onde há rua).
    if (!map.roads.some((r) => distToPolyline(p, r.points) < r.width / 2)) return false;
  }
  // Muralha: só passa pelos portões (onde a rua cruza); a cidadela é fechada.
  const onRoad = map.roads.some((r) => distToPolyline(p, r.points) < r.width / 2);
  if (map.wall && !onRoad && distToPolyline(p, [...map.wall, map.wall[0]!]) < 1.2) return false;
  if (map.citadel && insidePoly(p, map.citadel)) return false;
  return !map.buildings.some(
    (b) => insidePoly(p, b.corners) || distToPolyline(p, [...b.corners, b.corners[0]!]) < 0.4,
  );
}

export function StreetView({
  map,
  scene,
  viewer,
  onMove,
}: {
  map: VillageMap;
  scene: Face[];
  viewer: Viewer;
  onMove(v: Viewer): void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const keys = useRef(new Set<string>());
  const state = useRef(viewer);
  useEffect(() => {
    state.current = viewer;
  }, [viewer]);
  const pitch = useRef(0);
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);

  // Desenha o quadro.
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth;
    const H = c.clientHeight;
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const f = W / 2 / Math.tan(FOV / 2);
    const horizon = H / 2 + pitch.current * H;
    const { x: cx, y: cy, yaw } = viewer;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);

    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, mix(SKY_TOP, SKY_TOP, 0));
    sky.addColorStop(1, mix(SKY_LOW, SKY_LOW, 0));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, Math.max(0, horizon));
    const ground = ctx.createLinearGradient(0, horizon, 0, H);
    // Chão no tom do bioma (areia no deserto, branco no gelo, verde no resto).
    const soil = map.ground ? (hex(map.ground).map((v) => v * 0.74) as number[]) : GROUND;
    ground.addColorStop(0, mix(soil, FOG, 0.75));
    ground.addColorStop(1, mix(soil, soil, 0));
    ctx.fillStyle = ground;
    ctx.fillRect(0, horizon, W, H - horizon);

    const cam = (p: V3): V3 => {
      const dx = p[0] - cx;
      const dy = p[1] - cy;
      return [-dx * sin + dy * cos, dx * cos + dy * sin, p[2] - EYE]; // direita, frente, cima
    };
    const drawn: { d: number; pts: [number, number][]; color: string; ground: boolean }[] = [];
    for (const face of scene) {
      // Descarta o que está longe ou atrás, rápido.
      const p0 = face.pts[0]!;
      const far = Math.hypot(p0[0] - cx, p0[1] - cy);
      if (far > FAR + 40) continue;
      const pts = face.pts.map(cam);
      if (pts.every((p) => p[1] < NEAR)) continue;
      // Recorte no plano próximo.
      const clipped: V3[] = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]!;
        const b = pts[(i + 1) % pts.length]!;
        if (a[1] >= NEAR) clipped.push(a);
        if (a[1] >= NEAR !== b[1] >= NEAR) {
          const t = (NEAR - a[1]) / (b[1] - a[1]);
          clipped.push([a[0] + (b[0] - a[0]) * t, NEAR, a[2] + (b[2] - a[2]) * t]);
        }
      }
      if (clipped.length < 3) continue;
      const screen = clipped.map(
        (p) => [W / 2 + (f * p[0]) / p[1], horizon - (f * p[2]) / p[1]] as [number, number],
      );
      // Face de costas (paredes e telhados): não desenha.
      if (!face.ground) {
        let area = 0;
        for (let i = 0; i < screen.length; i++) {
          const a = screen[i]!;
          const b = screen[(i + 1) % screen.length]!;
          area += a[0] * b[1] - b[0] * a[1];
        }
        if (area > 0) continue;
      }
      const depth = clipped.reduce((s, p) => s + p[1], 0) / clipped.length;
      // Luz: paredes viradas para o sol (sudoeste) ficam mais claras.
      let color = face.color as number[];
      if (!face.ground && face.pts.length >= 3) {
        const [a, b] = face.pts;
        const nx = b![1] - a![1];
        const ny = -(b![0] - a![0]);
        const len = Math.hypot(nx, ny) || 1;
        const light = 0.78 + 0.22 * ((nx / len) * -0.6 + (ny / len) * 0.8);
        color = color.map((v) => Math.min(255, v * light));
      }
      const fog = Math.min(1, Math.max(0, (depth - 40) / (FAR - 40)));
      drawn.push({
        d: depth,
        pts: screen,
        color: mix(color, FOG, fog * 0.85),
        ground: !!face.ground,
      });
    }
    // Árvores entram na mesma ordenação que as casas (copa redonda sobre um tronco).
    type Item = { d: number; ground: boolean; draw(): void };
    const items: Item[] = drawn.map((d) => ({
      d: d.d,
      ground: d.ground,
      draw() {
        ctx.beginPath();
        d.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.fillStyle = d.color;
        ctx.fill();
        if (!d.ground) {
          ctx.strokeStyle = "rgba(40,32,24,0.35)";
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      },
    }));
    for (const t of map.trees) {
      const p = cam([t.x, t.y, 0]);
      if (p[1] < NEAR + 0.5 || p[1] > FAR) continue;
      items.push({
        d: p[1],
        ground: false,
        draw() {
          const sx = W / 2 + (f * p[0]) / p[1];
          const base = horizon + (f * EYE) / p[1];
          const crownH = 3 + t.r * 1.2;
          const top = horizon - (f * (crownH - EYE)) / p[1];
          const rr = (f * t.r * 0.9) / p[1];
          const fog = Math.min(1, Math.max(0, (p[1] - 40) / (FAR - 40))) * 0.85;
          ctx.fillStyle = mix([92, 70, 48], FOG, fog);
          ctx.fillRect(sx - rr * 0.12, top, rr * 0.24, base - top);
          ctx.beginPath();
          ctx.arc(sx, top, rr, 0, Math.PI * 2);
          ctx.fillStyle = mix([110, 134, 84], FOG, fog);
          ctx.fill();
        },
      });
    }
    // Chão primeiro, depois o resto de trás para frente.
    items.sort((a, b) => (a.ground !== b.ground ? (a.ground ? -1 : 1) : b.d - a.d));
    for (const it of items) it.draw();
  }, [map, scene, viewer]);

  // Andar com as teclas enquanto estiverem apertadas.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const k = keys.current;
      if (k.size) {
        let { x, y, yaw } = state.current;
        const turn =
          (k.has("ArrowLeft") || k.has("a") ? -1 : 0) + (k.has("ArrowRight") || k.has("d") ? 1 : 0);
        const go =
          (k.has("ArrowUp") || k.has("w") ? 1 : 0) - (k.has("ArrowDown") || k.has("s") ? 1 : 0);
        yaw += turn * dt * 1.8;
        const speed = (k.has("Shift") ? 14 : 6) * dt * go;
        const nx = x + Math.cos(yaw) * speed;
        const ny = y + Math.sin(yaw) * speed;
        if (walkable(map, [nx, ny])) {
          x = nx;
          y = ny;
        } else if (walkable(map, [nx, y])) x = nx;
        else if (walkable(map, [x, ny])) y = ny;
        onMove({ x, y, yaw });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [map, onMove]);

  const keyName = (e: KeyboardEvent) => (e.key.length === 1 ? e.key.toLowerCase() : e.key);
  const MOVE_KEYS = [
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "w",
    "a",
    "s",
    "d",
    "Shift",
  ];
  const onDown = (e: PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, yaw: viewer.yaw, pitch: pitch.current };
  };
  const onDrag = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const w = canvas.current?.clientWidth ?? 600;
    pitch.current = Math.max(-0.35, Math.min(0.35, d.pitch + (e.clientY - d.y) / 600));
    onMove({ ...viewer, yaw: d.yaw - ((e.clientX - d.x) / w) * FOV });
  };

  return (
    <canvas
      ref={canvas}
      className="street-view"
      tabIndex={0}
      aria-label="Vista de rua. Setas ou W A S D para andar e virar; arraste para olhar em volta."
      onKeyDown={(e) => {
        const k = keyName(e);
        if (MOVE_KEYS.includes(k)) {
          e.preventDefault();
          keys.current.add(k);
        }
      }}
      onKeyUp={(e) => keys.current.delete(keyName(e))}
      onBlur={() => keys.current.clear()}
      onPointerDown={onDown}
      onPointerMove={onDrag}
      onPointerUp={() => (drag.current = null)}
    />
  );
}
