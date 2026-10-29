import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { useApp, type Session } from "../state/store";
import { useSettings, type MinimapPos } from "../state/settings";
import { buildGraph, egoGraph, type Graph, type GraphNode } from "../links/links";
import { COLOR_VAR } from "./GraphView";
import { POS_LABEL } from "./Settings";
import { Icon } from "./Icon";

type SimNode = GraphNode & SimulationNodeDatum;
type SimLink = SimulationLinkDatum<SimNode> & { kind: "link" | "mention" };

/** Espera o texto parar de mudar antes de remontar o grafo (não a cada tecla). */
const TEXT_DELAY_MS = 600;

const graphKey = (g: Graph) =>
  g.nodes.map((n) => `${n.id}:${n.title}`).join(",") +
  "|" +
  g.edges.map((e) => `${e.source}-${e.target}-${e.kind}`).join(",");

/** Qual das 8 posições fica mais perto de um ponto dentro da área da página. */
export function nearestPos(x: number, y: number, w: number, h: number): MinimapPos {
  const col = x < w / 3 ? 0 : x > (2 * w) / 3 ? 2 : 1;
  const row = y < h / 3 ? 0 : y > (2 * h) / 3 ? 2 : 1;
  if (col === 1 && row === 1) {
    // No meio: vai para o lado mais próximo.
    const d = { left: x / w, right: 1 - x / w, top: y / h, bottom: 1 - y / h };
    return (Object.keys(d) as (keyof typeof d)[]).reduce((a, b) => (d[a] <= d[b] ? a : b));
  }
  const grid: MinimapPos[][] = [
    ["top-left", "top", "top-right"],
    ["left", "left", "right"],
    ["bottom-left", "bottom", "bottom-right"],
  ];
  return grid[row]![col]!;
}

/**
 * Minimapa do grafo com foco no texto aberto. Fica dentro da área da página
 * (`.page-wrap`) e pode ser arrastado pela barra para um dos cantos ou lados.
 */
export function MiniMap({ session, docId }: { session: Session; docId: string }) {
  const openDoc = useApp((s) => s.openDoc);
  const setView = useApp((s) => s.setView);
  const mentions = useSettings((s) => s.minimapMentions);
  const pos = useSettings((s) => s.minimapPos);
  const setSettings = useSettings((s) => s.set);
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drop, setDrop] = useState<MinimapPos | null>(null);

  const [texts, setTexts] = useState(session.texts);
  useEffect(() => {
    const t = window.setTimeout(() => setTexts(session.texts), TEXT_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [session.texts]);

  const fresh = useMemo(
    () => egoGraph(buildGraph(session.project, texts, { mentions }), docId),
    [session.project, texts, mentions, docId],
  );
  // Só redesenha quando os pontos ou as ligações mudam de fato.
  const [graph, setGraph] = useState(fresh);
  if (graphKey(graph) !== graphKey(fresh)) setGraph(fresh);

  useEffect(() => {
    const box = boxRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const css = (name: string) => getComputedStyle(box).getPropertyValue(name).trim();
    let width = 0;
    let height = 0;
    let nodes: SimNode[] = [];
    let links: SimLink[] = [];
    let view = { x: 0, y: 0, k: 1 };
    let hover: SimNode | null = null;
    let frame = 0;

    const r = (n: SimNode) => (n.id === docId ? 9 : 5 + Math.min(n.degree, 9) * 0.5);

    /** Posiciona os pontos com o texto aberto no centro, espalhando no formato da caixa. */
    const layout = () => {
      nodes = graph.nodes.map((n) => ({ ...n, ...(n.id === docId ? { fx: 0, fy: 0 } : {}) }));
      links = graph.edges.map((e) => ({ source: e.source, target: e.target, kind: e.kind }));
      const aspect = width / Math.max(1, height);
      forceSimulation(nodes)
        .force(
          "link",
          forceLink<SimNode, SimLink>(links)
            .id((d) => d.id)
            .distance(64),
        )
        .force("charge", forceManyBody().strength(-260))
        .force("x", forceX(0).strength(aspect < 0.7 ? 0.3 : 0.05))
        .force("y", forceY(0).strength(aspect > 1.5 ? 0.3 : 0.05))
        .force(
          "collide",
          forceCollide<SimNode>((d) => r(d) + 14),
        )
        .stop()
        .tick(220);

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
      const k = Math.min(1.4, width / (x1 - x0 + 140), height / (y1 - y0 + 60));
      view = { k, x: width / 2 - ((x0 + x1) / 2) * k, y: height / 2 - ((y0 + y1) / 2) * k - 6 };
    };

    const draw = () => {
      frame = 0;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.translate(view.x, view.y);
      ctx.scale(view.k, view.k);
      const k = view.k;

      ctx.strokeStyle = css("--edge");
      for (const l of links) {
        const s = l.source as SimNode;
        const t = l.target as SimNode;
        ctx.globalAlpha = l.kind === "mention" ? 0.6 : 1;
        ctx.lineWidth = 1.2 / k;
        ctx.setLineDash(l.kind === "mention" ? [4 / k, 3 / k] : []);
        ctx.beginPath();
        ctx.moveTo(s.x!, s.y!);
        ctx.lineTo(t.x!, t.y!);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      ctx.font = `500 ${11 / k}px ${css("--font-ui")}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (const n of nodes) {
        const current = n.id === docId;
        ctx.fillStyle = css(COLOR_VAR[n.type]);
        ctx.beginPath();
        ctx.arc(n.x!, n.y!, r(n), 0, Math.PI * 2);
        ctx.fill();
        if (current || n === hover) {
          ctx.strokeStyle = css("--fg");
          ctx.lineWidth = 2 / k;
          ctx.stroke();
        }
        ctx.fillStyle = css(current || n === hover ? "--fg" : "--muted");
        ctx.fillText(n.title, n.x!, n.y! + r(n) + 3 / k);
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };

    const resize = () => {
      const rect = box.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = window.devicePixelRatio || 1;
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      layout();
      schedule();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(box);

    const nodeAt = (e: PointerEvent | MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const gx = (e.clientX - rect.left - view.x) / view.k;
      const gy = (e.clientY - rect.top - view.y) / view.k;
      return nodes.find((n) => Math.hypot(n.x! - gx, n.y! - gy) < r(n) + 6 / view.k) ?? null;
    };
    const move = (e: PointerEvent) => {
      const n = nodeAt(e);
      if (n === hover) return;
      hover = n;
      canvas.style.cursor = n && n.id !== docId ? "pointer" : "default";
      schedule();
    };
    const leave = () => {
      hover = null;
      schedule();
    };
    const click = (e: MouseEvent) => {
      const n = nodeAt(e);
      if (n && n.id !== docId) openDoc(n.id);
    };
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerleave", leave);
    canvas.addEventListener("click", click);

    // O tema muda as cores: redesenha.
    const mo = new MutationObserver(schedule);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", schedule);

    return () => {
      ro.disconnect();
      mo.disconnect();
      mq.removeEventListener("change", schedule);
      cancelAnimationFrame(frame);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("click", click);
    };
  }, [graph, docId, openDoc]);

  /** Arrastar pela barra: mostra onde vai encaixar e muda a posição ao soltar. */
  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    const area = boxRef.current?.closest(".page-wrap")?.getBoundingClientRect();
    if (!area) return;
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const at = (ev: PointerEvent) =>
      nearestPos(ev.clientX - area.left, ev.clientY - area.top, area.width, area.height);
    let target = pos;
    const onMove = (ev: PointerEvent) => {
      target = at(ev);
      setDrop(target);
    };
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      setDrop(null);
      setSettings({ minimapPos: target });
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  };

  /** Pelo teclado: setas movem para a posição vizinha. */
  const onKeyDown = (e: React.KeyboardEvent) => {
    const order: Record<string, Partial<Record<MinimapPos, MinimapPos>>> = {
      ArrowLeft: {
        top: "top-left",
        "top-right": "top",
        right: "left",
        bottom: "bottom-left",
        "bottom-right": "bottom",
      },
      ArrowRight: {
        "top-left": "top",
        top: "top-right",
        left: "right",
        "bottom-left": "bottom",
        bottom: "bottom-right",
      },
      ArrowUp: {
        left: "top-left",
        right: "top-right",
        "bottom-left": "left",
        "bottom-right": "right",
        bottom: "top",
      },
      ArrowDown: {
        "top-left": "left",
        "top-right": "right",
        left: "bottom-left",
        right: "bottom-right",
        top: "bottom",
      },
    };
    const next = order[e.key]?.[pos];
    if (!next) return;
    e.preventDefault();
    setSettings({ minimapPos: next });
  };

  const lonely = graph.edges.length === 0;

  return (
    <>
      <aside className={"minimap" + (drop ? " moving" : "")} aria-label="Minimapa de conexões">
        <div
          className="minimap-bar"
          tabIndex={0}
          role="button"
          aria-label={`Mover minimapa (agora: ${POS_LABEL[pos].toLowerCase()}). Use as setas.`}
          title="Arraste para mudar de lugar"
          onPointerDown={startDrag}
          onKeyDown={onKeyDown}
        >
          <Icon name="grip" size={14} />
          <span className="minimap-title">
            Conexões <b>{graph.nodes.length - 1}</b>
          </span>
          <button
            type="button"
            className="icon-btn sm"
            title="Abrir o grafo completo"
            aria-label="Abrir o grafo completo"
            onClick={() => setView("graph")}
          >
            <Icon name="expand" size={14} />
          </button>
          <button
            type="button"
            className="icon-btn sm"
            title="Esconder minimapa (volta pelas Configurações ou pela barra de ferramentas)"
            aria-label="Esconder minimapa"
            onClick={() => setSettings({ minimap: false })}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
        <div ref={boxRef} className="minimap-canvas">
          <canvas ref={canvasRef} role="img" aria-label={describe(graph, docId)} />
          {lonely && (
            <p className="minimap-empty">
              Sem conexões ainda. Escreva <b>[[Nome]]</b> para ligar este texto.
            </p>
          )}
        </div>
      </aside>
      {drop && <div className={"minimap-drop mm-drop-" + drop} aria-hidden="true" />}
    </>
  );
}

function describe(g: Graph, docId: string) {
  const others = g.nodes.filter((n) => n.id !== docId).map((n) => n.title);
  return others.length ? `Ligado a: ${others.join(", ")}` : "Sem conexões";
}
