/*
 * A estrela do Elo: quatro pontas finas, cor sólida (a cor do tipo de texto
 * na paleta ativa), sem halo nem brilho. Simples de propósito: as estrelas
 * marcam os textos sem disputar a atenção com as ligações e os nomes.
 */

/** Caminho da estrela de quatro pontas em (x, y); `R` é o comprimento das pontas. */
export function starPath(ctx: CanvasRenderingContext2D, x: number, y: number, R: number) {
  // As laterais curvam para dentro (cintura em ~22% do raio): uma estrela
  // elegante, não um losango.
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
  /** Texto aberto ou sob o mouse: ganha um anel fino em volta. */
  lead?: boolean;
  /** Cor do anel (a cor do texto do tema). */
  ring?: string;
}

/** Desenha a estrela em (x, y) com raio `R`, na cor `color`. */
export function drawStar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  R: number,
  color: string,
  { lead = false, ring = color }: StarStyle = {},
) {
  ctx.fillStyle = color;
  starPath(ctx, x, y, R);
  ctx.fill();
  if (lead) {
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * 0.7;
    ctx.strokeStyle = ring;
    ctx.lineWidth = Math.max(1, R * 0.08);
    ctx.beginPath();
    ctx.arc(x, y, R * 0.78, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = a;
  }
}

/** O app está no tema claro (escolhido ou seguindo o sistema)? */
export function isLightTheme(): boolean {
  const t = document.documentElement.dataset.theme;
  if (t) return t === "light";
  return window.matchMedia("(prefers-color-scheme: light)").matches;
}
