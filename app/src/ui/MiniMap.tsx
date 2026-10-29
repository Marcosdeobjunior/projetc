import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useApp, type Session } from "../state/store";
import { useSettings, type MinimapPos } from "../state/settings";
import { buildGraph, egoGraph, type Graph } from "../links/links";
import { mountGraph, type View } from "./graphCanvas";
import { POS_LABEL } from "./Settings";
import { Icon } from "./Icon";

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

  const positions = useRef(new Map<string, { x: number; y: number }>());
  const view = useRef<View>({ x: 0, y: 0, k: 1 });
  const controls = useRef<ReturnType<typeof mountGraph> | null>(null);
  useEffect(() => {
    const g = mountGraph(canvasRef.current!, boxRef.current!, graph, {
      activeId: docId,
      onOpen: (id) => id !== docId && openDoc(id),
      positions: positions.current,
      view: view.current,
      compact: true,
    });
    controls.current = g;
    return () => {
      controls.current = null;
      g.destroy();
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
          <div className="minimap-zoom" role="group" aria-label="Zoom">
            <button
              type="button"
              className="icon-btn sm"
              title="Aumentar zoom"
              aria-label="Aumentar zoom"
              onClick={() => controls.current?.zoom(1.3)}
            >
              <Icon name="plus" size={14} />
            </button>
            <button
              type="button"
              className="icon-btn sm"
              title="Diminuir zoom"
              aria-label="Diminuir zoom"
              onClick={() => controls.current?.zoom(1 / 1.3)}
            >
              <Icon name="minus" size={14} />
            </button>
            <button
              type="button"
              className="icon-btn sm"
              title="Centralizar"
              aria-label="Centralizar"
              onClick={() => controls.current?.recenter()}
            >
              <Icon name="target" size={14} />
            </button>
          </div>
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
