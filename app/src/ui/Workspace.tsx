import { useState } from "react";
import { useApp, type Session } from "../state/store";
import { findScene, renameProject, renameScene } from "../manuscript/tree";
import { formatCount } from "../manuscript/wordCount";
import { SceneEditor } from "../editor/SceneEditor";
import { ManuscriptTree } from "./ManuscriptTree";
import { InlineEdit } from "./InlineEdit";
import { ThemeToggle } from "./ThemeToggle";
import { Icon, Quill } from "./Icon";
import { renameSceneAndHeader } from "../state/store";

export function Workspace({ session }: { session: Session }) {
  const closeVault = useApp((s) => s.closeVault);
  const change = useApp((s) => s.change);
  const saveState = useApp((s) => s.saveState);
  const [navOpen, setNavOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(false);
  const [editingScene, setEditingScene] = useState(false);

  const { project, words, activeSceneId } = session;
  const active = activeSceneId ? findScene(project, activeSceneId) : null;
  // Soma só as cenas que estão no manuscrito (cenas excluídas ficam fora).
  const total = project.chapters.reduce(
    (n, c) => n + c.scenes.reduce((m, s) => m + (words[s.id] ?? 0), 0),
    0,
  );
  const chapterTotal = active
    ? active.chapter.scenes.reduce((n, s) => n + (words[s.id] ?? 0), 0)
    : 0;

  return (
    <div className={"workspace" + (navOpen ? " nav-open" : "")}>
      <aside className="sidebar">
        <div className="side-top">
          <button
            type="button"
            className="back-btn"
            onClick={closeVault}
            title="Voltar para a lista de projetos"
          >
            <Quill size={22} />
            <span>Projetos</span>
          </button>
          <button
            type="button"
            className="icon-btn nav-close"
            aria-label="Fechar menu"
            onClick={() => setNavOpen(false)}
          >
            <Icon name="close" />
          </button>
        </div>

        <div className="project-name">
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
            <h1
              onDoubleClick={() => setEditingProject(true)}
              title="Clique duas vezes para renomear"
            >
              {project.title}
            </h1>
          )}
          <p className="project-total">{formatCount(total)} palavras</p>
        </div>

        <ManuscriptTree session={session} onOpenScene={() => setNavOpen(false)} />

        <div className="side-foot">
          <ThemeToggle />
        </div>
      </aside>

      <div className="scrim" onClick={() => setNavOpen(false)} />

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
          {active ? (
            <div className="crumbs">
              <span className="crumb-chapter">{active.chapter.title}</span>
              <span aria-hidden="true">/</span>
              {editingScene ? (
                <InlineEdit
                  value={active.scene.title}
                  label="Nome da cena"
                  onCommit={(t) => {
                    setEditingScene(false);
                    void renameSceneAndHeader(
                      (p) => renameScene(p, active.scene.id, t),
                      active.scene.id,
                    );
                  }}
                  onCancel={() => setEditingScene(false)}
                />
              ) : (
                <button
                  type="button"
                  className="crumb-scene"
                  onClick={() => setEditingScene(true)}
                  title="Renomear cena"
                >
                  {active.scene.title}
                </button>
              )}
            </div>
          ) : (
            <div className="crumbs" />
          )}
          <SaveIndicator state={saveState} />
        </header>

        <section className="editor-area">
          {active ? (
            <SceneEditor key={active.scene.id} session={session} sceneId={active.scene.id} />
          ) : (
            <div className="editor-state">
              <p>Nenhuma cena aberta.</p>
              <p className="muted">
                Crie um capítulo ou uma cena na barra lateral para começar a escrever.
              </p>
            </div>
          )}
        </section>

        {active && (
          <footer className="status">
            <span>
              Cena <b>{formatCount(words[active.scene.id] ?? 0)}</b>
            </span>
            <span>
              Capítulo <b>{formatCount(chapterTotal)}</b>
            </span>
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
