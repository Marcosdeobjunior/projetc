import { useState } from "react";
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
import { ThemeToggle } from "./ThemeToggle";
import { Icon } from "./Icon";

export function Workspace({ session }: { session: Session }) {
  const change = useApp((s) => s.change);
  const saveState = useApp((s) => s.saveState);
  const setView = useApp((s) => s.setView);
  const [navOpen, setNavOpen] = useState(false);
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

  return (
    <div className={"workspace" + (navOpen ? " nav-open" : "")}>
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
        </div>
        <div className="side-meta">
          <span className="project-total">{formatCount(total)} palavras</span>
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

        <div className="side-scroll">
          <ManuscriptTree session={session} onOpenScene={closeNav} />
          <NotesTree session={session} onOpen={closeNav} />
        </div>

        <div className="side-foot">
          <ThemeToggle />
        </div>
      </aside>

      <div className="scrim" onClick={closeNav} />

      <main className="main">
        <header className="main-head">
          <button
            type="button"
            className="icon-btn nav-toggle"
            aria-label="Abrir menu"
            onClick={() => setNavOpen(true)}
          >
            <Icon name="menu" />
          </button>
          {view === "graph" ? (
            <div className="crumbs">
              <span className="crumb-title">Grafo de conexões</span>
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
          {view === "graph" ? (
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
