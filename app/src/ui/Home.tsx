import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useApp } from "../state/store";
import { formatCount } from "../manuscript/wordCount";
import type { VaultRef } from "../platform";
import { Icon } from "./Icon";
import { Settings, type SettingsTab } from "./Settings";
import { AppBar, HomeSidebar, folderName, useHomeNav } from "./HomeNav";
import { NewProjectDialog } from "./NewProjectDialog";
import { BookScene, paginate } from "./BookScene";
import { Shelf, useCovers } from "./Shelf";
import { EloGlobe } from "./EloGlobe";
import { RadioButton } from "./Music";
import { getMiniBook, peekMiniBook, prepareMiniBook } from "../book/miniBook";
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
  // A pasta ativa fica no estado do app (e guardada): o app volta para ela ao abrir.
  const selected = useApp((s) => s.activeFolder);
  const setSelected = useApp((s) => s.setActiveFolder);
  const [creating, setCreating] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [settings, setSettings] = useState<SettingsTab | null>(null);
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
              onClick={() => setSettings(null)}
            >
              <Icon name="back" />
            </button>
            <h1 className="brand-text">Configurações</h1>
          </header>
          <Settings initialTab={settings} />
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
        onEditName={() => setSettings("geral")}
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
          onSettings={() => setSettings("geral")}
          onMusicSettings={() => setSettings("musica")}
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
                <div className="projects-orbs">
                  <EloGlobe vault={current} />
                  <RadioButton />
                </div>
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

            <Inspiration offset={quoteOffset} onNext={() => setQuoteOffset((n) => n + 1)} />

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
                  A pasta <b>{folderToConvert.name}</b> ainda não é um projeto da Tália.
                </p>
                <p className="muted">
                  Você pode transformá-la em um projeto: a Tália cria dentro dela as pastas{" "}
                  <code>manuscrito</code> e <code>.talia</code> e o arquivo <code>LEIA-ME.md</code>.
                  Os arquivos que já estão lá não são alterados.
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

            {current ? (
              <section className="home-hero" aria-label="Continuar escrevendo">
                <BookPreview key={current.root} vault={current} stats={stats[current.root]} />
                <SelectedCard
                  vault={current}
                  stats={stats[current.root]}
                  goal={goals[current.root]}
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
              </section>
            ) : (
              <div className="panel empty-library">
                <h2>Sua biblioteca está vazia</h2>
                <p className="muted">Crie o primeiro livro para começar.</p>
                <button type="button" className="pbtn accent" onClick={() => setCreating(true)}>
                  <Icon name="plus" size={15} /> Novo projeto
                </button>
              </div>
            )}

            <div className="home-row">
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
            </div>

            <Shelf
              platform={platform}
              vaults={filtered}
              stats={stats}
              goals={goals}
              activeRoot={current?.root ?? null}
              query={query}
              onSelect={setSelected}
              onOpen={(root) => void openVault(root)}
              onCreate={() => setCreating(true)}
            />

            <DriveProjects />
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
  goal: number | undefined;
  busy: boolean;
  desktop: boolean;
  confirming: boolean;
  onOpen(): void;
  onAskRemove(): void;
  onCancelRemove(): void;
  onRemove(): void;
}) {
  const { vault, stats, desktop, goal } = props;
  const words = stats?.words ?? 0;
  const pct = goal ? Math.min(100, Math.round((words / goal) * 100)) : 0;
  return (
    <div className="panel selected" aria-labelledby="selected-title">
      <p className="kicker">Continuar escrevendo</p>
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
      {goal ? (
        <div className="hero-goal">
          <div className="goal-row">
            <span>{formatCount(words)} palavras</span>
            <span className="faint">meta {formatCount(goal)}</span>
          </div>
          <span className="bar">
            <span style={{ width: `${pct}%` }} />
          </span>
        </div>
      ) : null}
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
    </div>
  );
}

/** Primeira frase do texto, usada como epígrafe embaixo do livro. */
function firstSentence(text: string): string {
  const m = /^[\s\S]*?[.!?…](?=\s|$)/.exec(text);
  const s = (m ? m[0] : text).replace(/\s+/g, " ").trim();
  return s.length > 90 ? s.slice(0, 90).trimEnd() + "…" : s;
}

/**
 * O livro em 3D, fechado, como sai da diagramação. Arrastar gira; clicar abre
 * a capa e mostra o miolo diagramado, para folhear. O miolo é pré-carregado
 * quando a tela fica ociosa (ou quando o mouse chega no livro), então o clique
 * costuma abrir na hora.
 */
function BookPreview({
  vault,
  stats,
}: {
  vault: VaultRef;
  stats: ProjectStats | null | undefined;
}) {
  const platform = useApp((s) => s.platform);
  const hue = coverHue(vault.title);
  const line = stats?.excerpt ? firstSentence(stats.excerpt) : "";
  // Capa, quarta capa e lombada do projeto gráfico (arte pronta ou o desenho do app).
  const faces = useCovers(platform, vault, stats);
  // A versão entra na chave: depois de editar o projeto, o miolo é refeito.
  const key = `${vault.root}:${stats?.updatedAt ?? 0}`;
  const [ready, setReady] = useState(() => peekMiniBook(key));
  const load = useCallback(() => {
    if (!platform) return Promise.reject(new Error("sem plataforma"));
    const p = getMiniBook(key, () =>
      prepareMiniBook(platform.fs(vault.root)).then((b) => {
        paginate(b);
        return b;
      }),
    );
    p.then(setReady, () => undefined);
    return p;
  }, [platform, key, vault.root]);
  const prefetch = useCallback(() => void load().catch(() => undefined), [load]);

  // Pré-carrega quando o navegador estiver ocioso, depois que os números do
  // projeto chegaram (eles dão a versão).
  useEffect(() => {
    if (stats === undefined || peekMiniBook(key)) return;
    // O WebKit do macOS ainda não tem requestIdleCallback.
    if (!("requestIdleCallback" in window)) {
      const id = setTimeout(prefetch, 800);
      return () => clearTimeout(id);
    }
    const id = window.requestIdleCallback(prefetch, { timeout: 2500 });
    return () => window.cancelIdleCallback(id);
  }, [stats, key, prefetch]);

  return (
    <BookScene
      title={vault.title}
      hue={hue}
      cover={<Cover title={vault.title} size="lg" />}
      faces={faces}
      caption={line ? `“${line}”` : "Este livro ainda não tem texto."}
      ready={ready}
      load={load}
      prefetch={prefetch}
    />
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

/**
 * Fundo da tela inicial: liso (só a cor da paleta) ou a imagem do usuário,
 * que vale em qualquer paleta.
 */
function useHomeBackground(): { kind: string; style: CSSProperties | undefined } {
  const kind = useSettings((s) => s.homeBg);
  const dim = useSettings((s) => s.homeBgDim);
  const image = useSettings((s) => s.homeBgImage);
  if (kind === "imagem" && image)
    return {
      kind,
      style: { "--home-bg-dim": `${dim}%`, "--home-bg-image": cssUrl(image) } as CSSProperties,
    };
  return { kind: "paleta", style: undefined };
}
