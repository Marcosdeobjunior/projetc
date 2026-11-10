import type { Note, Project } from "../manuscript/types";
import { fieldsOf, type FieldDef } from "../manuscript/fields";
import { setNoteFields } from "../manuscript/tree";
import { useApp } from "../state/store";
import { useTimeline } from "../state/timeline";
import { KIND_LABEL } from "../links/context";
import { useYearLength } from "./ContinuityEditors";

/**
 * Os campos da ficha (nome completo, idade, onde vive, organização…). Cada
 * campo grava ao sair dele; campos de referência escolhem outra nota.
 */
export function NoteFields({
  note,
  project,
  compact = false,
  onOpenNote,
}: {
  note: Note;
  project: Project;
  /** Versão da edição rápida: uma coluna só. */
  compact?: boolean;
  onOpenNote?(id: string): void;
}) {
  const change = useApp((s) => s.change);
  const birth = useTimeline((s) => s.data.births[note.id]);
  const { yearLen } = useYearLength();
  const defs = fieldsOf(note.kind);
  if (!defs.length) return null;
  const values = note.fields ?? {};

  const save = (key: string, value: string) => {
    if ((values[key] ?? "") === value.trim()) return;
    void change((p) => {
      const cur = p.notes.find((n) => n.id === note.id)?.fields ?? {};
      return setNoteFields(p, note.id, { ...cur, [key]: value.trim() });
    });
  };

  const field = (d: FieldDef) => {
    const v = values[d.key] ?? "";
    const id = `f-${note.id}-${d.key}`;
    let input;
    if (d.type === "ref") {
      const options = project.notes
        .filter((n) => n.kind === d.ref && n.id !== note.id)
        .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
      const linked = options.find((o) => o.id === v);
      input = (
        <div className="field-ref">
          <select
            id={id}
            className="text-input"
            value={v}
            onChange={(e) => save(d.key, e.target.value)}
          >
            <option value="">—</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </select>
          {linked && onOpenNote && (
            <button
              type="button"
              className="link-btn"
              title={`Abrir a ficha de ${linked.title}`}
              onClick={() => onOpenNote(linked.id)}
            >
              abrir
            </button>
          )}
          {options.length === 0 && d.ref && (
            <small className="muted">Crie {KIND_LABEL[d.ref].many.toLowerCase()} no Mundo.</small>
          )}
        </div>
      );
    } else if (d.type === "long") {
      input = (
        <textarea
          key={v}
          id={id}
          className="text-input"
          rows={compact ? 2 : 3}
          placeholder={d.placeholder}
          defaultValue={v}
          onBlur={(e) => save(d.key, e.target.value)}
        />
      );
    } else {
      input = (
        <input
          key={v}
          id={id}
          className="text-input"
          placeholder={d.placeholder}
          defaultValue={v}
          onBlur={(e) => save(d.key, e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
      );
    }
    // Idade: se o nascimento está na linha do tempo, mostra a conta como dica.
    const hint =
      d.key === "idade" && birth !== undefined
        ? `Pela linha do tempo: ${Math.floor((1 - birth) / yearLen)} anos no dia 1`
        : null;
    return (
      <div key={d.key} className={"field" + (d.type === "long" ? " wide" : "")}>
        <label htmlFor={id}>{d.label}</label>
        {input}
        {hint && <small className="muted">{hint}</small>}
      </div>
    );
  };

  return <div className={"note-fields" + (compact ? " compact" : "")}>{defs.map(field)}</div>;
}
