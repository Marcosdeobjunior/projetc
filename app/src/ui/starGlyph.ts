/*
 * A estrela do Elo: quatro pontas finas, corpo em degradê azul → roxo e um halo de luz que passa
 * devagar por azul, branco e roxo. Todas as estrelas têm o mesmo desenho; cada
 * uma tem o próprio ritmo, tirado do id do texto.
 */

type RGB = [number, number, number];

/** Ciclo do brilho: azul → branco → roxo → azul. */
const CYCLE: RGB[] = [
  [79, 141, 255],
  [220, 230, 255],
  [155, 123, 255],
];

export function cycleColor(p: number): RGB {
  const f = (((p % 1) + 1) % 1) * CYCLE.length;
  const i = Math.floor(f);
  const t = f - i;
  const e = t * t * (3 - 2 * t);
  const a = CYCLE[i]!;
  const b = CYCLE[(i + 1) % CYCLE.length]!;
  return [0, 1, 2].map((k) => Math.round(a[k]! + (b[k]! - a[k]!) * e)) as RGB;
}

export interface StarClock {
  /** Duração de uma volta no ciclo de cores, em ms (4 a 9 s). */
  period: number;
  /** Ponto do ciclo em que a estrela começa (0–1). */
  phase: number;
}

/** O mesmo texto sempre ganha o mesmo ritmo. */
export function clockFor(key: string): StarClock {
  let h = 2166136261;
  for (const ch of key) h = Math.imul(h ^ ch.codePointAt(0)!, 16777619) >>> 0;
  return { period: 4000 + (h % 5000), phase: ((h >>> 12) % 1000) / 1000 };
}

/** Posição no ciclo num instante (ms). Com `still`, fica parada na fase inicial. */
export function cycleAt(clock: StarClock, now: number, still: boolean): number {
  return still ? clock.phase : now / clock.period + clock.phase;
}

export function starPath(ctx: CanvasRenderingContext2D, x: number, y: number, R: number) {
  // Quatro pontas, com as laterais curvando para dentro (cintura em ~22% do raio).
  const w = R * 0.22;
  ctx.beginPath();
  ctx.moveTo(x, y - R);
  ctx.quadraticCurveTo(x + w, y - w, x + R, y);
  ctx.quadraticCurveTo(x + w, y + w, x, y + R);
  ctx.quadraticCurveTo(x - w, y + w, x - R, y);
  ctx.quadraticCurveTo(x - w, y - w, x, y - R);
  ctx.closePath();
}

export interface StarStyle {
  /** Tema claro: halo mais contido e corpo mais escuro, para contrastar com o papel. */
  light: boolean;
  /** Intensidade extra do brilho (texto aberto ou sob o mouse). */
  boost?: number;
  /** Usa sombra borrada além do halo. Fica de fora em grafos grandes, por desempenho. */
  blur?: boolean;
}

/** Desenha a estrela em (x, y) com raio `R` (comprimento dos raios longos) no ponto `p` do ciclo. */
export function drawStar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  R: number,
  p: number,
  { light, boost = 1, blur = true }: StarStyle,
) {
  const [r, g, b] = cycleColor(p);
  const pulse = 0.8 + 0.2 * Math.sin(p * Math.PI * 6);
  const glow = boost * pulse;
  const alpha = ctx.globalAlpha;

  // Halo: luz difusa na cor do momento.
  const haloR = R * 1.3;
  const halo = ctx.createRadialGradient(x, y, 0, x, y, haloR);
  const a = Math.min(1, (light ? 0.2 : 0.42) * glow);
  halo.addColorStop(0, `rgba(${r},${g},${b},${a})`);
  halo.addColorStop(0.3, `rgba(${r},${g},${b},${a * 0.4})`);
  halo.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.save();
  if (!light) ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, haloR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Corpo: sempre o mesmo degradê.
  const body = ctx.createRadialGradient(x, y, 0, x, y, R);
  if (light) {
    body.addColorStop(0, "#c7d6ff");
    body.addColorStop(0.16, "#3f6fe0");
    body.addColorStop(0.6, "#7a5ae6");
    body.addColorStop(1, "#7a5ae6");
  } else {
    body.addColorStop(0, "#cfe0ff");
    body.addColorStop(0.12, "#7fb0ff");
    body.addColorStop(0.3, "#4f8dff");
    body.addColorStop(0.68, "#9b7bff");
    body.addColorStop(1, "#9b7bff");
  }
  ctx.save();
  ctx.fillStyle = body;
  if (blur) {
    ctx.shadowColor = `rgba(${r},${g},${b},${(light ? 0.45 : 0.85) * alpha})`;
    ctx.shadowBlur = R * 0.3 * glow;
  }
  starPath(ctx, x, y, R);
  ctx.fill();
  ctx.restore();

  // Clarão central pequeno, só para dar a sensação de luz.
  if (!light) {
    const cr = R * 0.09;
    const core = ctx.createRadialGradient(x, y, 0, x, y, cr);
    core.addColorStop(0, `rgba(255,255,255,${0.45 * pulse})`);
    core.addColorStop(1, "rgba(255,255,255,0)");
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(x, y, cr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** O app está no tema claro (escolhido ou seguindo o sistema)? */
export function isLightTheme(): boolean {
  const t = document.documentElement.dataset.theme;
  if (t) return t === "light";
  return window.matchMedia("(prefers-color-scheme: light)").matches;
}
