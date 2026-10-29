import { useEffect, useState } from "react";
import { renameDocAndLinks, useApp, type Session } from "../state/store";
import { findDoc, findScene, renameDoc, renameProject } from "../manuscript/tree";
import { formatCount } from "../manuscript/wordCount";
import { KIND_LABEL } from "../links/context";
import { DocEditor } from "../editor/DocEditor";
import { ManuscriptTree } from "./ManuscriptTree";
import { NotesTree } from "./NotesTree";
import { GraphView } from "./GraphView";
import { VaultSwitcher } from "./VaultSwitcher";
import { InlineEdit } from "./InlineEdit";
import { Settings } from "./Settings";
import { SearchPanel } from "./SearchPanel";
import { AttachmentsTree } from "./AttachmentsTree";
import { useSearch } from "../state/search";
import { Icon } from "./Icon";
import { shortcut } from "../editor/formatting";

const COLLAPSED_KEY = "inkflow.sidebarCollapsed";
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
  const [navOpen, setNavOpen] = useState(false);
  const searching = useSearch((s) => s.open);
  /** Barra lateral recolhida no computador (no celular ela é uma gaveta). */
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [editingProject, setEditingProject] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);

  const { project, words, activeDocId, view } = session;
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

  const openSearch = () => {
    useSearch.getState().show();
    if (isPhone()) setNavOpen(true);
    else setCollapsed(false);
  };

  // Ctrl/⌘ + \ mostra ou esconde a barra lateral; Ctrl/⌘ + Shift + F abre a busca.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
            aria-label="Fechar menu"
            onClick={closeNav}
          >
            <Icon name="close" />
          </button>
          <button
            type="button"
            className="icon-btn nav-collapse"
            aria-label="Recolher menu"
            title={`Recolher menu (${shortcut("Mod+\\")})`}
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
            className={"icon-btn sm" + (view === "history" ? " on" : "")}
            aria-pressed={view === "history"}
            title="Histórico de versões"
            aria-label="Histórico de versões"
            onClick={() => {
              setView(view === "history" ? "editor" : "history");
              closeNav();
            }}
          >
            <Icon name="history" size={16} />
          </button>
          <button
            type="button"
            className={"graph-btn" + (view === "graph" ? " on" : "")}
            aria-pressed={view === "graph"}
            onClick={() => {
              setView(view === "graph" ? "editor" : "graph");
              closeNav();
            }}
          >
            <Icon name="graph" size={16} /> Grafo
          </button>
        </div>

        {searching ? (
          <SearchPanel session={session} onOpen={closeNav} />
        ) : (
          <div className="side-scroll">
            <ManuscriptTree session={session} onOpenScene={closeNav} />
            <NotesTree session={session} onOpen={closeNav} />
            <AttachmentsTree session={session} />
          </div>
        )}

        <div className="side-foot">
          <button
            type="button"
            className={"foot-btn" + (view === "settings" ? " on" : "")}
            aria-pressed={view === "settings"}
            onClick={() => {
              setView(view === "settings" ? "editor" : "settings");
              closeNav();
            }}
          >
            <Icon name="settings" size={17} /> Configurações
          </button>
        </div>
      </aside>

      <div className="scrim" onClick={closeNav} />

      <main className="main">
        <header className="main-head">
          <button
            type="button"
            className="icon-btn nav-toggle"
            aria-label="Mostrar menu"
            title={`Mostrar menu (${shortcut("Mod+\\")})`}
            onClick={showNav}
          >
            <Icon name="sidebar" />
          </button>
          {view !== "editor" ? (
            <div className="crumbs">
              <span className="crumb-title">
                {view === "graph" ? "Grafo de conexões" : "Configurações"}
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
            <SaveIndicator state={saveState} />
          )}
        </header>

        <section className="editor-area">
          {view === "graph" ? (
            <GraphView session={session} />
          ) : view === "settings" ? (
            <Settings />
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
