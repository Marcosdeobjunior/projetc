import { useState } from "react";
import { renameDocAndLinks, useApp, type Session } from "../state/store";
import { addNote, removeNote, renameNote } from "../manuscript/tree";
import { NOTE_KINDS, type Note, type NoteKind } from "../manuscript/types";
import { KIND_LABEL } from "../links/context";
import { Icon } from "./Icon";
import { InlineEdit } from "./InlineEdit";
import { ConfirmRow, RowActions, SectionToggle } from "./ManuscriptTree";
import { useSettings } from "../state/settings";

const KIND_ICON: Record<NoteKind, string> = {
  personagens: "person",
  lugares: "pin",
  ideias: "bulb",
};

const byTitle = (a: Note, b: Note) => a.title.localeCompare(b.title, "pt-BR");

/** Personagens, lugares e ideias do projeto, em ordem alfabética. */
export function NotesTree({ session, onOpen }: { session: Session; onOpen: () => void }) {
  const change = useApp((s) => s.change);
  const openDoc = useApp((s) => s.openDoc);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const collapsed = useSettings((s) => s.collapsed);
  const toggleSection = useSettings((s) => s.toggleSection);
  const { project, activeDocId } = session;

  const newNote = (kind: NoteKind) => {
    let id: string | null = null;
    void change(
      (p) => {
        const r = addNote(p, kind, KIND_LABEL[kind].new);
        id = r.note.id;
        return r;
      },
      async () => {
        if (id) {
          openDoc(id);
          setEditing(id);
        }
      },
    );
    if (collapsed.includes("notas")) toggleSection("notas");
    if (collapsed.includes(kind)) toggleSection(kind);
  };

  return (
    <nav className="tree" aria-label="Notas">
      <div className="tree-head">
        <SectionToggle id="notas" label="Notas" />
      </div>
      {!collapsed.includes("notas") && (
        <ol className="chapters">
          {NOTE_KINDS.map((kind) => {
            const notes = project.notes.filter((n) => n.kind === kind).sort(byTitle);
            const open = !collapsed.includes(kind);
            const label = KIND_LABEL[kind].many;
            return (
              <li key={kind} className="chapter">
                <div className="row chapter-row">
                  <button
                    type="button"
                    className={"chev" + (open ? " open" : "")}
                    aria-label={open ? `Recolher ${label}` : `Expandir ${label}`}
                    aria-expanded={open}
                    onClick={() => toggleSection(kind)}
                  >
                    <Icon name="chevron" size={14} />
                  </button>
                  <span className="row-title chapter-title">{label}</span>
                  <span className="row-count">{notes.length}</span>
                  <span className="row-actions">
                    <button
                      type="button"
                      className="icon-btn sm"
                      title={KIND_LABEL[kind].new}
                      aria-label={KIND_LABEL[kind].new}
                      onClick={() => newNote(kind)}
                    >
                      <Icon name="plus" size={15} />
                    </button>
                  </span>
                </div>
                {open && (
                  <ol className="scenes">
                    {notes.map((n) =>
                      confirming === n.id ? (
                        <li key={n.id}>
                          <ConfirmRow
                            text={`Excluir "${n.title}"?`}
                            onYes={() => {
                              setConfirming(null);
                              void change((p) => removeNote(p, n.id));
                            }}
                            onNo={() => setConfirming(null)}
                          />
                        </li>
                      ) : (
                        <li
                          key={n.id}
                          className={"row scene-row" + (n.id === activeDocId ? " active" : "")}
                        >
                          {editing === n.id ? (
                            <InlineEdit
                              value={n.title}
                              label="Nome da nota"
                              onCommit={(t) => {
                                setEditing(null);
                                void renameDocAndLinks((p) => renameNote(p, n.id, t), n.id);
                              }}
                              onCancel={() => setEditing(null)}
                            />
                          ) : (
                            <button
                              type="button"
                              className="row-title scene-open"
                              aria-current={n.id === activeDocId ? "page" : undefined}
                              onClick={() => {
                                openDoc(n.id);
                                onOpen();
                              }}
                              onDoubleClick={() => setEditing(n.id)}
                            >
                              <Icon name={KIND_ICON[kind]} size={15} />
                              <span>{n.title}</span>
                            </button>
                          )}
                          <RowActions
                            name={n.title}
                            movable={false}
                            onRename={() => setEditing(n.id)}
                            onDelete={() => setConfirming(n.id)}
                          />
                        </li>
                      ),
                    )}
                    {notes.length === 0 && (
                      <li className="empty-chapter">
                        <button type="button" className="link-btn" onClick={() => newNote(kind)}>
                          + Adicionar {KIND_LABEL[kind].one.toLowerCase()}
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
