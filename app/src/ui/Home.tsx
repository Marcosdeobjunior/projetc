import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { useApp } from "../state/store";
import { formatCount } from "../manuscript/wordCount";
import type { VaultRef } from "../platform";
import { Icon } from "./Icon";
import { Settings } from "./Settings";
import { AppBar, HomeSidebar, folderName, useHomeNav } from "./HomeNav";
import { NewProjectDialog } from "./NewProjectDialog";
import { cssUrl } from "./bgImage";
import { useSync } from "../state/sync";
import { useSettings } from "../state/settings";
import { useFolderSyncStatus } from "../state/syncStatus";
import type { RemoteProject } from "../sync/drive";
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
  const openVault = useApp((s) => s.openVault);
  const createTestBook = useApp((s) => s.createTestBook);
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
  const [confirming, setConfirming] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [quoteOffset, setQuoteOffset] = useState(0);
  const desktop = platform?.kind === "desktop";
  const nav = useHomeNav();

  const recent = useMemo(
    () => [...vaults].sort((a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0)),
    [vaults],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("pt-BR");
    return q ? recent.filter((v) => v.title.toLocaleLowerCase("pt-BR").includes(q)) : recent;
  }, [recent, query]);
  const current = recent.find((v) => v.root === selected) ?? recent[0] ?? null;
  const background = useHomeBackground();
  const sync = useFolderSyncStatus(platform, current?.root ?? null);

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
    <div
      className={"projects bg-" + background.kind + (nav.collapsed ? " nav-collapsed" : "")}
      style={background.style}
    >
      <AppBar
        collapsed={nav.collapsed}
        onToggle={nav.toggle}
        folder={current ? folderName(current, desktop) : null}
        folderTitle={current?.location}
        onEditName={() => setSettings(true)}
        sync={sync}
      />
      <div className="projects-body">
        <HomeSidebar
          collapsed={nav.collapsed}
          onToggle={nav.toggle}
          desktop={desktop}
          busy={busy}
          vaults={filtered}
          emptyText={query && filtered.length === 0 ? `Nenhum projeto com “${query}”.` : undefined}
          activeRoot={current?.root ?? null}
          onSelect={setSelected}
          onOpen={(root) => void openVault(root)}
          onCreate={() => setCreating(true)}
          onCreateTestBook={
            import.meta.env.DEV
              ? () =>
                  void createTestBook().then((r) => {
                    if (r.ok) {
                      setQuery("");
                      setSelected(r.root);
                    }
                  })
              : undefined
          }
          onOpenFolder={() => void openExistingFolder()}
          onSettings={() => setSettings(true)}
        />
        {!nav.collapsed && (
          <div className="home-nav-scrim" aria-hidden="true" onClick={nav.toggle} />
        )}
        <main className="projects-content">
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
                <label className="projects-search">
                  <Icon name="search" size={15} />
                  <span className="sr-only">Buscar projeto</span>
                  <input
                    type="search"
                    value={query}
                    placeholder="Buscar por título…"
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
              </div>
            </header>

            {!desktop && (
              <p className="notice">
                {platform?.persistent === false
                  ? "Prévia no navegador: este navegador não permite guardar dados, então os projetos somem ao fechar a página."
                  : "Prévia no navegador: os projetos ficam guardados só neste navegador. No app desktop, cada projeto é uma pasta no seu computador."}
              </p>
            )}

            {folderToConvert && (
              <div className="panel convert" role="alertdialog" aria-labelledby="convert-title">
                <p id="convert-title">
                  A pasta <b>{folderToConvert.name}</b> ainda não é um projeto do InkFlow.
                </p>
                <p className="muted">
                  Você pode transformá-la em um projeto: o InkFlow cria dentro dela as pastas{" "}
                  <code>manuscrito</code> e <code>.inkflow</code> e o arquivo{" "}
                  <code>LEIA-ME.md</code>. Os arquivos que já estão lá não são alterados.
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
                  <BookPreview key={current.root} vault={current} stats={stats[current.root]} />
                ) : (
                  <div className="panel empty-library">
                    <h2>Sua biblioteca está vazia</h2>
                    <p className="muted">Crie o primeiro livro para começar.</p>
                    <button type="button" className="pbtn accent" onClick={() => setCreating(true)}>
                      <Icon name="plus" size={15} /> Novo projeto
                    </button>
                  </div>
                )}
              </div>

              <aside className="projects-side">
                <DriveProjects />

                {current && (
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
                )}

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
        </main>
      </div>
      {creating && (
        <NewProjectDialog
          desktop={desktop}
          onClose={() => setCreating(false)}
          onCreated={(root) => {
            setCreating(false);
            setQuery("");
            setSelected(root);
          }}
        />
      )}
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
      <p className="kicker">Projeto selecionado</p>
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

/** Primeira frase do texto, usada como epígrafe embaixo do livro. */
function firstSentence(text: string): string {
  const m = /^[\s\S]*?[.!?…](?=\s|$)/.exec(text);
  const s = (m ? m[0] : text).replace(/\s+/g, " ").trim();
  return s.length > 90 ? s.slice(0, 90).trimEnd() + "…" : s;
}

/** Graus de giro por pixel arrastado: 720px de arrasto dão uma volta inteira. */
const DEG_PER_PX = 0.5;
/** Ângulo de descanso do livro (o mesmo de antes do giro existir). */
const REST_Y = -32;

/** O livro em 3D, fechado, como sai da diagramação. */
function BookPreview({
  vault,
  stats,
}: {
  vault: VaultRef;
  stats: ProjectStats | null | undefined;
}) {
  const style = { "--hue": coverHue(vault.title) } as CSSProperties;
  const line = stats?.excerpt ? firstSentence(stats.excerpt) : "";
  // Giro em torno do eixo vertical, arrastando na horizontal. O livro não sai
  // do lugar: só o ângulo muda, e ao soltar ele para onde está. O ângulo vai
  // direto no estilo, sem re-renderizar o React a cada movimento.
  const body = useRef<HTMLDivElement>(null);
  const angle = useRef(REST_Y);
  const drag = useRef<{ id: number; x: number; from: number } | null>(null);

  const apply = (deg: number) => {
    angle.current = deg;
    body.current?.style.setProperty("--ry", `${deg}deg`);
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault(); // não seleciona texto nem arrasta a imagem
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.classList.add("dragging");
    drag.current = { id: e.pointerId, x: e.clientX, from: angle.current };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d?.id !== e.pointerId) return;
    apply(d.from + (e.clientX - d.x) * DEG_PER_PX);
  };
  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    e.currentTarget.classList.remove("dragging");
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    apply(angle.current + (e.key === "ArrowRight" ? 15 : -15));
  };
  return (
    <figure className="book-preview">
      <div
        className="book3d"
        style={style}
        role="img"
        aria-label={`Capa de ${vault.title}. Arraste para os lados ou use as setas para girar o livro.`}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onLostPointerCapture={onPointerEnd}
        onKeyDown={onKeyDown}
      >
        <div className="book3d-body" ref={body}>
          <div className="book3d-face book3d-back" />
          <div className="book3d-face book3d-pages" />
          <div className="book3d-face book3d-top" />
          <div className="book3d-face book3d-spine">
            <span>{vault.title}</span>
          </div>
          <div className="book3d-face book3d-front">
            <Cover title={vault.title} size="lg" />
          </div>
        </div>
        <div className="book3d-shadow" />
      </div>
      <figcaption>{line ? `“${line}”` : "Este livro ainda não tem texto."}</figcaption>
    </figure>
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

/** Projetos que estão no Google Drive, para baixar neste computador. */
function DriveProjects() {
  const available = useSync((s) => s.available);
  const account = useSync((s) => s.account);
  const busy = useSync((s) => s.busy);
  const error = useSync((s) => s.error);
  const listRemote = useSync((s) => s.listRemote);
  const download = useSync((s) => s.download);
  const vaults = useApp((s) => s.vaults);
  const [list, setList] = useState<RemoteProject[] | null>(null);
  const [loading, setLoading] = useState(false);
  if (!available || !account) return null;

  const load = async () => {
    setLoading(true);
    try {
      setList(await listRemote());
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel" aria-labelledby="drive-title">
      <h2 id="drive-title" className="kicker">
        No Google Drive
      </h2>
      {list === null ? (
        <button type="button" className="pbtn" disabled={loading} onClick={() => void load()}>
          <Icon name="cloud" size={15} /> {loading ? "Procurando…" : "Ver projetos no Drive"}
        </button>
      ) : list.length === 0 ? (
        <p className="muted small">Nenhum projeto sincronizado no Drive desta conta ainda.</p>
      ) : (
        <ul className="drive-list">
          {list.map((r) => (
            <li key={r.folderId}>
              <span>
                <b>{r.title}</b>
                <small>
                  {vaults.some((v) => v.title === r.title)
                    ? "Já existe um projeto com esse nome aqui"
                    : "Ainda não está neste computador"}
                </small>
              </span>
              <button
                type="button"
                className="pbtn"
                disabled={busy}
                onClick={() => void download(r)}
              >
                Baixar
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="small warn">{error}</p>}
    </section>
  );
}

/** Fundo escolhido nas Configurações; sem imagem guardada, volta ao céu noturno. */
function useHomeBackground() {
  const kind = useSettings((s) => s.homeBg);
  const color = useSettings((s) => s.homeBgColor);
  const dim = useSettings((s) => s.homeBgDim);
  const image = useSettings((s) => s.homeBgImage);
  if (kind === "imagem" && !image) return { kind: "ceu", style: undefined };
  const style = {
    "--home-bg-color": color,
    "--home-bg-dim": `${dim}%`,
    ...(image && kind === "imagem" ? { "--home-bg-image": cssUrl(image) } : {}),
  } as CSSProperties;
  return { kind, style };
}
