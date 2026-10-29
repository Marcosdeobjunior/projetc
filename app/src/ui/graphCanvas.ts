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
import type { Graph, GraphEdge, GraphNode, NodeType } from "../links/links";

/*
 * Desenho interativo do grafo num <canvas>, usado pelo grafo completo e pelo
 * minimapa: arrastar pontos, mover a visão, zoom com a roda, destacar os
 * vizinhos ao passar o mouse e clicar para abrir.
 */

type SimNode = GraphNode & SimulationNodeDatum;
type SimLink = SimulationLinkDatum<SimNode> & { kind: GraphEdge["kind"] };

export const COLOR_VAR: Record<NodeType, string> = {
  scene: "--node-scene",
  personagens: "--node-person",
  lugares: "--node-place",
  ideias: "--node-idea",
};

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
        : 5 + Math.sqrt(n.degree) * 2.6;

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
        .distance(compact ? 64 : 70)
        .strength(0.5),
    )
    .force("charge", forceManyBody().strength(compact ? -260 : -220))
    .force("center", forceCenter(0, 0))
    .force("x", forceX(0).strength(0.05))
    .force("y", forceY(0).strength(0.05))
    .force(
      "collide",
      forceCollide<SimNode>((d) => radius(d) + (compact ? 14 : 6)),
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

    const edge = css("--edge");
    const edgeHi = css("--accent");
    for (const l of links) {
      const s = l.source as SimNode;
      const t = l.target as SimNode;
      const on = hover && (s.id === hover.id || t.id === hover.id);
      ctx.globalAlpha = focus && !on ? 0.12 : l.kind === "mention" ? 0.5 : 0.9;
      ctx.strokeStyle = on ? edgeHi : edge;
      ctx.lineWidth = (on ? 1.8 : 1.2) / Math.max(0.6, k);
      ctx.setLineDash(l.kind === "mention" ? [4 / k, 3 / k] : []);
      ctx.beginPath();
      ctx.moveTo(s.x!, s.y!);
      ctx.lineTo(t.x!, t.y!);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    const fg = css("--fg");
    const muted = css("--muted");
    const size = compact ? 11 : 12;
    ctx.font = `500 ${size / Math.max(0.75, k)}px ${css("--font-ui")}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const n of nodes) {
      const r = radius(n);
      ctx.globalAlpha = lit(n.id) ? 1 : 0.18;
      ctx.fillStyle = css(COLOR_VAR[n.type]);
      ctx.beginPath();
      ctx.arc(n.x!, n.y!, r, 0, Math.PI * 2);
      ctx.fill();
      if (n.id === activeId || n === hover) {
        ctx.strokeStyle = fg;
        ctx.lineWidth = 2 / k;
        ctx.stroke();
      }
      // Rótulos aparecem com zoom, ou no ponto destacado e nos vizinhos.
      const showLabel =
        compact || k > 0.9 || (focus && lit(n.id)) || n.degree >= 4 || n.id === activeId;
      if (showLabel) {
        ctx.globalAlpha = lit(n.id) ? 0.95 : 0.15;
        ctx.fillStyle = compact && n.id !== activeId && n !== hover ? muted : fg;
        ctx.fillText(n.title, n.x!, n.y! + r + 4 / k);
      }
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
    const [padX, padY, max] = compact ? [140, 60, 1.4] : [120, 120, 2.2];
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
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
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
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("wheel", wheel);
    },
  };
}
