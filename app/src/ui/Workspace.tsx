import { useEffect, useState } from "react";
import { renameDocAndLinks, useApp, type Session } from "../state/store";
import { findDoc, findScene, renameDoc, renameProject } from "../manuscript/tree";
import { formatCount } from "../manuscript/wordCount";
import { KIND_LABEL } from "../links/context";
import { DocEditor } from "../editor/DocEditor";
import { ManuscriptTree } from "./ManuscriptTree";
import { GraphView } from "./GraphView";
import { WorldView } from "./WorldView";
import { VaultSwitcher } from "./VaultSwitcher";
import { InlineEdit } from "./InlineEdit";
import { Settings, type SettingsTab } from "./Settings";
import { SearchPanel } from "./SearchPanel";
import { GalleryView } from "./GalleryView";
import { HistoryView } from "./HistoryView";
import { TrashView } from "./TrashView";
import { useSearch } from "../state/search";
import { useSync } from "../state/sync";
import { useSettings } from "../state/settings";
import { Icon } from "./Icon";
import { MusicFloating } from "./Music";
import { shortcut } from "../editor/formatting";

const COLLAPSED_KEY = "talia.sidebarCollapsed";
const VERSION_EVERY_MS = 10 * 60 * 1000;
const isPhone = () => window.matchMedia("(max-width: 760px)").matches;

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function Workspace({ session }: { session: Session }) {
  const change = useApp((s) => s.change);
  const saveState = useApp((s) => s.saveState);
  const setView = useApp((s) => s.setView);
  /** Aba pedida ao abrir as Configurações por um atalho (o player abre em Música). */
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const searching = useSearch((s) => s.open);
  /** Barra lateral recolhida no computador (no celular ela é uma gaveta). */
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [editingProject, setEditingProject] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);

  const { project, words, activeDocId, view } = session;
  /** Painel do Manuscrito, ao lado da barra (lembrado entre aberturas). */
  const panelOpen = !useSettings((s) => s.collapsed.includes("manuscrito"));
  const toggleSection = useSettings((s) => s.toggleSection);
  /** Sem texto aberto: abre a primeira cena do livro (ou só mostra o editor vazio). */
  const openFirstScene = () => {
    const first = project.chapters.find((c) => c.scenes.length)?.scenes[0];
    if (first) useApp.getState().openDoc(first.id);
    else setView("editor");
  };
  /** Os outros botões da barra recolhem o painel do Manuscrito. */
  const closePanel = () => {
    if (panelOpen) toggleSection("manuscrito");
  };
  const active = activeDocId ? findDoc(project, activeDocId) : null;
  const scene = activeDocId ? findScene(project, activeDocId) : null;
  // Soma só as cenas que estão no manuscrito (notas e cenas excluídas ficam fora).
  const total = project.chapters.reduce(
    (n, c) => n + c.scenes.reduce((m, s) => m + (words[s.id] ?? 0), 0),
    0,
  );
  const chapterTotal = scene ? scene.chapter.scenes.reduce((n, s) => n + (words[s.id] ?? 0), 0) : 0;
  const closeNav = () => setNavOpen(false);
  const showNav = () => (isPhone() ? setNavOpen(true) : setCollapsed(false));

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      // sem armazenamento: vale só nesta sessão
    }
  }, [collapsed]);

  // Sincronização com o Drive: ao abrir o projeto e de tempos em tempos.
  const syncEvery = useSettings((s) => s.syncEvery);
  useEffect(() => {
    void useSync.getState().attach();
  }, []);
  useEffect(() => {
    if (!syncEvery) return;
    const t = window.setInterval(() => {
      const { enabled, account, syncNow } = useSync.getState();
      if (enabled && account) void syncNow();
    }, syncEvery * 60_000);
    return () => window.clearInterval(t);
  }, [syncEvery]);

  // A cada 10 minutos guarda uma versão no histórico (só se algo mudou).
  useEffect(() => {
    const t = window.setInterval(
      () => void useApp.getState().saveVersion("Automática", true),
      VERSION_EVERY_MS,
    );
    return () => window.clearInterval(t);
  }, []);

  const openSearch = () => {
    useSearch.getState().show();
    if (isPhone()) setNavOpen(true);
    else setCollapsed(false);
  };

  // Ctrl/⌘ + \ mostra ou esconde a barra lateral; Ctrl/⌘ + Shift + F abre a busca.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Esc fecha a gaveta do menu (telas pequenas).
      if (e.key === "Escape") setNavOpen(false);
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.shiftKey && e.code === "KeyF") {
        e.preventDefault();
        openSearch();
        return;
      }
      if (e.key !== "\\" || isPhone()) return;
      e.preventDefault();
      setCollapsed((c) => !c);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      className={"workspace" + (navOpen ? " nav-open" : "") + (collapsed ? " nav-collapsed" : "")}
    >
      <aside className="sidebar">
        <div className="rail">
          <div className="side-top">
            {editingProject ? (
              <InlineEdit
                value={project.title}
                label="Nome do projeto"
                className="big"
                onCommit={(t) => {
                  setEditingProject(false);
                  void change((p) => ({ project: renameProject(p, t), ops: [] }));
                }}
                onCancel={() => setEditingProject(false)}
              />
            ) : (
              <VaultSwitcher session={session} onRename={() => setEditingProject(true)} />
            )}
            <button
              type="button"
              className="icon-btn nav-close"
              aria-label="Fechar a barra lateral"
              onClick={closeNav}
            >
              <Icon name="close" />
            </button>
            <button
              type="button"
              className="icon-btn nav-collapse"
              aria-label="Recolher a barra lateral"
              title={`Recolher a barra lateral (${shortcut("Mod+\\")})`}
              onClick={() => setCollapsed(true)}
            >
              <Icon name="sidebar" />
            </button>
          </div>
          <div className="side-meta">
            <span className="project-total">{formatCount(total)} palavras</span>
            <button
              type="button"
              className={"icon-btn sm" + (searching ? " on" : "")}
              aria-pressed={searching}
              title={`Buscar no projeto (${shortcut("Mod+Shift+F")})`}
              aria-label="Buscar no projeto"
              onClick={() => (searching ? useSearch.getState().close() : openSearch())}
            >
              <Icon name="search" size={16} />
            </button>
            <button
              type="button"
              className={"icon-btn sm" + (view === "graph" ? " on" : "")}
              aria-pressed={view === "graph"}
              title="Elo: grafo de conexões entre os textos"
              aria-label="Elo"
              onClick={() => {
                closePanel();
                setView(view === "graph" ? "editor" : "graph");
                closeNav();
              }}
            >
              <Icon name="planet" size={16} />
            </button>
          </div>
          <nav className="rail-nav" aria-label="Seções do projeto">
            <button
              type="button"
              className="rail-item"
              aria-expanded={panelOpen}
              aria-controls="side-panel"
              title="Mostrar ou esconder os capítulos e cenas"
              onClick={() => {
                if (searching) useSearch.getState().close();
                // Fora do texto (Mundo, Anexos, Elo…): volta para a escrita e mostra os
                // capítulos. Já no texto: só abre ou fecha o painel.
                if (view !== "editor") {
                  if (!panelOpen) toggleSection("manuscrito");
                  if (activeDocId) setView("editor");
                  else openFirstScene();
                  return;
                }
                if (!panelOpen && !activeDocId) openFirstScene();
                toggleSection("manuscrito");
              }}
            >
              <Icon name="book" size={17} />
              <span>Manuscrito</span>
            </button>
            {(
              [
                ["attachments", "image", "Anexos", "Galeria de imagens, vídeos e arquivos"],
                ["world", "globe", "Mundo", "Personagens, lugares e ideias do projeto"],
              ] as const
            ).map(([v, icon, label, title]) => (
              <button
                key={v}
                type="button"
                className={"rail-item" + (view === v ? " on" : "")}
                aria-pressed={view === v}
                title={title}
                onClick={() => {
                  closePanel();
                  setView(view === v ? "editor" : v);
                  closeNav();
                }}
              >
                <Icon name={icon} size={17} />
                <span>{label}</span>
              </button>
            ))}
          </nav>

          <div className="rail-spacer" />
          <div className="side-foot">
            {(["settings", "trash"] as const).map((v) => (
              <button
                key={v}
                type="button"
                className={"foot-btn" + (view === v ? " on" : "")}
                aria-pressed={view === v}
                onClick={() => {
                  closePanel();
                  setSettingsTab(null);
                  setView(view === v ? "editor" : v);
                  closeNav();
                }}
              >
                <Icon name={v === "settings" ? "settings" : "trash"} size={17} />
                <span>{v === "settings" ? "Configurações" : "Lixeira"}</span>
              </button>
            ))}
            <MusicFloating
              onSettings={() => {
                setSettingsTab("musica");
                setView("settings");
                closeNav();
              }}
            />
          </div>
        </div>

        {(panelOpen || searching) && (
          <div id="side-panel" className="side-panel">
            {searching ? (
              <SearchPanel session={session} onOpen={closeNav} />
            ) : (
              <div className="side-scroll">
                <ManuscriptTree session={session} onOpenScene={closeNav} />
              </div>
            )}
          </div>
        )}
      </aside>

      <div className="scrim" onClick={closeNav} />

      <main className="main">
        <header className="main-head">
          <button
            type="button"
            className="icon-btn nav-toggle"
            aria-label="Mostrar a barra lateral"
            title={`Mostrar a barra lateral (${shortcut("Mod+\\")})`}
            onClick={showNav}
          >
            <Icon name="sidebar" />
          </button>
          {view !== "editor" ? (
            <div className="crumbs">
              <span className="crumb-title">
                {view === "graph"
                  ? "Elo"
                  : view === "world"
                    ? "Mundo"
                    : view === "attachments"
                      ? "Anexos"
                      : view === "history"
                        ? "Histórico de versões"
                        : view === "trash"
                          ? "Lixeira"
                          : "Configurações"}
              </span>
            </div>
          ) : active ? (
            <div className="crumbs">
              <span className="crumb-chapter">
                {scene
                  ? scene.chapter.title
                  : KIND_LABEL[active.type as keyof typeof KIND_LABEL].many}
              </span>
              <span aria-hidden="true">/</span>
              {editingTitle ? (
                <InlineEdit
                  value={active.title}
                  label="Nome do texto"
                  onCommit={(t) => {
                    setEditingTitle(false);
                    void renameDocAndLinks((p) => renameDoc(p, active.id, t), active.id);
                  }}
                  onCancel={() => setEditingTitle(false)}
                />
              ) : (
                <button
                  type="button"
                  className="crumb-scene"
                  onClick={() => setEditingTitle(true)}
                  title="Renomear"
                >
                  {active.title}
                </button>
              )}
            </div>
          ) : (
            <div className="crumbs" />
          )}
          {view !== "editor" ? (
            <button type="button" className="btn ghost sm" onClick={() => setView("editor")}>
              Voltar ao texto
            </button>
          ) : (
            <>
              <SyncIndicator onOpen={() => setView("settings")} />
              <SaveIndicator state={saveState} />
            </>
          )}
        </header>

        <section className="editor-area">
          {view === "graph" ? (
            <GraphView session={session} />
          ) : view === "world" ? (
            <WorldView session={session} />
          ) : view === "attachments" ? (
            <GalleryView session={session} />
          ) : view === "settings" ? (
            <Settings key={settingsTab ?? ""} initialTab={settingsTab ?? undefined} />
          ) : view === "history" ? (
            <HistoryView session={session} />
          ) : view === "trash" ? (
            <TrashView session={session} />
          ) : active ? (
            <DocEditor key={active.id} session={session} sceneId={active.id} />
          ) : (
            <div className="editor-state">
              <p>Nenhum texto aberto.</p>
              <p className="muted">
                Crie um capítulo, uma cena ou uma nota na barra lateral para começar a escrever.
              </p>
            </div>
          )}
        </section>

        {view === "editor" && active && (
          <footer className="status">
            <span>
              {scene ? "Cena" : "Nota"} <b>{formatCount(words[active.id] ?? 0)}</b>
            </span>
            {scene && (
              <span>
                Capítulo <b>{formatCount(chapterTotal)}</b>
              </span>
            )}
            <span>
              Livro <b>{formatCount(total)}</b>
            </span>
          </footer>
        )}
      </main>
    </div>
  );
}

function SaveIndicator({ state }: { state: string }) {
  const text =
    state === "saving"
      ? "Salvando…"
      : state === "saved"
        ? "Salvo"
        : state === "error"
          ? "Não foi possível salvar"
          : "";
  return (
    <span className={"save " + state} role="status" aria-live="polite">
      {state === "saved" && <Icon name="check" size={14} />}
      {text}
    </span>
  );
}

function SyncIndicator({ onOpen }: { onOpen: () => void }) {
  const { enabled, account, status, lastSync, error } = useSync();
  if (!enabled || !account) return null;
  const label =
    status === "syncing"
      ? "Sincronizando com o Drive…"
      : status === "error"
        ? `Não foi possível sincronizar: ${error ?? ""}`
        : lastSync
          ? `Sincronizado com o Drive às ${new Date(lastSync).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
          : "Sincronização ligada";
  return (
    <button
      type="button"
      className={"sync-indicator " + status}
      title={label}
      aria-label={label}
      onClick={onOpen}
    >
      <Icon
        name={status === "error" ? "cloudOff" : status === "syncing" ? "sync" : "cloud"}
        size={17}
      />
    </button>
  );
}
