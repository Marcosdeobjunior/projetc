import { useEffect, useMemo, useRef, useState } from "react";
import { useApp, type Session } from "../state/store";
import { buildGraph, type NodeType } from "../links/links";
import { KIND_LABEL } from "../links/context";
import { COLOR_VAR, mountGraph, type View } from "./graphCanvas";
import { Icon } from "./Icon";

const TYPES: { type: NodeType; label: string }[] = [
  { type: "scene", label: "Cenas" },
  { type: "personagens", label: KIND_LABEL.personagens.many },
  { type: "lugares", label: KIND_LABEL.lugares.many },
  { type: "ideias", label: KIND_LABEL.ideias.many },
];

/** Grafo de conexões entre cenas e notas, no estilo do Obsidian. */
export function GraphView({ session }: { session: Session }) {
  const openDoc = useApp((s) => s.openDoc);
  const [mentions, setMentions] = useState(true);
  const [hidden, setHidden] = useState<Set<NodeType>>(new Set());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  /** Posições anteriores, para o grafo não "pular" quando os filtros mudam. */
  const positions = useRef(new Map<string, { x: number; y: number }>());
  const view = useRef<View>({ x: 0, y: 0, k: 1 });
  const recenter = useRef<() => void>(() => undefined);

  const graph = useMemo(() => {
    const g = buildGraph(session.project, session.texts, { mentions });
    const nodes = g.nodes.filter((n) => !hidden.has(n.type));
    const ids = new Set(nodes.map((n) => n.id));
    return { nodes, edges: g.edges.filter((e) => ids.has(e.source) && ids.has(e.target)) };
  }, [session.project, session.texts, mentions, hidden]);

  useEffect(() => {
    const g = mountGraph(canvasRef.current!, boxRef.current!, graph, {
      activeId: session.activeDocId,
      onOpen: openDoc,
      positions: positions.current,
      view: view.current,
    });
    recenter.current = g.recenter;
    return g.destroy;
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
            <i style={{ background: `var(${COLOR_VAR[t.type]})` }} />
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
