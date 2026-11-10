import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import type { Graph, GraphEdge, GraphNode } from "../links/links";

/*
 * Desenho interativo do grafo num <canvas>, usado pelo grafo completo e pelo
 * minimapa: arrastar pontos, mover a visão, zoom com a roda, destacar os
 * vizinhos ao passar o mouse e clicar para abrir. Visual de grafo de notas:
 * cada texto é um ponto liso (maior quanto mais conexões), as ligações são
 * linhas finas e neutras, e o ponto sob o mouse acende na cor de destaque junto
 * com as ligações dele, enquanto o resto esmaece.
 */

type SimNode = GraphNode & SimulationNodeDatum;

/** Zoom a partir do qual os nomes aparecem, e a faixa em que surgem aos poucos. */
export const LABEL_K = 1.05;
const LABEL_FADE = 0.25;
type SimLink = SimulationLinkDatum<SimNode> & { kind: GraphEdge["kind"] };

export interface View {
  x: number;
  y: number;
  k: number;
}

export interface GraphCanvasOptions {
  /** Texto aberto: ganha um contorno (e, no minimapa, fica maior). */
  activeId: string | null;
  onOpen(id: string): void;
  /** Posições e enquadramento guardados entre montagens, para o grafo não "pular". */
  positions: Map<string, { x: number; y: number }>;
  view: View;
  /** Versão pequena (minimapa): nomes sempre visíveis e layout no formato da caixa. */
  compact?: boolean;
}

export function mountGraph(
  canvas: HTMLCanvasElement,
  box: HTMLElement,
  graph: Graph,
  opts: GraphCanvasOptions,
) {
  const { activeId, onOpen, positions, compact = false } = opts;
  const ctx = canvas.getContext("2d")!;
  const nodes: SimNode[] = graph.nodes.map((n) => ({ ...n, ...positions.get(n.id) }));
  const links: SimLink[] = graph.edges.map((e) => ({
    source: e.source,
    target: e.target,
    kind: e.kind,
  }));
  const neighbors = new Map<string, Set<string>>();
  for (const e of graph.edges) {
    if (!neighbors.has(e.source)) neighbors.set(e.source, new Set());
    if (!neighbors.has(e.target)) neighbors.set(e.target, new Set());
    neighbors.get(e.source)!.add(e.target);
    neighbors.get(e.target)!.add(e.source);
  }

  const radius = (n: GraphNode) =>
    compact && n.id === activeId
      ? 9
      : compact
        ? 5 + Math.min(n.degree, 9) * 0.5
        : 4 + Math.sqrt(n.degree) * 1.8;

  let hover: SimNode | null = null;
  /** Depois que a pessoa move ou dá zoom, o grafo não se reenquadra sozinho. */
  let touched = false;
  let width = 0;
  let height = 0;
  let frame = 0;

  const sim: Simulation<SimNode, SimLink> = forceSimulation(nodes)
    .force(
      "link",
      forceLink<SimNode, SimLink>(links)
        .id((d) => d.id)
        // Mais distância e mais repulsão: os pontos se espalham pela área em vez
        // de se amontoar no meio (os tamanhos dos pontos não mudam).
        .distance(compact ? 64 : 118)
        .strength(compact ? 0.5 : 0.35),
    )
    .force(
      "charge",
      forceManyBody()
        .strength(compact ? -260 : -560)
        .distanceMax(900),
    )
    .force("center", forceCenter(0, 0))
    .force("x", forceX(0).strength(0.05))
    .force("y", forceY(0).strength(0.05))
    .force(
      "collide",
      forceCollide<SimNode>((d) => radius(d) + (compact ? 14 : 30)),
    )
    .stop();

  /** No minimapa, espalha os pontos no formato da caixa (faixa larga ou alta). */
  const shapeForces = () => {
    if (!compact || !width || !height) return;
    const aspect = width / height;
    (sim.force("x") as ReturnType<typeof forceX>).strength(aspect < 0.7 ? 0.3 : 0.05);
    (sim.force("y") as ReturnType<typeof forceY>).strength(aspect > 1.5 ? 0.3 : 0.05);
  };

  const fresh = nodes.some((n) => n.x === undefined);
  const css = (name: string) => getComputedStyle(box).getPropertyValue(name).trim();
  // Cores da paleta ativa, resolvidas pelo navegador (as variáveis podem usar
  // color-mix(), que o canvas não entende em todo WebView).
  const probe = document.createElement("span");
  probe.style.display = "none";
  box.append(probe);
  const color = (name: string) => {
    probe.style.color = `var(${name})`;
    return getComputedStyle(probe).color;
  };

  const draw = () => {
    frame = 0;
    const dpr = window.devicePixelRatio || 1;
    const { x, y, k } = opts.view;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.translate(x, y);
    ctx.scale(k, k);

    const focus = hover ? (neighbors.get(hover.id) ?? new Set<string>()) : null;
    const lit = (id: string) => !focus || id === hover!.id || focus.has(id);

    // Linhas neutras: o tom dos textos secundários, bem transparente.
    const edge = color("--muted");
    const edgeHi = color("--accent");
    // As linhas são desenhadas em poucos traços (um por tipo), não uma a uma:
    // com milhares de ligações isso é o que mais pesa em cada quadro.
    const strokeAll = (
      list: SimLink[],
      color: string,
      alpha: number,
      width: number,
      dash: number[],
    ) => {
      if (!list.length) return;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(dash);
      ctx.beginPath();
      for (const l of list) {
        const s = l.source as SimNode;
        const t = l.target as SimNode;
        ctx.moveTo(s.x!, s.y!);
        ctx.lineTo(t.x!, t.y!);
      }
      ctx.stroke();
    };
    const touches = (l: SimLink) =>
      !!hover && ((l.source as SimNode).id === hover.id || (l.target as SimNode).id === hover.id);
    const dash = [4 / k, 3 / k];
    const thin = 1 / k;
    const rest = links.filter((l) => !touches(l));
    strokeAll(
      rest.filter((l) => l.kind === "link"),
      edge,
      focus ? 0.08 : 0.42,
      thin,
      [],
    );
    strokeAll(
      rest.filter((l) => l.kind === "mention"),
      edge,
      focus ? 0.06 : 0.28,
      thin,
      dash,
    );
    if (hover) {
      const on = links.filter(touches);
      const wide = 1.6 / k;
      strokeAll(
        on.filter((l) => l.kind === "link"),
        edgeHi,
        0.9,
        wide,
        [],
      );
      strokeAll(
        on.filter((l) => l.kind === "mention"),
        edgeHi,
        0.5,
        wide,
        dash,
      );
    }
    ctx.setLineDash([]);

    const fg = color("--fg");
    const muted = color("--muted");
    const accent = color("--accent");
    const bg = color("--bg");
    for (const n of nodes) {
      const r = radius(n);
      const on = lit(n.id);
      ctx.globalAlpha = on ? 1 : 0.2;
      // Ponto liso: cinza neutro; o texto aberto e o ponto sob o mouse na cor de destaque.
      ctx.fillStyle = n === hover || n.id === activeId ? accent : on && focus ? fg : muted;
      ctx.beginPath();
      ctx.arc(n.x!, n.y!, r, 0, Math.PI * 2);
      ctx.fill();
      if (n.id === activeId && n !== hover) {
        // Anel fino em volta do texto aberto, separado do ponto pela cor de fundo.
        ctx.lineWidth = 1.5 / k;
        ctx.strokeStyle = bg;
        ctx.stroke();
        ctx.strokeStyle = accent;
        ctx.beginPath();
        ctx.arc(n.x!, n.y!, r + 2.5 / k, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Nomes: só a partir de um zoom (LABEL_K), surgindo aos poucos, para o
    // Elo afastado mostrar a forma das ligações sem um mar de texto. O ponto
    // sob o mouse, os vizinhos dele e o texto aberto mostram o nome sempre.
    // Nomes que encostariam em outro já desenhado ficam de fora.
    const zoomAlpha = compact ? 1 : Math.min(1, Math.max(0, (k - LABEL_K) / LABEL_FADE));
    const size = compact ? 11 : 11.5;
    const fontPx = size / Math.max(0.75, k);
    ctx.font = `500 ${fontPx}px ${css("--font-ui")}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const must = (n: SimNode) => n.id === activeId || n === hover || (!!focus && focus.has(n.id));
    const order = [...nodes].sort(
      (a, b) => Number(must(b)) - Number(must(a)) || b.degree - a.degree,
    );
    const taken: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const pad = 3 / k;
    for (const n of order) {
      const forced = must(n);
      const alpha = forced ? 1 : zoomAlpha;
      if (alpha <= 0.01) continue;
      const R = radius(n);
      const w = ctx.measureText(n.title).width;
      const rect = {
        x0: n.x! - w / 2 - pad,
        y0: n.y! + R + 2 / k - pad,
        x1: n.x! + w / 2 + pad,
        y1: n.y! + R + 2 / k + fontPx * 1.2 + pad,
      };
      if (taken.some((t) => rect.x0 < t.x1 && rect.x1 > t.x0 && rect.y0 < t.y1 && rect.y1 > t.y0))
        continue;
      taken.push(rect);
      ctx.globalAlpha = (lit(n.id) ? 0.95 : 0.15) * alpha;
      ctx.fillStyle = forced ? fg : muted;
      ctx.fillText(n.title, n.x!, n.y! + R + 2 / k);
    }
    ctx.globalAlpha = 1;
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(draw);
  };

  sim.on("tick", () => {
    for (const n of nodes) positions.set(n.id, { x: n.x!, y: n.y! });
    schedule();
  });

  const fit = () => {
    if (!nodes.length || !width) return;
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (const n of nodes) {
      x0 = Math.min(x0, n.x!);
      y0 = Math.min(y0, n.y!);
      x1 = Math.max(x1, n.x!);
      y1 = Math.max(y1, n.y!);
    }
    // Margem para os nomes embaixo de cada ponto.
    const [padX, padY, max] = compact ? [140, 60, 1.4] : [120, 120, 1.5];
    const k = Math.min(
      max,
      Math.max(0.3, Math.min(width / (x1 - x0 + padX), height / (y1 - y0 + padY))),
    );
    Object.assign(opts.view, {
      k,
      x: width / 2 - ((x0 + x1) / 2) * k,
      y: height / 2 - ((y0 + y1) / 2) * k,
    });
    schedule();
  };
  // Quando a simulação assenta, enquadra de novo (se a pessoa não mexeu).
  sim.on("end", () => {
    if (!touched) fit();
  });

  const resize = () => {
    const r = box.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = window.devicePixelRatio || 1;
    const first = width === 0;
    const reshaped = compact && !first && Math.abs(r.width / r.height - width / height) > 0.3;
    width = r.width;
    height = r.height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    shapeForces();
    if (first) {
      if (fresh) sim.tick(compact ? 220 : 150);
      if (fresh || compact || opts.view.k === 1) fit();
      sim.alpha(fresh ? 0.3 : 0.15).restart();
    } else if (reshaped) {
      // Minimapa mudou de canto para faixa (ou o contrário): reorganiza.
      touched = false;
      sim.alpha(0.6).restart();
    } else if (!touched) fit();
    schedule();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(box);
  resize();

  const toGraph = (e: PointerEvent | WheelEvent) => {
    const r = canvas.getBoundingClientRect();
    const { x, y, k } = opts.view;
    return { gx: (e.clientX - r.left - x) / k, gy: (e.clientY - r.top - y) / k };
  };
  const nodeAt = (gx: number, gy: number) => {
    let best: SimNode | null = null;
    let bestD = Infinity;
    for (const n of nodes) {
      const d = Math.hypot(n.x! - gx, n.y! - gy);
      if (d < radius(n) + 6 / opts.view.k && d < bestD) {
        best = n;
        bestD = d;
      }
    }
    return best;
  };

  let drag: {
    node: SimNode | null;
    sx: number;
    sy: number;
    vx: number;
    vy: number;
    moved: boolean;
  } | null = null;
  const down = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const { gx, gy } = toGraph(e);
    const node = nodeAt(gx, gy);
    drag = {
      node,
      sx: e.clientX,
      sy: e.clientY,
      vx: opts.view.x,
      vy: opts.view.y,
      moved: false,
    };
    canvas.setPointerCapture(e.pointerId);
    if (node) {
      node.fx = node.x;
      node.fy = node.y;
    }
  };
  const move = (e: PointerEvent) => {
    if (!drag) {
      const { gx, gy } = toGraph(e);
      const n = nodeAt(gx, gy);
      if (n !== hover) {
        hover = n;
        canvas.style.cursor = n ? "pointer" : "grab";
        schedule();
      }
      return;
    }
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 3) {
      drag.moved = true;
      touched = true;
      if (drag.node) sim.alphaTarget(0.25).restart();
    }
    if (!drag.moved) return;
    if (drag.node) {
      const { gx, gy } = toGraph(e);
      drag.node.fx = gx;
      drag.node.fy = gy;
    } else {
      opts.view.x = drag.vx + e.clientX - drag.sx;
      opts.view.y = drag.vy + e.clientY - drag.sy;
      canvas.style.cursor = "grabbing";
      schedule();
    }
  };
  const up = () => {
    if (!drag) return;
    const { node, moved } = drag;
    drag = null;
    canvas.style.cursor = hover ? "pointer" : "grab";
    if (node) {
      node.fx = null;
      node.fy = null;
      sim.alphaTarget(0);
      if (!moved) onOpen(node.id);
    }
  };
  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    touched = true;
    const r = canvas.getBoundingClientRect();
    const { x, y, k } = opts.view;
    const nk = Math.min(4, Math.max(0.2, k * Math.exp(-e.deltaY * 0.0015)));
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    Object.assign(opts.view, { k: nk, x: px - ((px - x) / k) * nk, y: py - ((py - y) / k) * nk });
    schedule();
  };
  const leave = () => {
    if (hover && !drag) {
      hover = null;
      schedule();
    }
  };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("pointerleave", leave);
  canvas.addEventListener("wheel", wheel, { passive: false });

  // O tema (claro/escuro) muda as cores: redesenha.
  const mo = new MutationObserver(schedule);
  mo.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "data-palette"],
  });
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", schedule);

  return {
    /** Volta a enquadrar todos os pontos. */
    recenter() {
      touched = false;
      fit();
    },
    /** Zoom pelos botões (+/−), mantendo o centro da caixa. */
    zoom(factor: number) {
      touched = true;
      const { x, y, k } = opts.view;
      const nk = Math.min(4, Math.max(0.2, k * factor));
      const px = width / 2;
      const py = height / 2;
      Object.assign(opts.view, { k: nk, x: px - ((px - x) / k) * nk, y: py - ((py - y) / k) * nk });
      schedule();
    },
    destroy() {
      sim.stop();
      ro.disconnect();
      mo.disconnect();
      mq.removeEventListener("change", schedule);
      cancelAnimationFrame(frame);
      probe.remove();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("wheel", wheel);
    },
  };
}
