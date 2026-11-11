import type { Note, Project } from "../manuscript/types";
import { visibleFields, type FieldDef } from "../manuscript/fields";
import { setNoteFields } from "../manuscript/tree";
import { useApp } from "../state/store";
import { useTimeline } from "../state/timeline";
import { KIND_LABEL } from "../links/context";
import { useYearLength } from "./ContinuityEditors";
import { Select } from "./Select";
import { Icon } from "./Icon";
import { characterTips } from "../manuscript/characterCheck";

/**
 * Os campos da ficha (no personagem, em seções: base, desejo, mentira…). Cada
 * campo grava ao sair dele; campos de referência e de escolha usam uma lista.
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
  const values = note.fields ?? {};
  const defs = visibleFields(note.kind, values);
  if (!defs.length) return null;

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
          <Select
            id={id}
            value={v}
            options={options.map((o) => ({ value: o.id, label: o.title }))}
            onChange={(nv) => save(d.key, nv)}
          />
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
            <small className="field-hint">
              Crie {KIND_LABEL[d.ref].many.toLowerCase()} no Mundo.
            </small>
          )}
        </div>
      );
    } else if (d.type === "choice") {
      // Valor que não está mais entre as opções continua visível (o Select mostra o texto).
      const options = d.options ?? [];
      input = (
        <Select
          id={id}
          value={v}
          options={options.map((o) => ({ value: o, label: o }))}
          onChange={(nv) => save(d.key, nv)}
        />
      );
    } else if (d.type === "long") {
      input = (
        <textarea
          key={v}
          id={id}
          className="text-input"
          rows={2}
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
        : d.hint;
    return (
      <div key={d.key} className={"field" + (d.type === "long" ? " wide" : "")}>
        <label htmlFor={id}>{d.label}</label>
        {input}
        {hint && <small className="field-hint">{hint}</small>}
      </div>
    );
  };

  const groups = groupFields(defs);
  return (
    <div className={"note-fields" + (compact ? " compact" : "")}>
      {groups.map((g, i) =>
        g.section ? (
          <section key={g.defs[0]!.key} id={sectionId(note.id, i)} className="field-group">
            <SectionTitle section={g.section} />
            <div className="field-grid">{g.defs.map(field)}</div>
          </section>
        ) : (
          <div key={g.defs[0]!.key} className="field-grid">
            {g.defs.map(field)}
          </div>
        ),
      )}
    </div>
  );
}

interface FieldGroup {
  section?: NonNullable<FieldDef["section"]>;
  defs: FieldDef[];
}

function groupFields(defs: FieldDef[]): FieldGroup[] {
  const groups: FieldGroup[] = [];
  for (const d of defs) {
    if (d.section || !groups.length) groups.push({ section: d.section, defs: [] });
    groups[groups.length - 1]!.defs.push(d);
  }
  return groups;
}

const sectionId = (noteId: string, i: number) => `fs-${noteId}-${i}`;

/** "2. Desejo" vira o número num selo e o nome ao lado. */
function splitTitle(title: string): [string | null, string] {
  const m = /^(\d+)\.\s*(.*)$/.exec(title);
  return m ? [m[1]!, m[2]!] : [null, title];
}

function SectionTitle({ section }: { section: NonNullable<FieldDef["section"]> }) {
  const [n, name] = splitTitle(section.title);
  return (
    <header className="field-section">
      {n && <span className="field-section-n">{n}</span>}
      <div>
        <h4>{name}</h4>
        {section.source && <small>{section.source}</small>}
      </div>
    </header>
  );
}

/**
 * Índice das seções da ficha (ao lado da imagem): leva até a seção e marca as
 * que já têm algo preenchido.
 */
function sectionProgress(note: Note) {
  const values = note.fields ?? {};
  const groups = groupFields(visibleFields(note.kind, values));
  const sections = groups.filter((g) => g.section);
  const filled = sections.filter((g) => g.defs.some((d) => values[d.key])).length;
  return { values, groups, filled, total: sections.length };
}

/** Leva até um campo da ficha e o deixa pronto para digitar. */
function focusField(noteId: string, key: string) {
  const el = document.getElementById(`f-${noteId}-${key}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.focus({ preventScroll: true });
}

/**
 * Painel ao lado da ficha de personagem: quanto da ficha já tem conteúdo e as
 * próximas perguntas a responder (tiradas da própria ficha).
 */
export function CharacterPanel({ note }: { note: Note }) {
  const { filled, total } = sectionProgress(note);
  const tips = characterTips(note.fields).slice(0, 4);
  const pct = total ? Math.round((filled / total) * 100) : 0;
  return (
    <section className="profile-card char-panel">
      <h3>Construção do personagem</h3>
      <div className="char-progress">
        <div
          className="char-progress-bar"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Seções com conteúdo"
        >
          <span style={{ width: `${pct}%` }} />
        </div>
        <small>
          {filled} de {total} seções
        </small>
      </div>
      {tips.length ? (
        <>
          <p className="char-panel-sub">Próximas perguntas</p>
          <ul className="char-tips">
            {tips.map((t, i) => (
              <li key={i}>
                <button type="button" onClick={() => focusField(note.id, t.key)}>
                  <Icon name="chevron" size={13} />
                  <span>{t.text}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="char-panel-sub">A ficha está completa. Releia os testes de cada seção.</p>
      )}
    </section>
  );
}

export function FieldSectionNav({ note }: { note: Note }) {
  const { values, groups, filled, total } = sectionProgress(note);
  if (!total) return null;
  return (
    <nav className="field-nav" aria-label="Seções da ficha">
      <p className="field-nav-head">
        Seções <span>{`${filled} de ${total} com conteúdo`}</span>
      </p>
      <ol>
        {groups.map((g, i) => {
          if (!g.section) return null;
          const [n, name] = splitTitle(g.section.title);
          const done = g.defs.some((d) => values[d.key]);
          return (
            <li key={i}>
              <button
                type="button"
                className={done ? "done" : ""}
                onClick={() =>
                  document
                    .getElementById(sectionId(note.id, i))
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
              >
                <span className="field-nav-n">{n ?? "•"}</span>
                {name}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
