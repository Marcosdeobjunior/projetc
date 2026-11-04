import { useMemo, useState, type CSSProperties } from "react";
import { useApp } from "../state/store";
import { formatCount } from "../manuscript/wordCount";
import type { VaultRef } from "../platform";
import { Icon } from "./Icon";
import { Settings } from "./Settings";
import {
  coverHue,
  quoteOfTheDay,
  timeAgo,
  useGoals,
  useLibraryStats,
  type ProjectStats,
} from "./library";

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** Tela "Projetos": a biblioteca com todos os livros do escritor. */
export function Home() {
  const platform = useApp((s) => s.platform);
  const vaults = useApp((s) => s.vaults);
  const busy = useApp((s) => s.busy);
  const createVault = useApp((s) => s.createVault);
  const openVault = useApp((s) => s.openVault);
  const openExistingFolder = useApp((s) => s.openExistingFolder);
  const folderToConvert = useApp((s) => s.folderToConvert);
  const createVaultInFolder = useApp((s) => s.createVaultInFolder);
  const cancelFolderToConvert = useApp((s) => s.cancelFolderToConvert);
  const forgetVault = useApp((s) => s.forgetVault);
  const goals = useGoals((s) => s.goals);
  const stats = useLibraryStats(platform, vaults);

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [quoteOffset, setQuoteOffset] = useState(0);
  const desktop = platform?.kind === "desktop";

  const recent = useMemo(
    () => [...vaults].sort((a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0)),
    [vaults],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("pt-BR");
    return q ? recent.filter((v) => v.title.toLocaleLowerCase("pt-BR").includes(q)) : recent;
  }, [recent, query]);
  const current = recent.find((v) => v.root === selected) ?? recent[0] ?? null;
  const known = Object.values(stats).filter((s): s is ProjectStats => !!s);
  const total = (f: (s: ProjectStats) => number) => known.reduce((n, s) => n + f(s), 0);

  if (settings) {
    return (
      <div className="home">
        <div className="home-inner">
          <header className="home-brand">
            <button
              type="button"
              className="icon-btn"
              aria-label="Voltar"
              onClick={() => setSettings(false)}
            >
              <Icon name="back" />
            </button>
            <h1 className="brand-text">Configurações</h1>
          </header>
          <Settings />
        </div>
      </div>
    );
  }

  return (
    <div className="projects">
      <div className="projects-inner">
        <header className="projects-head">
          <div className="projects-brand">
            <Emblem />
            <div>
              <h1>Projetos</h1>
              <p>Seus mundos. Suas histórias. Seu legado.</p>
            </div>
          </div>
          <div className="projects-actions">
            <label className="search">
              <Icon name="search" size={15} />
              <span className="sr-only">Buscar projeto</span>
              <input
                type="search"
                value={query}
                placeholder="Buscar por título…"
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="icon-btn"
              title="Configurações"
              aria-label="Configurações"
              onClick={() => setSettings(true)}
            >
              <Icon name="settings" />
            </button>
            {desktop && (
              <button
                type="button"
                className="pbtn"
                disabled={busy}
                onClick={() => void openExistingFolder()}
              >
                <Icon name="folder" size={15} /> Abrir projeto
              </button>
            )}
            <button type="button" className="pbtn accent" onClick={() => setCreating(true)}>
              <Icon name="plus" size={15} /> Novo projeto
            </button>
          </div>
        </header>

        {!desktop && (
          <p className="notice">
            {platform?.persistent === false
              ? "Prévia no navegador: este navegador não permite guardar dados, então os projetos somem ao fechar a página."
              : "Prévia no navegador: os projetos ficam guardados só neste navegador. No app desktop, cada projeto é uma pasta no seu computador."}
          </p>
        )}

        {creating && (
          <form
            className="panel new-form"
            onSubmit={(e) => {
              e.preventDefault();
              void createVault(title).then(() => {
                setTitle("");
                setCreating(false);
              });
            }}
          >
            <label htmlFor="project-title" className="kicker">
              Novo projeto
            </label>
            <div className="field-row">
              <input
                id="project-title"
                autoFocus
                value={title}
                placeholder="Nome do livro. Ex.: A Casa das Marés"
                maxLength={120}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setCreating(false)}
              />
              <button type="submit" className="pbtn accent" disabled={busy}>
                Criar projeto
              </button>
              <button type="button" className="pbtn" onClick={() => setCreating(false)}>
                Cancelar
              </button>
            </div>
            {desktop && (
              <p className="hint">
                Em seguida você escolhe em qual pasta do computador ele será salvo.
              </p>
            )}
          </form>
        )}

        {folderToConvert && (
          <div className="panel convert" role="alertdialog" aria-labelledby="convert-title">
            <p id="convert-title">
              A pasta <b>{folderToConvert.name}</b> ainda não é um projeto do InkFlow.
            </p>
            <p className="muted">
              Você pode transformá-la em um projeto: o InkFlow cria dentro dela as pastas{" "}
              <code>manuscrito</code> e <code>.inkflow</code>. Os arquivos que já estão lá não são
              alterados.
            </p>
            <div className="convert-actions">
              <button
                type="button"
                className="pbtn accent"
                disabled={busy}
                onClick={() => void createVaultInFolder(folderToConvert)}
              >
                Criar projeto nesta pasta
              </button>
              <button type="button" className="pbtn" onClick={() => void openExistingFolder()}>
                Escolher outra pasta
              </button>
              <button type="button" className="pbtn" onClick={cancelFolderToConvert}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        <div className="projects-grid">
          <div className="projects-main">
            {current ? (
              <div className="featured">
                <SelectedCard
                  vault={current}
                  stats={stats[current.root]}
                  busy={busy}
                  desktop={desktop}
                  confirming={confirming === current.root}
                  onOpen={() => void openVault(current.root)}
                  onAskRemove={() => setConfirming(current.root)}
                  onCancelRemove={() => setConfirming(null)}
                  onRemove={() => {
                    setConfirming(null);
                    setSelected(null);
                    void forgetVault(current.root);
                  }}
                />
                <BookPreview vault={current} stats={stats[current.root]} />
              </div>
            ) : (
              <div className="panel empty-library">
                <h2>Sua biblioteca está vazia</h2>
                <p className="muted">Crie o primeiro livro para começar.</p>
                <button type="button" className="pbtn accent" onClick={() => setCreating(true)}>
                  <Icon name="plus" size={15} /> Novo projeto
                </button>
              </div>
            )}

            {recent.length > 0 && (
              <section aria-labelledby="recent-title">
                <div className="row-title">
                  <h2 id="recent-title" className="kicker">
                    {query ? "Resultados" : "Projetos recentes"}
                  </h2>
                  <span className="count-pill">{filtered.length}</span>
                </div>
                {filtered.length === 0 ? (
                  <p className="muted">Nenhum projeto com “{query}”.</p>
                ) : (
                  <ul className="shelf">
                    {filtered.map((v) => (
                      <ShelfBook
                        key={v.root}
                        vault={v}
                        stats={stats[v.root]}
                        goal={goals[v.root]}
                        active={v.root === current?.root}
                        onSelect={() => setSelected(v.root)}
                        onOpen={() => void openVault(v.root)}
                      />
                    ))}
                  </ul>
                )}
              </section>
            )}
          </div>

          <aside className="projects-side">
            <section className="panel" aria-labelledby="summary-title">
              <h2 id="summary-title" className="kicker">
                Resumo da biblioteca
              </h2>
              <div className="tiles">
                <Tile n={vaults.length} label="Projetos" />
                <Tile n={total((s) => s.chapters)} label="Capítulos" />
                <Tile n={total((s) => s.words)} label="Palavras" />
                <Tile n={total((s) => s.scenes)} label="Cenas" />
                <Tile n={total((s) => s.characters)} label="Personagens" />
                <Tile n={total((s) => s.places)} label="Lugares" />
              </div>
            </section>

            <Inspiration offset={quoteOffset} onNext={() => setQuoteOffset((n) => n + 1)} />

            <Progress vaults={recent} stats={stats} goals={goals} />

            <section className="panel" aria-labelledby="activity-title">
              <h2 id="activity-title" className="kicker">
                Atividade recente
              </h2>
              {recent.length === 0 ? (
                <p className="muted small">Nada por aqui ainda.</p>
              ) : (
                <ul className="activity">
                  {activity(recent, stats).map((a) => (
                    <li key={a.root + a.kind}>
                      <span className="activity-dot">
                        <Icon name={a.kind === "edit" ? "edit" : "clock"} size={13} />
                      </span>
                      <span>
                        <b>{a.kind === "edit" ? "Sessão de escrita" : "Projeto aberto"}</b>
                        <small>
                          {timeAgo(a.at)} · {a.title}
                        </small>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

function activity(vaults: VaultRef[], stats: Record<string, ProjectStats | null>) {
  const items: { root: string; title: string; kind: "edit" | "open"; at: number }[] = [];
  for (const v of vaults) {
    const s = stats[v.root];
    if (s?.updatedAt) items.push({ root: v.root, title: v.title, kind: "edit", at: s.updatedAt });
    if (v.openedAt) items.push({ root: v.root, title: v.title, kind: "open", at: v.openedAt });
  }
  return items.sort((a, b) => b.at - a.at).slice(0, 5);
}

function Emblem() {
  return (
    <svg className="emblem" width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.4">
        {Array.from({ length: 12 }, (_, i) => (
          <path key={i} d="M32 4 35 20 32 24 29 20z" transform={`rotate(${i * 30} 32 32)`} />
        ))}
        <circle cx="32" cy="32" r="11" />
        <circle cx="32" cy="32" r="6" />
        <path d="M24 32c3-4 13-4 16 0-3 4-13 4-16 0z" />
      </g>
      <circle cx="32" cy="32" r="2.4" fill="currentColor" />
    </svg>
  );
}

function Cover({ title, size }: { title: string; size: "sm" | "lg" }) {
  const style = { "--hue": coverHue(title) } as CSSProperties;
  return (
    <div className={"cover " + size} style={style} aria-hidden="true">
      <span className="cover-title">{title}</span>
    </div>
  );
}

function Stat({ n, label }: { n: number | undefined; label: string }) {
  return (
    <div className="stat">
      <b>{n === undefined ? "–" : formatCount(n)}</b>
      <span>{label}</span>
    </div>
  );
}

function SelectedCard(props: {
  vault: VaultRef;
  stats: ProjectStats | null | undefined;
  busy: boolean;
  desktop: boolean;
  confirming: boolean;
  onOpen(): void;
  onAskRemove(): void;
  onCancelRemove(): void;
  onRemove(): void;
}) {
  const { vault, stats, desktop } = props;
  return (
    <section className="panel selected" aria-labelledby="selected-title">
      <div className="selected-banner">
        <Cover title={vault.title} size="sm" />
      </div>
      <p className="kicker faint">Projeto selecionado</p>
      <h2 id="selected-title" className="selected-title">
        {vault.title}
      </h2>
      <p className="selected-loc" title={vault.location}>
        {vault.location}
      </p>
      {stats === null && (
        <p className="small warn">Não foi possível ler este projeto. A pasta foi movida?</p>
      )}
      <div className="stats">
        <Stat n={stats?.words} label="Palavras" />
        <Stat n={stats?.chapters} label="Capítulos" />
        <Stat n={stats?.scenes} label="Cenas" />
        <Stat n={stats ? stats.characters + stats.places + stats.ideas : undefined} label="Notas" />
      </div>
      <p className="dates">
        {vault.openedAt ? `Aberto ${dateFmt.format(vault.openedAt)}` : ""}
        {stats?.updatedAt ? `   Modificado ${dateFmt.format(stats.updatedAt)}` : ""}
      </p>
      {props.confirming ? (
        <div className="confirm-inline">
          <span>
            {desktop
              ? `Tirar "${vault.title}" da lista? A pasta continua no computador.`
              : `Excluir "${vault.title}" deste navegador? Não dá para desfazer.`}
          </span>
          <button type="button" className="pbtn danger" onClick={props.onRemove}>
            {desktop ? "Tirar da lista" : "Excluir"}
          </button>
          <button type="button" className="pbtn" onClick={props.onCancelRemove}>
            Cancelar
          </button>
        </div>
      ) : (
        <div className="selected-actions">
          <button
            type="button"
            className="pbtn accent"
            disabled={props.busy}
            onClick={props.onOpen}
          >
            Continuar
          </button>
          <button type="button" className="pbtn" onClick={props.onAskRemove}>
            {desktop ? "Tirar da lista" : "Excluir"}
          </button>
        </div>
      )}
    </section>
  );
}

function BookPreview({
  vault,
  stats,
}: {
  vault: VaultRef;
  stats: ProjectStats | null | undefined;
}) {
  return (
    <figure className="book-preview">
      <div className="book">
        <div className="book-back">
          <span className="book-label">Sinopse</span>
          <p>
            {stats?.excerpt ||
              "Este livro ainda não tem texto. Abra o projeto e comece a primeira cena."}
          </p>
        </div>
        <Cover title={vault.title} size="lg" />
      </div>
      <figcaption>Primeiras linhas do manuscrito</figcaption>
    </figure>
  );
}

function ShelfBook(props: {
  vault: VaultRef;
  stats: ProjectStats | null | undefined;
  goal: number | undefined;
  active: boolean;
  onSelect(): void;
  onOpen(): void;
}) {
  const { vault, stats, goal } = props;
  const pct = goal && stats ? Math.min(100, Math.round((stats.words / goal) * 100)) : null;
  return (
    <li className={"shelf-book" + (props.active ? " active" : "")}>
      <button
        type="button"
        onClick={props.onSelect}
        onDoubleClick={props.onOpen}
        title="Clique para ver os detalhes, duplo clique para abrir"
      >
        <Cover title={vault.title} size="sm" />
        <span className="shelf-title">{vault.title}</span>
        <span className="shelf-meta">
          {stats
            ? `${stats.chapters} cap. · ${formatCount(stats.words)} palavras`
            : stats === null
              ? "Indisponível"
              : "…"}
        </span>
        <span className="shelf-progress">
          <span className="bar">
            <span style={{ width: `${pct ?? 0}%` }} />
          </span>
          <small>{pct === null ? "sem meta" : `${pct}%`}</small>
        </span>
      </button>
    </li>
  );
}

function Tile({ n, label }: { n: number; label: string }) {
  return (
    <div className="tile">
      <b>{formatCount(n)}</b>
      <span>{label}</span>
    </div>
  );
}

function Inspiration({ offset, onNext }: { offset: number; onNext(): void }) {
  const q = quoteOfTheDay(offset);
  return (
    <section className="panel inspiration" aria-labelledby="quote-title">
      <div className="row-title">
        <h2 id="quote-title" className="kicker">
          Inspiração do dia
        </h2>
        <button
          type="button"
          className="icon-btn"
          title="Outra citação"
          aria-label="Outra citação"
          onClick={onNext}
        >
          <Icon name="refresh" size={15} />
        </button>
      </div>
      <blockquote>“{q.text}”</blockquote>
      <p className="quote-author">— {q.author}</p>
    </section>
  );
}

function Progress({
  vaults,
  stats,
  goals,
}: {
  vaults: VaultRef[];
  stats: Record<string, ProjectStats | null>;
  goals: Record<string, number>;
}) {
  const setGoal = useGoals((s) => s.setGoal);
  const [editing, setEditing] = useState<string | null>(null);
  const withGoal = vaults.filter((v) => goals[v.root]);
  const goalWords = withGoal.reduce((n, v) => n + goals[v.root]!, 0);
  const doneWords = withGoal.reduce(
    (n, v) => n + Math.min(stats[v.root]?.words ?? 0, goals[v.root]!),
    0,
  );
  const pct = goalWords ? Math.round((doneWords / goalWords) * 100) : 0;
  const totalWords = vaults.reduce((n, v) => n + (stats[v.root]?.words ?? 0), 0);
  const r = 26;
  const c = 2 * Math.PI * r;

  return (
    <section className="panel" aria-labelledby="progress-title">
      <h2 id="progress-title" className="kicker">
        Progresso geral
      </h2>
      <div className="progress-head">
        <svg width="72" height="72" viewBox="0 0 64 64" className="ring" aria-hidden="true">
          <circle cx="32" cy="32" r={r} className="ring-bg" />
          <circle
            cx="32"
            cy="32"
            r={r}
            className="ring-fg"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - pct / 100)}
          />
          <text x="32" y="31" textAnchor="middle" className="ring-pct">
            {pct}%
          </text>
          <text x="32" y="42" textAnchor="middle" className="ring-label">
            GERAL
          </text>
        </svg>
        <div>
          <b className="big">{formatCount(totalWords)}</b>
          <p className="small faint">
            {withGoal.length} de {vaults.length} {vaults.length === 1 ? "livro" : "livros"} com meta
            definida
          </p>
        </div>
      </div>
      <ul className="goals">
        {vaults.map((v) => {
          const goal = goals[v.root];
          const words = stats[v.root]?.words ?? 0;
          const p = goal ? Math.min(100, Math.round((words / goal) * 100)) : 0;
          return (
            <li key={v.root}>
              <div className="goal-row">
                <span className="goal-name">{v.title}</span>
                {editing === v.root ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const value = new FormData(e.currentTarget).get("goal");
                      setGoal(v.root, Number(value) || null);
                      setEditing(null);
                    }}
                  >
                    <input
                      name="goal"
                      type="number"
                      min={0}
                      step={1000}
                      autoFocus
                      defaultValue={goal ?? ""}
                      placeholder="palavras"
                      aria-label={`Meta de palavras de ${v.title}`}
                      onBlur={(e) => e.currentTarget.form?.requestSubmit()}
                      onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
                    />
                  </form>
                ) : (
                  <button
                    type="button"
                    className="goal-btn"
                    title="Definir meta de palavras"
                    onClick={() => setEditing(v.root)}
                  >
                    {goal ? `${p}% de ${formatCount(goal)}` : "sem meta"}
                  </button>
                )}
              </div>
              <span className="bar">
                <span style={{ width: `${p}%` }} />
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
