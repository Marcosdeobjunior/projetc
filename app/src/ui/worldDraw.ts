import {
  COLS,
  ROWS,
  type Burg,
  type Era,
  type Derived,
  type RouteType,
  type WorldMap,
} from "../world/worldgen";
import type { buildProvinceVectors, buildVectors } from "../world/worldRender";
import { MARKER_TYPES, type Society } from "../world/society";

/*
 * Desenho do mapa-múndi num canvas (tela ou exportação): fundo assado,
 * costa, rios, estradas, fronteiras, destaque do estado, nomes, cidades,
 * escala e rosa dos ventos.
 */

export interface View {
  s: number;
  x: number;
  y: number;
}

export interface BurgMeta {
  population: number;
  port: boolean;
}

export interface DrawOptions {
  map: WorldMap;
  derived: Derived;
  base: HTMLCanvasElement;
  vectors: ReturnType<typeof buildVectors>;
  view: View;
  size: { w: number; h: number };
  layers: Record<"rios" | "estradas" | "fronteiras" | "estados" | "cidades" | "rotulos", boolean> &
    Partial<Record<"provincias" | "marcadores", boolean>>;
  /** Províncias e marcadores (derivados do mapa). */
  society?: Society | null;
  provinceVectors?: ReturnType<typeof buildProvinceVectors> | null;
  capitals: Set<string>;
  meta: Map<string, BurgMeta>;
  selectedBurg?: string | null;
  selectedRoute?: string | null;
  /** Estrada gerada selecionada (pelo nome). */
  selectedRoad?: string | null;
  /** Rota sendo desenhada (pontos em células). */
  draft?: [number, number][] | null;
  /** Máscara do estado selecionado (uma célula por pixel). */
  highlight?: HTMLCanvasElement | null;
  /** Pincel sob o mouse (em células). */
  brush?: { x: number; y: number; r: number } | null;
  /** Escala e rosa dos ventos. */
  furniture?: boolean;
  /** Um planeta só (sem repetir na horizontal), recortado nas bordas. */
  single?: boolean;
  /** A história no mapa: lugares com cenas e caminhos dos personagens. */
  story?: StoryLayer | null;
}

export interface StoryLayer {
  /** Lugares com cenas: quantas, e se estão no capítulo/cena em foco. */
  pins: { x: number; y: number; count: number; active: boolean }[];
  journeys: { color: string; points: [number, number][] }[];
}

/** Quilômetros por célula (1° no equador de um planeta do tamanho da Terra). */
export const KM_PER_CELL = 111;

const SERIF = 'Georgia, "Times New Roman", serif';

/** Estilo de cada época: cores das linhas e rótulos, e a fonte. */
interface Theme {
  font: string;
  bg: string;
  coast: string;
  coastHalo: string;
  glow: string | null;
  river: string;
  roadCase: string;
  roadFill: string;
  road: string;
  trail: string;
  sea: string;
  province: string;
  border: string;
  halo: string;
  text: string;
  text2: string;
  state: string;
  lake: string;
  markerBg: string;
  markerStroke: string;
  cityDark: string;
  cityLight: string;
}
const SANS = '"Inter", "Segoe UI", system-ui, sans-serif';
const THEMES: Record<Era, Theme> = {
  fantasia: {
    font: SERIF,
    bg: "#1f3a55",
    coast: "#2b2a26",
    coastHalo: "rgba(255,255,255,0.35)",
    glow: null,
    river: "#4f86b8",
    roadCase: "#5a3a22",
    roadFill: "#f2c66b",
    road: "rgba(92,58,34,0.85)",
    trail: "rgba(92,58,34,0.75)",
    sea: "rgba(20,40,70,0.75)",
    province: "rgba(70,40,50,0.45)",
    border: "rgba(60,30,40,0.75)",
    halo: "rgba(255,250,235,0.85)",
    text: "#24201b",
    text2: "#4a2f1a",
    state: "#3b2a2a",
    lake: "#1f4c73",
    markerBg: "rgba(255,250,238,0.92)",
    markerStroke: "rgba(60,40,30,0.55)",
    cityDark: "#2b2a26",
    cityLight: "#fffaf0",
  },
  atual: {
    font: SANS,
    bg: "#7fb2d9",
    coast: "#4a7ea8",
    coastHalo: "rgba(255,255,255,0.5)",
    glow: null,
    river: "#4a90d0",
    roadCase: "#a83224",
    roadFill: "#f06a4a",
    road: "#e2a83a",
    trail: "rgba(110,110,110,0.8)",
    sea: "rgba(30,70,120,0.7)",
    province: "rgba(110,90,130,0.55)",
    border: "rgba(120,60,140,0.85)",
    halo: "rgba(255,255,255,0.9)",
    text: "#1d2329",
    text2: "#3a4450",
    state: "#5b4a6e",
    lake: "#1e5a8c",
    markerBg: "rgba(255,255,255,0.95)",
    markerStroke: "rgba(40,60,80,0.45)",
    cityDark: "#c62828",
    cityLight: "#ffffff",
  },
};
let T: Theme = THEMES.fantasia;

/** Raio do marcador da cidade pela população. */
function dotRadius(pop: number, capital: boolean) {
  const r = 2.2 + Math.min(2.6, Math.log10(Math.max(100, pop)) - 2) * 0.9;
  return capital ? r + 1 : r;
}

function anchor(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = "#1f3a55";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(0, -3.2, 1.2, 0, Math.PI * 2);
  ctx.moveTo(0, -2);
  ctx.lineTo(0, 3.2);
  ctx.moveTo(-2.4, -0.6);
  ctx.lineTo(2.4, -0.6);
  ctx.moveTo(-3, 1.2);
  ctx.quadraticCurveTo(-2.4, 3.6, 0, 3.4);
  ctx.quadraticCurveTo(2.4, 3.6, 3, 1.2);
  ctx.stroke();
  ctx.restore();
}

function scaleBar(ctx: CanvasRenderingContext2D, view: View, size: { w: number; h: number }) {
  // Um comprimento "redondo" que ocupe ~120 px.
  const kmPerPx = KM_PER_CELL / view.s;
  const target = kmPerPx * 120;
  const pow = 10 ** Math.floor(Math.log10(target));
  const nice = [1, 2, 5, 10].map((m) => m * pow).find((v) => v >= target * 0.6) ?? pow * 10;
  const len = nice / kmPerPx;
  ctx.save();
  ctx.font = `600 11px ${SERIF}`;
  const label = `${nice.toLocaleString("pt-BR")} km`;
  const half = ctx.measureText(label).width / 2;
  const x = size.w - len - 72 - half;
  const y = size.h - 70;
  ctx.fillStyle = "rgba(245,238,220,0.85)";
  ctx.fillRect(x - 12, y - 18, len + 24 + half, 40);
  ctx.strokeStyle = "#2b2a26";
  ctx.fillStyle = "#2b2a26";
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 4; i++) {
    const a = x + (len / 4) * i;
    ctx.fillStyle = i % 2 ? "#f5eedc" : "#2b2a26";
    ctx.fillRect(a, y, len / 4, 4);
  }
  ctx.strokeRect(x, y, len, 4);
  ctx.fillStyle = "#2b2a26";
  ctx.font = `600 11px ${SERIF}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText("0", x, y - 3);
  ctx.fillText(label, x + len, y - 3);
  ctx.font = `italic 10px ${SERIF}`;
  ctx.textAlign = "left";
  ctx.fillText("no equador", x, y + 15);
  ctx.restore();
}

function compass(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = 0.85;
  for (let i = 0; i < 8; i++) {
    const long = i % 2 === 0;
    const l = long ? r : r * 0.55;
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.moveTo(0, -l);
    ctx.lineTo(r * 0.14, 0);
    ctx.lineTo(0, r * 0.14);
    ctx.closePath();
    ctx.fillStyle = "#2b2a26";
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -l);
    ctx.lineTo(-r * 0.14, 0);
    ctx.lineTo(0, r * 0.14);
    ctx.closePath();
    ctx.fillStyle = "#f5eedc";
    ctx.fill();
    ctx.strokeStyle = "#2b2a26";
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(43,42,38,0.6)";
  ctx.stroke();
  ctx.fillStyle = "#2b2a26";
  ctx.font = `700 ${Math.round(r * 0.42)}px ${SERIF}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText("N", 0, -r - 2);
  ctx.restore();
}

export function drawWorld(ctx: CanvasRenderingContext2D, o: DrawOptions) {
  const { view, size } = o;
  T = THEMES[o.derived.era] ?? THEMES.fantasia;
  ctx.fillStyle = T.bg;
  ctx.fillRect(0, 0, size.w, size.h);
  const width = COLS * view.s;
  const placed: [number, number, number, number][] = [];
  if (o.single) {
    // Sobra da área (o planeta é 2:1): continua o mar polar em cima e embaixo e o
    // próprio planeta dos lados, sem faixas vazias.
    const top = view.y;
    const bottom = view.y + ROWS * view.s;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    // Além do polo, o mundo continua do outro lado (180° adiante) e de cabeça para
    // baixo: é isso que aparece acima do polo norte e abaixo do polo sul.
    const beyondPole = (edge: number, up: boolean) => {
      const h = ROWS * view.s;
      ctx.save();
      ctx.beginPath();
      if (up) ctx.rect(0, 0, size.w, edge);
      else ctx.rect(0, edge, size.w, size.h - edge);
      ctx.clip();
      ctx.translate(0, edge * 2);
      ctx.scale(1, -1);
      // espelhado em torno da borda; deslocado meia volta na longitude
      for (const k of [-1.5, -0.5, 0.5]) {
        const x = view.x + k * width;
        ctx.drawImage(o.base, x - 0.5, up ? edge : edge - h, width + 1, h);
        ctx.save();
        ctx.translate(x, up ? edge : edge - h);
        ctx.scale(view.s, view.s);
        ctx.strokeStyle = T.coast;
        ctx.lineWidth = 1.2 / view.s;
        ctx.stroke(o.vectors.coast);
        ctx.restore();
      }
      ctx.restore();
      // Linha discreta marcando o polo.
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(view.x, edge - 0.5, width, 1);
    };
    if (top > 0) beyondPole(top, true);
    if (bottom < size.h) beyondPole(bottom, false);
    if (view.x > 0 || view.x + width < size.w) {
      ctx.globalAlpha = 0.55;
      for (const k of [-1, 1]) ctx.drawImage(o.base, view.x + k * width, top, width, ROWS * view.s);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    // Um planeta só, recortado nas bordas; as cópias vizinhas só completam o que
    // atravessa a costura de 180° (rios, estradas e fronteiras que dão a volta).
    ctx.save();
    ctx.beginPath();
    ctx.rect(view.x, view.y, width, ROWS * view.s);
    ctx.clip();
    for (const k of [0, -1, 1])
      drawCopy(ctx, { ...o, view: { ...view, x: view.x + k * width } }, placed);
    ctx.restore();
  } else {
    // O planeta dá a volta: desenha as cópias à esquerda e à direita que aparecem na tela.
    const first = Math.floor(-view.x / width) - 1;
    for (let k = first; k <= first + 2 + Math.ceil(size.w / width); k++) {
      const x = view.x + k * width;
      if (x > size.w || x + width < 0) continue;
      drawCopy(ctx, { ...o, view: { ...view, x } }, placed);
    }
  }
}

function drawCopy(
  ctx: CanvasRenderingContext2D,
  o: DrawOptions,
  placed: [number, number, number, number][],
) {
  const { map, vectors, view, size, layers } = o;
  ctx.save();
  ctx.translate(view.x, view.y);
  ctx.scale(view.s, view.s);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(o.base, 0, 0, COLS, ROWS);
  const px = 1 / view.s; // um pixel de tela, em unidades do mapa
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = T.coastHalo;
  ctx.lineWidth = px * 4;
  ctx.stroke(vectors.coast);
  ctx.strokeStyle = T.coast;
  ctx.lineWidth = px * 1.2;
  if (T.glow) {
    ctx.shadowColor = T.glow;
    ctx.shadowBlur = 6;
  }
  ctx.stroke(vectors.coast);
  ctx.shadowBlur = 0;
  if (layers.rios) {
    ctx.strokeStyle = T.river;
    // O rio engrossa rio abaixo; ponta reta na foz (termina na margem, sem
    // avançar sobre o mar ou o lago) e emendas redondas entre os trechos.
    ctx.lineJoin = "round";
    const zoom = Math.min(2, Math.sqrt(view.s / 3));
    for (const r of vectors.rivers)
      for (const p of r.pieces) {
        ctx.lineCap = p.butt ? "butt" : "round";
        ctx.lineWidth = px * (0.45 + p.width * 0.75) * zoom;
        ctx.stroke(p.path);
      }
    ctx.lineCap = "round";
  }
  if (layers.estradas) {
    const routeStyle = (type: RouteType, scale = 1) => {
      // Rodovia: faixa clara com bordas; estrada: traço contínuo; trilha: pontilhado;
      // marítima: tracejado azul-escuro sobre o mar.
      ctx.setLineDash([]);
      if (type === "principal") {
        ctx.strokeStyle = T.roadCase;
        ctx.lineWidth = px * 3.6 * scale;
        return () => {
          ctx.strokeStyle = T.roadFill;
          ctx.lineWidth = px * 1.8 * scale;
        };
      }
      if (type === "estrada") {
        ctx.strokeStyle = T.road;
        ctx.lineWidth = px * 1.4 * scale;
      } else if (type === "trilha") {
        ctx.strokeStyle = T.trail;
        ctx.lineWidth = px * 1.1 * scale;
        ctx.setLineDash([px * 1.2, px * 3]);
      } else {
        ctx.strokeStyle = T.sea;
        ctx.lineWidth = px * 1.3 * scale;
        ctx.setLineDash([px * 6, px * 4]);
      }
      return null;
    };
    // As geradas ficam mais finas que as desenhadas (que têm nome e importância).
    for (const type of ["trilha", "estrada", "principal"] as const) {
      const inner = routeStyle(type, type === "principal" ? 0.7 : 0.9);
      ctx.stroke(vectors.roads[type]);
      if (inner) {
        inner();
        ctx.stroke(vectors.roads[type]);
      }
    }
    // Pontes: um tabuleiro claro com guarda-corpos escuros, atravessando o rio.
    if (view.s > 2.2) {
      for (const b of vectors.bridges) {
        const len = b.type === "principal" ? 1.5 : 1.1;
        const wid = (b.type === "principal" ? 3.6 : 2.4) * px;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.angle);
        ctx.fillStyle = "#efe6cf";
        ctx.fillRect(-len / 2, -wid / 2, len, wid);
        ctx.strokeStyle = "#3a2c1e";
        ctx.lineWidth = px * 1.1;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(-len / 2, -wid / 2);
        ctx.lineTo(len / 2, -wid / 2);
        ctx.moveTo(-len / 2, wid / 2);
        ctx.lineTo(len / 2, wid / 2);
        ctx.stroke();
        ctx.restore();
      }
    }
    // Estrada gerada selecionada: destaque por baixo.
    const selRoad = o.selectedRoad
      ? vectors.namedRoads.find((r) => r.name === o.selectedRoad)
      : null;
    if (selRoad) {
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(224,165,44,0.55)";
      ctx.lineWidth = px * 9;
      ctx.beginPath();
      selRoad.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
    // Rotas desenhadas, um pouco mais fortes que as geradas.
    const order = { maritima: 0, trilha: 1, estrada: 2, principal: 3 } as const;
    for (const r of [...vectors.routes].sort((a, b) => order[a.type] - order[b.type])) {
      const sel = o.selectedRoute === r.id;
      if (sel) {
        ctx.setLineDash([]);
        ctx.strokeStyle = "rgba(224,165,44,0.55)";
        ctx.lineWidth = px * 9;
        ctx.stroke(r.path);
      }
      const inner = routeStyle(r.type, 1.25);
      ctx.stroke(r.path);
      if (inner) {
        inner();
        ctx.lineWidth *= 1.25;
        ctx.stroke(r.path);
      }
    }
    ctx.setLineDash([]);
  }
  if (layers.provincias && o.provinceVectors) {
    // Províncias: linha fina pontilhada, mais discreta que a fronteira do estado.
    ctx.strokeStyle = T.province;
    ctx.lineWidth = px * 0.8;
    ctx.setLineDash([px * 1.5, px * 2.5]);
    ctx.stroke(o.provinceVectors.borders);
    ctx.setLineDash([]);
  }
  if (layers.fronteiras) {
    ctx.strokeStyle = T.border;
    ctx.lineWidth = px * 1.6;
    ctx.setLineDash([px * 5, px * 2, px * 1, px * 2]);
    ctx.stroke(vectors.borders);
    ctx.setLineDash([]);
  }
  if (o.highlight) {
    ctx.globalAlpha = 0.3;
    ctx.drawImage(o.highlight, 0, 0, COLS, ROWS);
    ctx.globalAlpha = 1;
  }
  if (o.draft && o.draft.length) {
    ctx.setLineDash([px * 4, px * 3]);
    ctx.strokeStyle = "#e0a52c";
    ctx.lineWidth = px * 2.2;
    ctx.beginPath();
    o.draft.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    ctx.setLineDash([]);
    for (const [x, y] of o.draft) {
      ctx.beginPath();
      ctx.arc(x, y, px * 4, 0, Math.PI * 2);
      ctx.fillStyle = "#e0a52c";
      ctx.fill();
    }
  }
  if (o.story?.journeys.length) {
    // Caminhos dos personagens: linha colorida com contorno claro, seguindo o
    // arco entre as paradas (curva suave, sem atravessar a costura de 180°).
    for (const j of o.story.journeys) {
      if (j.points.length < 2) continue;
      const path = new Path2D();
      const pts = j.points;
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1]!;
        const by = pts[i]![1];
        let bx = pts[i]![0];
        if (bx - ax > COLS / 2) bx -= COLS;
        if (ax - bx > COLS / 2) bx += COLS;
        const len = Math.hypot(bx - ax, by - ay) || 1;
        // Leve arco, para as idas e voltas não ficarem uma em cima da outra.
        const cx = (ax + bx) / 2 - ((by - ay) / len) * len * 0.12;
        const cy = (ay + by) / 2 + ((bx - ax) / len) * len * 0.12;
        path.moveTo(ax, ay);
        path.quadraticCurveTo(cx, cy, bx, by);
      }
      ctx.setLineDash([]);
      ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = px * 5;
      ctx.stroke(path);
      ctx.strokeStyle = j.color;
      ctx.lineWidth = px * 2.6;
      ctx.setLineDash([px * 7, px * 4]);
      ctx.stroke(path);
      ctx.setLineDash([]);
    }
  }
  if (o.brush) {
    ctx.beginPath();
    ctx.arc(o.brush.x, o.brush.y, o.brush.r, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = px * 1.5;
    ctx.setLineDash([px * 4, px * 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();

  // Texto e marcadores em pixels de tela (tamanho fixo ao dar zoom).
  const toS = (x: number, y: number) => [x * view.s + view.x, y * view.s + view.y] as const;
  // Retângulos já ocupados por texto (nomes de reinos primeiro, depois cidades).
  const free = (x: number, y: number, w: number, h: number) =>
    placed.every(([a, b, c, d]) => x > c || x + w < a || y > d || y + h < b);
  if (layers.rotulos && layers.estradas && view.s > 4) {
    // Nome das rodovias geradas, no meio delas, quando o mapa está bem aproximado.
    for (const r of vectors.namedRoads) {
      if (r.type !== "principal" || r.points.length < 12) continue;
      const m = Math.floor(r.points.length / 2);
      const a = r.points[m - 3]!;
      const b = r.points[m + 3]!;
      let angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
      if (angle > Math.PI / 2) angle -= Math.PI;
      if (angle < -Math.PI / 2) angle += Math.PI;
      const [sx, sy] = toS(r.points[m]![0], r.points[m]![1]);
      if (!free(sx - 40, sy - 10, 80, 12)) continue;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(angle);
      ctx.font = `italic 600 10.5px ${T.font}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.lineWidth = 3;
      ctx.strokeStyle = T.halo;
      ctx.strokeText(r.name, 0, -3);
      ctx.fillStyle = T.text2;
      ctx.fillText(r.name, 0, -3);
      ctx.restore();
    }
  }
  if (layers.rotulos && layers.estradas) {
    // Nome da rota no meio dela, seguindo a direção do traço.
    for (const r of vectors.routes) {
      if (r.length * view.s < 90) continue;
      const [sx, sy] = toS(r.mid.x, r.mid.y);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(r.mid.angle);
      ctx.font = `italic 600 11.5px ${T.font}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.lineWidth = 3;
      ctx.strokeStyle = T.halo;
      ctx.strokeText(r.name, 0, -4);
      ctx.fillStyle = r.type === "maritima" ? T.lake : T.text2;
      ctx.fillText(r.name, 0, -4);
      ctx.restore();
    }
  }
  if (layers.marcadores && o.society) {
    // Marcadores: ícone num disco claro, de tamanho fixo na tela.
    // De longe, ícones menores; os nomes só bem de perto e onde couberem.
    const r = view.s > 6 ? 9 : view.s > 4 ? 7.5 : 6;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${r * 1.25}px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
    for (const m of o.society.markers) {
      const [sx, sy] = toS(m.x, m.y);
      if (sx < -20 || sy < -20 || sx > size.w + 20 || sy > size.h + 20) continue;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = T.markerBg;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = T.markerStroke;
      ctx.stroke();
      ctx.fillStyle = "#2b2a26";
      ctx.fillText(MARKER_TYPES[m.type].icon, sx, sy + 0.5);
      placed.push([sx - r, sy - r, sx + r, sy + r]);
    }
    for (const m of o.society.markers) {
      if (!layers.rotulos || view.s < 9) break;
      const [sx, sy] = toS(m.x, m.y);
      if (sx < -20 || sy < -20 || sx > size.w + 20 || sy > size.h + 20) continue;
      ctx.font = `italic 500 10.5px ${T.font}`;
      const tw = ctx.measureText(m.name).width;
      if (!free(sx - tw / 2, sy + r + 2, tw, 12)) continue;
      placed.push([sx - tw / 2, sy + r + 2, sx + tw / 2, sy + r + 14]);
      {
        ctx.save();
        ctx.font = `italic 500 10.5px ${T.font}`;
        ctx.textBaseline = "top";
        ctx.lineWidth = 3;
        ctx.strokeStyle = T.halo;
        ctx.strokeText(m.name, sx, sy + r + 2);
        ctx.fillStyle = T.text2;
        ctx.fillText(m.name, sx, sy + r + 2);
        ctx.restore();
      }
    }
  }
  if (layers.rotulos && layers.provincias && o.provinceVectors && view.s > 4.5) {
    // Nome das províncias (pequeno, em itálico), onde couber.
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `italic 500 10.5px ${T.font}`;
    for (const l of o.provinceVectors.labels) {
      if (!l || Math.sqrt(l.area) * view.s < 60) continue;
      const [sx, sy] = toS(l.x, l.y);
      const tw = ctx.measureText(l.name).width;
      if (!free(sx - tw / 2, sy - 6, tw, 12)) continue;
      placed.push([sx - tw / 2, sy - 6, sx + tw / 2, sy + 6]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = T.halo;
      ctx.strokeText(l.name, sx, sy);
      ctx.fillStyle = T.text2;
      ctx.fillText(l.name, sx, sy);
    }
  }
  if (layers.rotulos && layers.rios) {
    // Nome dos lagos (os grandes primeiro; os pequenos só de perto).
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const l of [...vectors.lakeLabels].sort((a, b) => b.area - a.area)) {
      if (Math.sqrt(l.area) * view.s < 14) continue;
      const [sx, sy] = toS(l.x, l.y);
      ctx.font = `italic 600 11px ${T.font}`;
      const tw = ctx.measureText(l.name).width;
      if (!free(sx - tw / 2, sy - 7, tw, 14)) continue;
      placed.push([sx - tw / 2, sy - 7, sx + tw / 2, sy + 7]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = T.halo;
      ctx.strokeText(l.name, sx, sy);
      ctx.fillStyle = T.lake;
      ctx.fillText(l.name, sx, sy);
    }
  }
  if (layers.rotulos) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    map.states.forEach((s, k) => {
      const l = vectors.labels[k];
      if (!l) return;
      const [sx, sy] = toS(l.x, l.y);
      const fs = Math.max(11, Math.min(30, Math.sqrt(l.area) * view.s * 0.09));
      ctx.font = `600 ${fs}px ${T.font}`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = T.halo;
      const text = s.name.toUpperCase().split("").join(" ");
      const tw = ctx.measureText(text).width;
      placed.push([sx - tw / 2, sy - fs / 2, sx + tw / 2, sy + fs / 2]);
      ctx.strokeText(text, sx, sy);
      ctx.fillStyle = T.state;
      ctx.fillText(text, sx, sy);
    });
  }
  if (layers.cidades) {
    // Rótulos que não se sobrepõem: capitais primeiro, depois as maiores.
    const pop = (b: Burg) => o.meta.get(b.id)?.population ?? 0;
    const ordered = [...map.burgs].sort(
      (a, b) => Number(o.capitals.has(b.id)) - Number(o.capitals.has(a.id)) || pop(b) - pop(a),
    );
    for (const b of ordered) {
      const [sx, sy] = toS(b.x, b.y);
      if (sx < -50 || sy < -50 || sx > size.w + 50 || sy > size.h + 50) continue;
      const cap = o.capitals.has(b.id);
      const sel = o.selectedBurg === b.id;
      const meta = o.meta.get(b.id);
      const r = dotRadius(meta?.population ?? 500, cap);
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = cap ? T.cityDark : T.cityLight;
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = cap ? T.cityLight : T.cityDark;
      ctx.stroke();
      if (cap) {
        ctx.beginPath();
        ctx.arc(sx, sy, r + 2.6, 0, Math.PI * 2);
        ctx.strokeStyle = T.cityDark;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      if (meta?.port && view.s > 2.4) anchor(ctx, sx - r - 6, sy + 3);
      if (sel) {
        ctx.beginPath();
        ctx.arc(sx, sy, r + 7, 0, Math.PI * 2);
        ctx.strokeStyle = "#e0a52c";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
      const big = (meta?.population ?? 0) >= 5000;
      if (layers.rotulos && (cap || sel || view.s > 3.2 || (big && view.s > 2.2))) {
        ctx.font = `${cap ? "700 13px" : big ? "600 12px" : "500 11.5px"} ${T.font}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        const tw = ctx.measureText(b.name).width;
        // Tenta à direita, depois à esquerda e embaixo do marcador.
        const spots: [number, number][] = [
          [sx + r + 4, sy - 6],
          [sx - r - 6 - tw, sy - 6],
          [sx - tw / 2, sy + r + 9],
        ];
        const spot = spots.find(([x, y]) => free(x, y - 7, tw + 2, 14)) ?? (sel ? spots[0] : null);
        if (!spot) continue;
        const [lx, ly] = spot;
        placed.push([lx, ly - 7, lx + tw + 2, ly + 7]);
        ctx.lineWidth = 3;
        ctx.strokeStyle = T.halo;
        ctx.strokeText(b.name, lx, ly);
        ctx.fillStyle = T.text;
        ctx.fillText(b.name, lx, ly);
      }
    }
  }
  if (o.story) {
    // Lugares com cenas: um selo com o número de cenas, acima da cidade.
    for (const p of o.story.pins) {
      const [sx, sy] = toS(p.x, p.y);
      if (sx < -30 || sy < -30 || sx > size.w + 30 || sy > size.h + 30) continue;
      const bx = sx + 7;
      const by = sy - 14;
      const label = String(p.count);
      ctx.font = `700 10px ${T.font}`;
      const w = Math.max(16, ctx.measureText(label).width + 9);
      ctx.beginPath();
      ctx.roundRect(bx - w / 2, by - 8, w, 16, 8);
      ctx.fillStyle = p.active ? "#e0a52c" : "rgba(43,42,38,0.88)";
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = "#fffaf0";
      ctx.stroke();
      ctx.fillStyle = p.active ? "#2b2a26" : "#fffaf0";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, bx, by + 0.5);
    }
    // Paradas numeradas de cada caminho.
    for (const j of o.story.journeys)
      j.points.forEach(([x, y], i) => {
        const [sx, sy] = toS(x, y);
        if (sx < -30 || sy < -30 || sx > size.w + 30 || sy > size.h + 30) return;
        ctx.beginPath();
        ctx.arc(sx - 9, sy + 9, 7, 0, Math.PI * 2);
        ctx.fillStyle = j.color;
        ctx.fill();
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = "#fff";
        ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.font = `700 9px ${T.font}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(i + 1), sx - 9, sy + 9.5);
      });
  }
  if (o.furniture) {
    scaleBar(ctx, view, size);
    compass(ctx, size.w - 50, 100, 26);
  }
}

/** Máscara de um estado: um pixel por célula, para destacar a área dele. */
export function stateMask(derived: Derived, k: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = COLS;
  c.height = ROWS;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(COLS, ROWS);
  for (let i = 0; i < COLS * ROWS; i++) {
    if (derived.owner[i] !== k) continue;
    img.data[i * 4] = 255;
    img.data[i * 4 + 1] = 250;
    img.data[i * 4 + 2] = 235;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
