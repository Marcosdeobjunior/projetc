import { cellOf, COLS, ROWS, SEA, wrapCol, type WorldMap } from "./worldgen";

/*
 * Pincéis do modo "Editar terreno". Mexem só nas alturas; rios, lagos, biomas,
 * neve, fronteiras e estradas se refazem sozinhos a partir delas (deriveWorld).
 */

export const BRUSHES = [
  { value: "terra", icon: "🟫", label: "Terra", hint: "Cria terra no mar (planícies baixas)" },
  {
    value: "mar",
    icon: "🌊",
    label: "Mar",
    hint: "Afunda a terra: abre baías, estreitos e separa continentes",
  },
  { value: "montanha", icon: "⛰️", label: "Montanha", hint: "Ergue serras com picos irregulares" },
  {
    value: "neve",
    icon: "🏔️",
    label: "Neve",
    hint: "Ergue picos acima da linha da neve (com gelo no topo)",
  },
  {
    value: "lago",
    icon: "💧",
    label: "Lago",
    hint: "Cava uma bacia fechada: a água enche até transbordar",
  },
  { value: "elevar", icon: "⬆️", label: "Elevar", hint: "Sobe o terreno aos poucos" },
  { value: "rebaixar", icon: "⬇️", label: "Rebaixar", hint: "Desce o terreno aos poucos" },
  { value: "suavizar", icon: "〰️", label: "Suavizar", hint: "Arredonda o relevo e a costa" },
  {
    value: "aplainar",
    icon: "▭",
    label: "Aplainar",
    hint: "Nivela pela altura onde começou a pintar",
  },
] as const;
export type BrushKind = (typeof BRUSHES)[number]["value"];

/** Altura da linha da neve (perto do topo da escala de relevo). */
const SNOW = SEA + Math.round(127 * 0.86);

/** Ruído fixo por célula (para serras e bordas irregulares). */
const grain = (x: number, y: number) =>
  0.5 +
  0.25 * Math.sin(x * 1.7 + y * 2.3) * Math.cos(x * 0.9 - y * 1.3) +
  0.25 * Math.sin(x * 4.1 - y * 3.7);

/**
 * Uma pincelada em (x, y) com raio `r` (células) e força 1–3. `level` é a altura
 * de referência do "Aplainar" (onde o traço começou).
 */
export function paintTerrain(
  h: Uint8Array,
  x: number,
  y: number,
  r: number,
  kind: BrushKind,
  strength = 2,
  level = SEA + 8,
): Uint8Array {
  const out = new Uint8Array(h);
  const k = strength / 2;
  for (let cy = Math.max(0, Math.floor(y - r)); cy <= Math.min(ROWS - 1, Math.ceil(y + r)); cy++)
    for (let cx = Math.floor(x - r); cx <= Math.ceil(x + r); cx++) {
      const d = Math.hypot(cx + 0.5 - x, cy + 0.5 - y) / r;
      if (d >= 1) continue;
      const f = (1 - d * d) * (1 - d * d);
      const i = cy * COLS + wrapCol(cx);
      const v = h[i]!;
      const g = grain(cx, cy);
      let n = v;
      switch (kind) {
        case "terra":
          // Sobe até virar planície baixa (borda recortada pelo ruído).
          if (v < SEA + 6) n = v + (SEA + 6 - v) * Math.min(1, 0.45 * f * k * (0.6 + g));
          break;
        case "mar":
          if (v > SEA - 26) n = v - (v - (SEA - 26)) * Math.min(1, 0.45 * f * k * (0.6 + g));
          break;
        case "montanha": {
          const base = v < SEA ? SEA + 4 : v;
          n = Math.min(SNOW - 6 + 20 * g, base + 9 * f * k * (0.4 + g));
          break;
        }
        case "neve":
          if (v >= SEA) n = v + (Math.min(254, SNOW + 14) - v) * Math.min(1, 0.3 * f * k);
          break;
        case "lago":
          // Fundo da bacia baixo (mas ainda terra) e borda um pouco mais alta,
          // para a água ficar presa e formar um lago.
          if (v >= SEA) {
            if (d < 0.72) n = Math.max(SEA, v - 10 * f * k);
            else n = Math.min(255, v + 3 * k);
          }
          break;
        case "elevar":
          n = v + 6 * f * k + (v < SEA ? 4 * f * k : 0);
          break;
        case "rebaixar":
          n = v - 6 * f * k - (v >= SEA ? 4 * f * k : 0);
          break;
        case "aplainar":
          n = v + (level - v) * Math.min(1, 0.4 * f * k);
          break;
        case "suavizar": {
          let sum = 0;
          let c = 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const ny = cy + dy;
              if (ny < 0 || ny >= ROWS) continue;
              sum += h[ny * COLS + wrapCol(cx + dx)]!;
              c++;
            }
          n = v + (sum / c - v) * 0.5 * f * k;
          break;
        }
      }
      out[i] = Math.max(0, Math.min(255, Math.round(n)));
    }
  return out;
}

/**
 * Depois de mexer no relevo: cidades e centros de povos que ficaram no mar vão
 * para a terra mais perto (até 12 células); sem terra por perto, a cidade sai.
 */
export function settleOnLand(map: WorldMap, heights: Uint8Array): WorldMap {
  const nearestLand = (x: number, y: number): [number, number] | null => {
    const c = cellOf(x, y);
    if (heights[c]! >= SEA) return [x, y];
    const cx = c % COLS;
    const cy = Math.floor(c / COLS);
    for (let r = 1; r <= 12; r++) {
      let best: [number, number] | null = null;
      let bd = Infinity;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const ny = cy + dy;
          if (ny < 1 || ny >= ROWS - 1) continue;
          const j = ny * COLS + wrapCol(cx + dx);
          if (heights[j]! < SEA) continue;
          const dist = dx * dx + dy * dy;
          if (dist < bd) {
            bd = dist;
            best = [wrapCol(cx + dx) + 0.5, ny + 0.5];
          }
        }
      if (best) return best;
    }
    return null;
  };
  const burgs = map.burgs.flatMap((b) => {
    const p = nearestLand(b.x, b.y);
    return p ? [{ ...b, x: p[0], y: p[1] }] : [];
  });
  const kept = new Set(burgs.map((b) => b.id));
  return {
    ...map,
    heights,
    burgs,
    // Estado cuja capital sumiu (afundou longe da terra) sai junto.
    states: map.states.filter((s) => kept.has(s.capital)),
    cultures: map.cultures?.map((c) => {
      const p = nearestLand(c.x, c.y);
      return p ? { ...c, x: p[0], y: p[1] } : c;
    }),
  };
}
