import { useEffect, useMemo, useState } from "react";
import { useApp, type Session } from "../state/store";
import { useTimeline } from "../state/timeline";
import { buildTimeline, gapLabel, type TimelineItem } from "../timeline/timeline";
import { DOC_ICON, KIND_LABEL } from "../links/context";
import { Icon } from "./Icon";

/** Campo de número inteiro que só grava ao sair ou com Enter (não a cada tecla). */
function NumberField({
  value,
  min,
  label,
  placeholder,
  onCommit,
}: {
  value: number | null;
  min?: number;
  label: string;
  placeholder?: string;
  onCommit(v: number | null): void;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));
  const [prev, setPrev] = useState(value);
  // O valor mudou por fora (outra linha, sync): mostra o novo.
  if (prev !== value) {
    setPrev(value);
    setText(value === null ? "" : String(value));
  }
  const commit = () => {
    const t = text.trim();
    if (t === "") return onCommit(null);
    const n = Number(t);
    if (!Number.isInteger(n) || (min !== undefined && n < min)) {
      setText(value === null ? "" : String(value));
      return;
    }
    if (n !== value) onCommit(n);
  };
  return (
    <input
      className="tl-num"
      type="text"
      inputMode="numeric"
      aria-label={label}
      title={label}
      placeholder={placeholder}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setText(value === null ? "" : String(value));
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

/**
 * Linha do tempo: cenas e eventos na ordem em que acontecem na história, com
 * o tempo que passou entre eles. As datas são sempre do autor.
 */
export function TimelineView({
  session,
  linksOf,
}: {
  session: Session;
  /** Textos ligados a cada nota (para filtrar por personagem, lugar…). */
  linksOf: Map<string, string[]>;
}) {
  const openDoc = useApp((s) => s.openDoc);
  const data = useTimeline((s) => s.data);
  const { setScene, addEvent, updateEvent, removeEvent } = useTimeline.getState();
  const [filter, setFilter] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const { project } = session;

  useEffect(() => {
    void useTimeline.getState().load();
  }, [session.root]);

  const timeline = useMemo(
    () =>
      buildTimeline(
        project,
        data,
        filter ? { noteId: filter, linked: new Set(linksOf.get(filter) ?? []) } : undefined,
      ),
    [project, data, filter, linksOf],
  );
  const notes = [...project.notes].sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
  const lastDay = timeline.groups.at(-1)?.day ?? 0;

  const newEvent = () =>
    void addEvent({
      title: "Novo acontecimento",
      day: lastDay + 1,
      days: 1,
      notes: filter ? [filter] : [],
    });

  const row = (it: TimelineItem) => (
    <li key={it.id} className={"tl-item " + it.kind}>
      <span className="tl-dot" aria-hidden="true" />
      <div className="tl-card">
        <div className="tl-card-main">
          {it.kind === "scene" ? (
            <button type="button" className="tl-title" onClick={() => openDoc(it.id)}>
              <Icon name="file" size={14} /> {it.title}
            </button>
          ) : (
            <input
              className="tl-title-input"
              aria-label="Nome do acontecimento"
              defaultValue={it.title}
              onBlur={(e) => {
                const t = e.target.value.trim();
                if (t && t !== it.title) void updateEvent(it.id, { title: t });
              }}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
          )}
          <small>
            {it.kind === "scene" ? (
              <>
                {it.chapter} · cena {it.bookIndex + 1} do livro
                {timeline.outOfOrder.has(it.id) && (
                  <span
                    className="tl-tag"
                    title="O livro conta esta cena depois de outra que acontece mais tarde"
                  >
                    fora de ordem
                  </span>
                )}
              </>
            ) : (
              <>
                Acontecimento (não é cena)
                {it.notes.length > 0 &&
                  " · " +
                    it.notes
                      .map((id) => project.notes.find((n) => n.id === id)?.title)
                      .filter(Boolean)
                      .join(", ")}
              </>
            )}
          </small>
        </div>
        <div className="tl-fields">
          <label>
            Dia
            <NumberField
              value={it.day}
              label="Dia da história"
              onCommit={(v) =>
                it.kind === "scene"
                  ? void setScene(it.id, v === null ? null : { day: v, days: it.days })
                  : v !== null && void updateEvent(it.id, { day: v })
              }
            />
          </label>
          <label>
            Dura
            <NumberField
              value={it.days}
              min={1}
              label="Quantos dias dura"
              onCommit={(v) =>
                it.kind === "scene"
                  ? void setScene(it.id, { day: it.day, days: v ?? 1 })
                  : void updateEvent(it.id, { days: v ?? 1 })
              }
            />
            {it.days === 1 ? "dia" : "dias"}
          </label>
          {it.kind === "scene" ? (
            <button
              type="button"
              className="icon-btn sm"
              title="Tirar a data (a cena volta para “Sem data”)"
              aria-label={`Tirar a data de ${it.title}`}
              onClick={() => void setScene(it.id, null)}
            >
              <Icon name="close" size={14} />
            </button>
          ) : confirming === it.id ? (
            <span className="tl-confirm">
              Excluir?
              <button
                type="button"
                className="link-btn danger"
                onClick={() => {
                  setConfirming(null);
                  void removeEvent(it.id);
                }}
              >
                Sim
              </button>
              <button type="button" className="link-btn" onClick={() => setConfirming(null)}>
                Não
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="icon-btn sm danger"
              title="Excluir acontecimento"
              aria-label={`Excluir ${it.title}`}
              onClick={() => setConfirming(it.id)}
            >
              <Icon name="trash" size={14} />
            </button>
          )}
        </div>
      </div>
    </li>
  );

  return (
    <div className="timeline">
      <header className="world-head">
        <div>
          <h2>Linha do tempo</h2>
          <p className="muted">
            As cenas na ordem em que acontecem na história. Você escolhe o dia de cada uma; o app só
            ordena e conta quanto tempo passou.
          </p>
        </div>
        <div className="tl-actions">
          <select
            className="tool-select"
            aria-label="Mostrar só o que está ligado a"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="">Mostrar tudo</option>
            {notes.map((n) => (
              <option key={n.id} value={n.id}>
                {KIND_LABEL[n.kind].one}: {n.title}
              </option>
            ))}
          </select>
          <button type="button" className="btn sm" onClick={newEvent}>
            <Icon name="plus" size={14} /> Acontecimento
          </button>
        </div>
      </header>

      {timeline.groups.length === 0 ? (
        <p className="muted">
          Nada na linha do tempo ainda. Dê um dia às cenas em “Sem data”, abaixo, ou crie um
          acontecimento.
        </p>
      ) : (
        <ol className="tl-groups">
          {timeline.groups.map((g) => (
            <li key={g.day} className="tl-group">
              {g.gap !== null && <p className="tl-gap">{gapLabel(g.gap)}</p>}
              <h3 className="tl-day">Dia {g.day}</h3>
              <ul className="tl-items">{g.items.map(row)}</ul>
            </li>
          ))}
        </ol>
      )}

      {timeline.undated.length > 0 && (
        <section className="tl-undated">
          <h3>Sem data</h3>
          <ul>
            {timeline.undated.map((s) => (
              <li key={s.id}>
                <button type="button" className="tl-title" onClick={() => openDoc(s.id)}>
                  <Icon name={DOC_ICON.scene} size={14} /> {s.title}
                </button>
                <small>{s.chapter}</small>
                <label>
                  Dia
                  <NumberField
                    value={null}
                    label={`Dia da história de ${s.title}`}
                    placeholder="—"
                    onCommit={(v) => v !== null && void setScene(s.id, { day: v, days: 1 })}
                  />
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
