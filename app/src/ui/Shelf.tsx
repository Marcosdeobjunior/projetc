import { useEffect, useState, type CSSProperties } from "react";
import type { Platform, VaultRef } from "../platform";
import { getCovers, peekCovers, type ShelfCovers } from "../book/shelfCovers";
import { formatCount } from "../manuscript/wordCount";
import { coverHue, type ProjectStats } from "./library";
import { Icon } from "./Icon";

/**
 * Capa, quarta capa e lombada de um projeto. Mostra na hora as últimas
 * desenhadas e confere, quando o navegador fica ocioso, se precisam ser
 * desenhadas de novo. Sem nenhuma ainda, devolve null (a tela usa a capa simples).
 */
export function useCovers(
  platform: Platform | null,
  vault: VaultRef | null,
  stats: ProjectStats | null | undefined,
): ShelfCovers | null {
  const root = vault?.root ?? "";
  const [state, setState] = useState<{ root: string; covers: ShelfCovers | null }>(() => ({
    root,
    covers: root ? peekCovers(root) : null,
  }));
  const words = stats?.words ?? 0;
  const chapters = stats?.chapters ?? 0;
  const known = stats !== undefined;
  useEffect(() => {
    if (!platform || !root || !known) return;
    let alive = true;
    const run = () =>
      void getCovers(root, platform.fs(root), { words, chapters }).then(
        (covers) => alive && covers && setState({ root, covers }),
      );
    if (!("requestIdleCallback" in window)) {
      const id = setTimeout(run, 300);
      return () => {
        alive = false;
        clearTimeout(id);
      };
    }
    const id = window.requestIdleCallback(run, { timeout: 2000 });
    return () => {
      alive = false;
      window.cancelIdleCallback(id);
    };
  }, [platform, root, known, words, chapters]);
  return state.root === root ? state.covers : peekCovers(root);
}

/** Altura das lombadas na estante (px) para um livro de 21 cm. */
const SHELF_H = 214;

/**
 * A estante: um livro por projeto, de lombada para fora. A lombada é a do
 * projeto gráfico (a arte pronta enviada, ou o desenho do app). Um clique
 * escolhe o livro, dois cliques abrem; a última lombada começa um livro novo.
 */
export function Shelf(props: {
  platform: Platform | null;
  vaults: VaultRef[];
  stats: Record<string, ProjectStats | null>;
  goals: Record<string, number>;
  activeRoot: string | null;
  query: string;
  onSelect(root: string): void;
  onOpen(root: string): void;
  onCreate(): void;
}) {
  return (
    <section className="panel shelf-panel" aria-labelledby="shelf-title">
      <div className="shelf-head">
        <h2 id="shelf-title" className="shelf-title">
          Sua estante
        </h2>
        <span className="shelf-hint">
          Clique numa lombada para escolher o livro; dois cliques abrem.
        </span>
      </div>
      <div className="shelf" role="group" aria-label="Livros">
        {props.vaults.length === 0 && props.query && (
          <p className="shelf-empty">Nenhum livro com “{props.query}” na estante.</p>
        )}
        {props.vaults.map((v) => (
          <Spine
            key={v.root}
            platform={props.platform}
            vault={v}
            stats={props.stats[v.root]}
            goal={props.goals[v.root]}
            active={v.root === props.activeRoot}
            onSelect={() => props.onSelect(v.root)}
            onOpen={() => props.onOpen(v.root)}
          />
        ))}
        <button type="button" className="spine spine-new" onClick={props.onCreate}>
          <Icon name="plus" size={16} />
          <b>Começar um livro</b>
        </button>
      </div>
      <div className="shelf-plank" aria-hidden="true" />
    </section>
  );
}

function Spine(props: {
  platform: Platform | null;
  vault: VaultRef;
  stats: ProjectStats | null | undefined;
  goal: number | undefined;
  active: boolean;
  onSelect(): void;
  onOpen(): void;
}) {
  const { vault, stats } = props;
  const covers = useCovers(props.platform, vault, stats);
  const words = stats?.words;
  const pct =
    props.goal && words !== undefined
      ? Math.min(100, Math.round((words / props.goal) * 100))
      : null;
  // Medidas reais: a altura segue o formato do livro e a largura, a lombada.
  const h = covers ? SHELF_H * (covers.heightMm / 210) : SHELF_H;
  const w = covers ? Math.max(18, (covers.shelfSpineMm * h) / covers.heightMm) : 40;
  const style = {
    "--hue": coverHue(vault.title),
    "--sw": `${w}px`,
    "--sh": `${h}px`,
    ...(covers ? { backgroundImage: `url("${covers.shelfSpine}")` } : {}),
  } as CSSProperties;
  const label = `${vault.title}${words === undefined ? "" : `, ${formatCount(words)} palavras`}${pct === null ? "" : `, ${pct}% da meta`}`;
  return (
    <button
      type="button"
      className={"spine" + (covers ? " art" : "")}
      style={style}
      aria-pressed={props.active}
      aria-label={label}
      title={`${label}. Dois cliques abrem.`}
      onClick={props.onSelect}
      onDoubleClick={props.onOpen}
    >
      {!covers && <b>{vault.title}</b>}
      {pct !== null && <small className="spine-pct">{pct}%</small>}
    </button>
  );
}
