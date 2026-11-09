import { useEffect, useMemo, useState } from "react";
import { useApp, type Session } from "../state/store";
import { useTimeline } from "../state/timeline";
import { buildTimeline, continuity, gapLabel, type TimelineItem } from "../timeline/timeline";
import { useYearLength } from "./ContinuityEditors";
import { dayToDate, formatDate, holidaysOn, seasonOf } from "../timeline/calendar";
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
  onOpenCalendar,
}: {
  session: Session;
  /** Textos ligados a cada nota (para filtrar por personagem, lugar…). */
  linksOf: Map<string, string[]>;
  /** Abre a ficha de um calendário (para definir meses, semana…). */
  onOpenCalendar(noteId: string): void;
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
  /** Calendário do mundo usado para mostrar as datas (ou nenhum: "Dia N"). */
  const calendar = data.activeCalendar ? data.calendars[data.activeCalendar] : undefined;
  const calendarNotes = project.notes.filter((n) => n.kind === "calendarios");
  const defined = calendarNotes.filter((n) => data.calendars[n.id]);
  /** Data do mundo de um dia da história, por extenso. */
  const { yearLen } = useYearLength();
  /** Idades, locais e avisos de viagem (calculados sobre a linha inteira, sem filtro). */
  const checks = useMemo(
    () => continuity({ project, data, linksOf, yearLength: yearLen }),
    [project, data, linksOf, yearLen],
  );
  const places = project.notes.filter((n) => n.kind === "lugares");
  const title = (id: string) => project.notes.find((n) => n.id === id)?.title ?? "?";
  const warningCount = [...checks.warnings.values()].reduce((n, l) => n + l.length, 0);
  const ignoredCount = Object.values(data.scenes).filter((d) => d.ignore).length;
  const worldDate = (day: number) => {
    if (!calendar) return null;
    const d = dayToDate(calendar, day);
    return {
      text: (d.weekday ? `${d.weekday}, ` : "") + formatDate(calendar, d),
      season: seasonOf(calendar, d),
      holidays: holidaysOn(calendar, d),
    };
  };

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
              <span className="tl-event-notes">
                Acontecimento
                {it.notes.map((id) => {
                  const n = project.notes.find((x) => x.id === id);
                  return n ? (
                    <span key={id} className="tl-chip">
                      {n.title}
                      <button
                        type="button"
                        aria-label={`Desligar ${n.title}`}
                        title="Desligar"
                        onClick={() =>
                          void updateEvent(it.id, { notes: it.notes.filter((x) => x !== id) })
                        }
                      >
                        ×
                      </button>
                    </span>
                  ) : null;
                })}
                <select
                  className="tl-add-note"
                  aria-label="Ligar uma nota a este acontecimento"
                  value=""
                  onChange={(e) =>
                    e.target.value &&
                    void updateEvent(it.id, { notes: [...it.notes, e.target.value] })
                  }
                >
                  <option value="">+ ligar nota</option>
                  {notes
                    .filter((n) => !it.notes.includes(n.id))
                    .map((n) => (
                      <option key={n.id} value={n.id}>
                        {KIND_LABEL[n.kind].one}: {n.title}
                      </option>
                    ))}
                </select>
              </span>
            )}
          </small>
          {it.kind === "scene" && (
            <div className="tl-scene-meta">
              <label className="tl-place">
                <Icon name="pin" size={13} />
                <select
                  aria-label={`Local de ${it.title}`}
                  value={data.scenes[it.id]?.place ?? ""}
                  onChange={(e) =>
                    void useTimeline
                      .getState()
                      .setSceneMeta(it.id, { place: e.target.value || null })
                  }
                >
                  <option value="">
                    {checks.places.get(it.id)?.auto
                      ? `${title(checks.places.get(it.id)!.place)} (pelo texto)`
                      : "Local: não definido"}
                  </option>
                  {places.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </label>
              {checks.ages.get(it.id)?.map((a) => (
                <span key={a.noteId} className="tl-chip" title="Idade nesta cena">
                  {title(a.noteId)}, {a.age} {a.age === 1 ? "ano" : "anos"}
                </span>
              ))}
              {data.scenes[it.id]?.ignore && (
                <button
                  type="button"
                  className="link-btn"
                  title="Voltar a avisar sobre viagens nesta cena"
                  onClick={() => void useTimeline.getState().setSceneMeta(it.id, { ignore: false })}
                >
                  avisos ignorados
                </button>
              )}
            </div>
          )}
          {it.kind === "scene" &&
            checks.warnings.get(it.id)?.map((w) => (
              <p key={w.noteId} className="tl-warning" role="note">
                <Icon name="clock" size={13} />
                <span>
                  <b>{title(w.noteId)}</b> vai de {title(w.from)} a {title(w.to)}, que leva{" "}
                  {w.needs} {w.needs === 1 ? "dia" : "dias"}, mas{" "}
                  {w.had <= 0
                    ? "chega no mesmo dia"
                    : `só passou ${w.had} ${w.had === 1 ? "dia" : "dias"}`}
                  .
                </span>
                <button
                  type="button"
                  className="link-btn"
                  title="Por exemplo, se usou um atalho ou magia"
                  onClick={() => void useTimeline.getState().setSceneMeta(it.id, { ignore: true })}
                >
                  Ignorar nesta cena
                </button>
              </p>
            ))}
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
          <select
            className="tool-select"
            aria-label="Calendário das datas"
            value={data.activeCalendar ?? ""}
            onChange={(e) => void useTimeline.getState().setActiveCalendar(e.target.value || null)}
          >
            <option value="">Datas: dias numerados</option>
            {defined.map((n) => (
              <option key={n.id} value={n.id}>
                Datas: {n.title}
              </option>
            ))}
          </select>
          <button type="button" className="btn sm" onClick={newEvent}>
            <Icon name="plus" size={14} /> Acontecimento
          </button>
        </div>
      </header>
      {(warningCount > 0 || ignoredCount > 0) && (
        <p className={"tl-summary" + (warningCount ? " warn" : "")}>
          {warningCount > 0
            ? `${warningCount} ${warningCount === 1 ? "aviso" : "avisos"} de continuidade: alguém chega a um lugar mais cedo do que a viagem permite.`
            : "Nenhum aviso de continuidade."}
          {ignoredCount > 0 &&
            ` ${ignoredCount} ${ignoredCount === 1 ? "cena com avisos ignorados" : "cenas com avisos ignorados"}.`}
        </p>
      )}
      {defined.length === 0 && (
        <p className="muted small tl-hint">
          Para ver as datas no calendário do seu mundo (meses, semana, eras), defina um em{" "}
          <b>Calendários do mundo</b>
          {calendarNotes[0] && (
            <>
              {" "}
              ou{" "}
              <button
                type="button"
                className="link-btn"
                onClick={() => onOpenCalendar(calendarNotes[0]!.id)}
              >
                abra “{calendarNotes[0].title}”
              </button>
            </>
          )}
          .
        </p>
      )}

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
              {(() => {
                const w = worldDate(g.day);
                return w ? (
                  <h3 className="tl-day">
                    {w.text}
                    <small>
                      Dia {g.day}
                      {w.season && ` · ${w.season}`}
                    </small>
                    {w.holidays.map((h) => (
                      <span key={h} className="tl-tag">
                        {h}
                      </span>
                    ))}
                  </h3>
                ) : (
                  <h3 className="tl-day">Dia {g.day}</h3>
                );
              })()}
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
