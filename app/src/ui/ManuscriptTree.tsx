import { useState, type DragEvent } from "react";
import { renameDocAndLinks, useApp, type Session } from "../state/store";
import {
  addChapter,
  addScene,
  moveChapter,
  moveScene,
  removeChapter,
  removeScene,
  renameChapter,
  renameScene,
} from "../manuscript/tree";
import type { Chapter, Scene } from "../manuscript/types";
import { formatCount } from "../manuscript/wordCount";
import { Icon } from "./Icon";
import { InlineEdit } from "./InlineEdit";
import { useSettings, type SectionId } from "../state/settings";

type Drag = { kind: "scene" | "chapter"; id: string } | null;
type DropMark = { id: string; where: "before" | "after" | "inside" } | null;

/** Capítulos e cenas do manuscrito: abrir, criar, renomear, excluir e reordenar. */
export function ManuscriptTree({
  session,
  onOpenScene,
}: {
  session: Session;
  onOpenScene: () => void;
}) {
  const change = useApp((s) => s.change);
  const openDoc = useApp((s) => s.openDoc);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<Drag>(null);
  const [mark, setMark] = useState<DropMark>(null);
  const { project, words, activeDocId } = session;
  const sectionOpen = !useSettings((s) => s.collapsed.includes("manuscrito"));

  const chapterWords = (c: Chapter) => c.scenes.reduce((n, s) => n + (words[s.id] ?? 0), 0);

  const newScene = (chapterId: string) => {
    const count = project.chapters.find((c) => c.id === chapterId)?.scenes.length ?? 0;
    let created: Scene | null = null;
    void change(
      (p) => {
        const r = addScene(p, chapterId, `Cena ${count + 1}`);
        created = r.scene;
        return r;
      },
      async () => {
        if (created) {
          openDoc(created.id);
          setEditing(created.id);
        }
      },
    );
    setCollapsed((s) => {
      const n = new Set(s);
      n.delete(chapterId);
      return n;
    });
  };

  const newChapter = () => {
    if (!sectionOpen) useSettings.getState().toggleSection("manuscrito");
    let created: Chapter | null = null;
    void change(
      (p) => {
        const r = addChapter(p, `Capítulo ${p.chapters.length + 1}`);
        created = r.chapter;
        return r;
      },
      async () => {
        if (created) setEditing(created.id);
      },
    );
  };

  const toggle = (id: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  // Arrastar e soltar
  const onDragOver = (e: DragEvent, target: { kind: "scene" | "chapter"; id: string }) => {
    if (!drag) return;
    if (drag.kind === "chapter" && target.kind !== "chapter") return;
    e.preventDefault();
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = (e.clientY - box.top) / box.height;
    let where: "before" | "after" | "inside" = y < 0.5 ? "before" : "after";
    if (drag.kind === "scene" && target.kind === "chapter") where = "inside";
    setMark({ id: target.id, where });
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    if (!drag || !mark || drag.id === mark.id) return finishDrag();
    if (drag.kind === "chapter") {
      const ids = project.chapters.map((c) => c.id).filter((id) => id !== drag.id);
      const at = ids.indexOf(mark.id) + (mark.where === "after" ? 1 : 0);
      void change((p) => moveChapter(p, drag.id, at));
    } else if (mark.where === "inside") {
      const target = project.chapters.find((c) => c.id === mark.id);
      if (target) void change((p) => moveScene(p, drag.id, target.id, target.scenes.length));
    } else {
      const target = project.chapters.find((c) => c.scenes.some((s) => s.id === mark.id));
      if (target) {
        const ids = target.scenes.map((s) => s.id).filter((id) => id !== drag.id);
        const at = ids.indexOf(mark.id) + (mark.where === "after" ? 1 : 0);
        void change((p) => moveScene(p, drag.id, target.id, at));
      }
    }
    finishDrag();
  };

  const finishDrag = () => {
    setDrag(null);
    setMark(null);
  };

  const markClass = (id: string) =>
    mark?.id === id ? ` drop-${mark.where}` : drag?.id === id ? " dragging" : "";

  const moveSceneBy = (c: Chapter, index: number, delta: number) => {
    const chapterIndex = project.chapters.indexOf(c);
    const scene = c.scenes[index]!;
    const to = index + delta;
    if (to >= 0 && to < c.scenes.length) {
      void change((p) => moveScene(p, scene.id, c.id, to));
    } else {
      // Passa para o capítulo vizinho.
      const neighbor = project.chapters[chapterIndex + delta];
      if (neighbor) {
        void change((p) =>
          moveScene(p, scene.id, neighbor.id, delta < 0 ? neighbor.scenes.length : 0),
        );
      }
    }
  };

  return (
    <nav className="tree" aria-label="Manuscrito" onDragEnd={finishDrag}>
      <div className="tree-head">
        <SectionToggle id="manuscrito" label="Manuscrito" />
        <button
          type="button"
          className="icon-btn"
          title="Novo capítulo"
          aria-label="Novo capítulo"
          onClick={newChapter}
        >
          <Icon name="plus" />
        </button>
      </div>

      {sectionOpen && (
        <ol className="chapters">
          {project.chapters.map((c, ci) => {
            const open = !collapsed.has(c.id);
            return (
              <li key={c.id} className="chapter">
                {confirming === c.id ? (
                  <ConfirmRow
                    text={`Excluir "${c.title}" e ${c.scenes.length === 1 ? "1 cena" : `${c.scenes.length} cenas`}?`}
                    onYes={() => {
                      setConfirming(null);
                      void change((p) => removeChapter(p, c.id));
                    }}
                    onNo={() => setConfirming(null)}
                  />
                ) : (
                  <div
                    className={"row chapter-row" + markClass(c.id)}
                    draggable={editing !== c.id}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", c.title);
                      setDrag({ kind: "chapter", id: c.id });
                    }}
                    onDragOver={(e) => onDragOver(e, { kind: "chapter", id: c.id })}
                    onDrop={onDrop}
                  >
                    <button
                      type="button"
                      className={"chev" + (open ? " open" : "")}
                      aria-label={open ? `Recolher ${c.title}` : `Expandir ${c.title}`}
                      aria-expanded={open}
                      onClick={() => toggle(c.id)}
                    >
                      <Icon name="chevron" size={14} />
                    </button>
                    {editing === c.id ? (
                      <InlineEdit
                        value={c.title}
                        label="Nome do capítulo"
                        onCommit={(t) => {
                          setEditing(null);
                          void change((p) => renameChapter(p, c.id, t));
                        }}
                        onCancel={() => setEditing(null)}
                      />
                    ) : (
                      <span
                        className="row-title chapter-title"
                        onDoubleClick={() => setEditing(c.id)}
                      >
                        {c.title}
                      </span>
                    )}
                    <span className="row-count">{formatCount(chapterWords(c))}</span>
                    <RowActions
                      name={c.title}
                      onUp={
                        ci > 0 ? () => void change((p) => moveChapter(p, c.id, ci - 1)) : undefined
                      }
                      onDown={
                        ci < project.chapters.length - 1
                          ? () => void change((p) => moveChapter(p, c.id, ci + 1))
                          : undefined
                      }
                      onRename={() => setEditing(c.id)}
                      onDelete={() => setConfirming(c.id)}
                      onAdd={() => newScene(c.id)}
                    />
                  </div>
                )}

                {open && (
                  <ol className="scenes">
                    {c.scenes.map((s, si) =>
                      confirming === s.id ? (
                        <li key={s.id}>
                          <ConfirmRow
                            text={`Excluir "${s.title}"?`}
                            onYes={() => {
                              setConfirming(null);
                              void change((p) => removeScene(p, s.id));
                            }}
                            onNo={() => setConfirming(null)}
                          />
                        </li>
                      ) : (
                        <li
                          key={s.id}
                          className={
                            "row scene-row" +
                            (s.id === activeDocId ? " active" : "") +
                            markClass(s.id)
                          }
                          draggable={editing !== s.id}
                          onDragStart={(e) => {
                            e.stopPropagation();
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/plain", s.title);
                            setDrag({ kind: "scene", id: s.id });
                          }}
                          onDragOver={(e) => onDragOver(e, { kind: "scene", id: s.id })}
                          onDrop={onDrop}
                        >
                          {editing === s.id ? (
                            <InlineEdit
                              value={s.title}
                              label="Nome da cena"
                              onCommit={(t) => {
                                setEditing(null);
                                void renameDocAndLinks((p) => renameScene(p, s.id, t), s.id);
                              }}
                              onCancel={() => setEditing(null)}
                            />
                          ) : (
                            <button
                              type="button"
                              className="row-title scene-open"
                              aria-current={s.id === activeDocId ? "page" : undefined}
                              onClick={() => {
                                openDoc(s.id);
                                onOpenScene();
                              }}
                              onDoubleClick={() => setEditing(s.id)}
                            >
                              <Icon name="file" size={15} />
                              <span>{s.title}</span>
                            </button>
                          )}
                          <span className="row-count">{formatCount(words[s.id] ?? 0)}</span>
                          <RowActions
                            name={s.title}
                            onUp={si > 0 || ci > 0 ? () => moveSceneBy(c, si, -1) : undefined}
                            onDown={
                              si < c.scenes.length - 1 || ci < project.chapters.length - 1
                                ? () => moveSceneBy(c, si, 1)
                                : undefined
                            }
                            onRename={() => setEditing(s.id)}
                            onDelete={() => setConfirming(s.id)}
                          />
                        </li>
                      ),
                    )}
                    {c.scenes.length === 0 && (
                      <li className="empty-chapter">
                        <button type="button" className="link-btn" onClick={() => newScene(c.id)}>
                          + Adicionar a primeira cena
                        </button>
                      </li>
                    )}
                  </ol>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </nav>
  );
}

export function RowActions(props: {
  name: string;
  onUp?: () => void;
  onDown?: () => void;
  onRename: () => void;
  onDelete: () => void;
  onAdd?: () => void;
  addLabel?: string;
  /** Notas não têm ordem manual: sem setas. */
  movable?: boolean;
}) {
  const movable = props.movable ?? true;
  return (
    <span className="row-actions">
      {props.onAdd && (
        <button
          type="button"
          className="icon-btn sm"
          title={props.addLabel ?? "Nova cena"}
          aria-label={`${props.addLabel ?? "Nova cena"} em ${props.name}`}
          onClick={props.onAdd}
        >
          <Icon name="plus" size={15} />
        </button>
      )}
      {movable && (
        <>
          <button
            type="button"
            className="icon-btn sm"
            title="Mover para cima"
            aria-label={`Mover ${props.name} para cima`}
            disabled={!props.onUp}
            onClick={props.onUp}
          >
            <Icon name="up" size={15} />
          </button>
          <button
            type="button"
            className="icon-btn sm"
            title="Mover para baixo"
            aria-label={`Mover ${props.name} para baixo`}
            disabled={!props.onDown}
            onClick={props.onDown}
          >
            <Icon name="down" size={15} />
          </button>
        </>
      )}
      <button
        type="button"
        className="icon-btn sm"
        title="Renomear"
        aria-label={`Renomear ${props.name}`}
        onClick={props.onRename}
      >
        <Icon name="edit" size={15} />
      </button>
      <button
        type="button"
        className="icon-btn sm danger"
        title="Excluir"
        aria-label={`Excluir ${props.name}`}
        onClick={props.onDelete}
      >
        <Icon name="trash" size={15} />
      </button>
    </span>
  );
}

export function ConfirmRow({
  text,
  detail = "O texto vai para a lixeira dentro da pasta do projeto.",
  onYes,
  onNo,
}: {
  text: string;
  detail?: string;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <div className="confirm-row" role="alertdialog" aria-label={text}>
      <p>{text}</p>
      <small>{detail}</small>
      <div className="confirm-actions">
        <button type="button" className="btn danger sm" onClick={onYes} autoFocus>
          Excluir
        </button>
        <button type="button" className="btn ghost sm" onClick={onNo}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

/** Título de uma seção da barra lateral que recolhe e expande o conteúdo. */
export function SectionToggle({ id, label }: { id: SectionId; label: string }) {
  const open = !useSettings((s) => s.collapsed.includes(id));
  const toggle = useSettings((s) => s.toggleSection);
  return (
    <button
      type="button"
      className={"section-toggle" + (open ? " open" : "")}
      aria-expanded={open}
      onClick={() => toggle(id)}
    >
      <Icon name="chevron" size={13} />
      <span className="tree-label">{label}</span>
    </button>
  );
}
