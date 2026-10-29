import { useEffect, useMemo, useRef, useState } from "react";
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
import { useApp, type Session } from "../state/store";
import { buildGraph, type GraphEdge, type GraphNode, type NodeType } from "../links/links";
import { KIND_LABEL } from "../links/context";
import { Icon } from "./Icon";

type SimNode = GraphNode & SimulationNodeDatum;
type SimLink = SimulationLinkDatum<SimNode> & { kind: GraphEdge["kind"] };

const TYPES: { type: NodeType; label: string; color: string }[] = [
  { type: "scene", label: "Cenas", color: "--node-scene" },
  { type: "personagens", label: KIND_LABEL.personagens.many, color: "--node-person" },
  { type: "lugares", label: KIND_LABEL.lugares.many, color: "--node-place" },
  { type: "ideias", label: KIND_LABEL.ideias.many, color: "--node-idea" },
];
export const COLOR_VAR = Object.fromEntries(TYPES.map((t) => [t.type, t.color])) as Record<
  NodeType,
  string
>;

const radius = (n: GraphNode) => 5 + Math.sqrt(n.degree) * 2.6;

/** Grafo de conexões entre cenas e notas, no estilo do Obsidian. */
export function GraphView({ session }: { session: Session }) {
  const openDoc = useApp((s) => s.openDoc);
  const [mentions, setMentions] = useState(true);
  const [hidden, setHidden] = useState<Set<NodeType>>(new Set());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  /** Posições anteriores, para o grafo não "pular" quando os filtros mudam. */
  const positions = useRef(new Map<string, { x: number; y: number }>());
  const view = useRef({ x: 0, y: 0, k: 1 });
  const redraw = useRef<() => void>(() => undefined);
  const recenter = useRef<() => void>(() => undefined);

  const graph = useMemo(() => {
    const g = buildGraph(session.project, session.texts, { mentions });
    const nodes = g.nodes.filter((n) => !hidden.has(n.type));
    const ids = new Set(nodes.map((n) => n.id));
    return { nodes, edges: g.edges.filter((e) => ids.has(e.source) && ids.has(e.target)) };
  }, [session.project, session.texts, mentions, hidden]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const box = boxRef.current!;
    const ctx = canvas.getContext("2d")!;
    const nodes: SimNode[] = graph.nodes.map((n) => ({ ...n, ...positions.current.get(n.id) }));
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

    let hover: SimNode | null = null;
    /** Depois que a pessoa move ou dá zoom, o grafo não se recentraliza sozinho. */
    let touched = false;
    let width = 0;
    let height = 0;
    let frame = 0;

    const sim: Simulation<SimNode, SimLink> = forceSimulation(nodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance(70)
          .strength(0.5),
      )
      .force("charge", forceManyBody().strength(-220))
      .force("center", forceCenter(0, 0))
      .force("x", forceX(0).strength(0.05))
      .force("y", forceY(0).strength(0.05))
      .force(
        "collide",
        forceCollide<SimNode>((d) => radius(d) + 6),
      )
      .stop();

    const fresh = nodes.some((n) => n.x === undefined);
    if (fresh) sim.tick(150);

    const css = (name: string) => getComputedStyle(box).getPropertyValue(name).trim();

    const draw = () => {
      frame = 0;
      const dpr = window.devicePixelRatio || 1;
      const { x, y, k } = view.current;
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
        ctx.globalAlpha = focus && !on ? 0.12 : l.kind === "mention" ? 0.45 : 0.85;
        ctx.strokeStyle = on ? edgeHi : edge;
        ctx.lineWidth = (on ? 1.8 : 1) / Math.max(0.6, k);
        ctx.setLineDash(l.kind === "mention" ? [4 / k, 3 / k] : []);
        ctx.beginPath();
        ctx.moveTo(s.x!, s.y!);
        ctx.lineTo(t.x!, t.y!);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      const label = css("--fg");
      const ring = css("--fg");
      ctx.font = `500 ${12 / Math.max(0.75, k)}px ${css("--font-ui")}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (const n of nodes) {
        const r = radius(n);
        ctx.globalAlpha = lit(n.id) ? 1 : 0.18;
        ctx.fillStyle = css(COLOR_VAR[n.type]);
        ctx.beginPath();
        ctx.arc(n.x!, n.y!, r, 0, Math.PI * 2);
        ctx.fill();
        if (n.id === session.activeDocId) {
          ctx.strokeStyle = ring;
          ctx.lineWidth = 2 / k;
          ctx.stroke();
        }
        // Rótulos aparecem com zoom, ou no nó destacado e nos vizinhos.
        const showLabel = k > 0.9 || (focus && lit(n.id)) || n.degree >= 4;
        if (showLabel) {
          ctx.globalAlpha = lit(n.id) ? 0.95 : 0.15;
          ctx.fillStyle = label;
          ctx.fillText(n.title, n.x!, n.y! + r + 4 / k);
        }
      }
      ctx.globalAlpha = 1;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    redraw.current = schedule;
    sim.on("tick", () => {
      for (const n of nodes) positions.current.set(n.id, { x: n.x!, y: n.y! });
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
      const k = Math.min(
        2.2,
        Math.max(0.3, Math.min(width / (x1 - x0 + 120), height / (y1 - y0 + 120))),
      );
      view.current = { k, x: width / 2 - ((x0 + x1) / 2) * k, y: height / 2 - ((y0 + y1) / 2) * k };
      schedule();
    };
    recenter.current = () => {
      touched = false;
      fit();
    };
    // Quando a simulação assenta, enquadra de novo (se a pessoa não mexeu).
    sim.on("end", () => {
      if (!touched) fit();
    });

    const resize = () => {
      const r = box.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const first = width === 0;
      width = r.width;
      height = r.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      if (first && (fresh || view.current.k === 1)) fit();
      schedule();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(box);
    resize();
    sim.alpha(fresh ? 0.3 : 0.15).restart();

    // Interação: arrastar nós, mover a tela, zoom e clique para abrir.
    const toGraph = (e: PointerEvent | WheelEvent) => {
      const r = canvas.getBoundingClientRect();
      const { x, y, k } = view.current;
      return { gx: (e.clientX - r.left - x) / k, gy: (e.clientY - r.top - y) / k };
    };
    const nodeAt = (gx: number, gy: number) => {
      let best: SimNode | null = null;
      let bestD = Infinity;
      for (const n of nodes) {
        const d = Math.hypot(n.x! - gx, n.y! - gy);
        if (d < radius(n) + 6 / view.current.k && d < bestD) {
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
      const { gx, gy } = toGraph(e);
      const node = nodeAt(gx, gy);
      touched = true;
      drag = {
        node,
        sx: e.clientX,
        sy: e.clientY,
        vx: view.current.x,
        vy: view.current.y,
        moved: false,
      };
      canvas.setPointerCapture(e.pointerId);
      if (node) {
        node.fx = node.x;
        node.fy = node.y;
        sim.alphaTarget(0.25).restart();
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
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 3) drag.moved = true;
      if (drag.node) {
        const { gx, gy } = toGraph(e);
        drag.node.fx = gx;
        drag.node.fy = gy;
      } else {
        view.current.x = drag.vx + e.clientX - drag.sx;
        view.current.y = drag.vy + e.clientY - drag.sy;
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
        if (!moved) openDoc(node.id);
      }
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      touched = true;
      const r = canvas.getBoundingClientRect();
      const { x, y, k } = view.current;
      const nk = Math.min(4, Math.max(0.2, k * Math.exp(-e.deltaY * 0.0015)));
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      view.current = { k: nk, x: px - ((px - x) / k) * nk, y: py - ((py - y) / k) * nk };
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

    return () => {
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
    };
  }, [graph, openDoc, session.activeDocId]);

  const toggle = (t: NodeType) =>
    setHidden((s) => {
      const n = new Set(s);
      if (n.has(t)) n.delete(t);
      else n.add(t);
      return n;
    });

  return (
    <div className="graph">
      <div className="graph-tools" role="toolbar" aria-label="Filtros do grafo">
        {TYPES.map((t) => (
          <button
            key={t.type}
            type="button"
            className="chip"
            aria-pressed={!hidden.has(t.type)}
            onClick={() => toggle(t.type)}
          >
            <i style={{ background: `var(${t.color})` }} />
            {t.label}
          </button>
        ))}
        <label className="chip check">
          <input
            type="checkbox"
            checked={mentions}
            onChange={(e) => setMentions(e.target.checked)}
          />
          Menções automáticas
        </label>
        <button type="button" className="chip" onClick={() => recenter.current()}>
          <Icon name="graph" size={14} /> Centralizar
        </button>
      </div>

      <div ref={boxRef} className="graph-canvas">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Grafo com ${graph.nodes.length} textos e ${graph.edges.length} conexões`}
        />
        {graph.edges.length === 0 && (
          <div className="graph-empty">
            <p>Ainda não há conexões.</p>
            <p className="muted">
              Escreva <b>[[Nome]]</b> em uma cena para ligar a outro texto, ou crie uma nota com um
              nome que aparece nas cenas (um personagem, um lugar).
            </p>
          </div>
        )}
      </div>

      <p className="graph-hint">
        Clique em um ponto para abrir · arraste para mover · role para dar zoom · linhas tracejadas
        são menções automáticas
      </p>

      {/* Alternativa em texto para leitores de tela. */}
      <ul className="sr-only">
        {graph.nodes.map((n) => (
          <li key={n.id}>
            <button type="button" onClick={() => openDoc(n.id)}>
              {n.title}: {n.degree} {n.degree === 1 ? "conexão" : "conexões"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
