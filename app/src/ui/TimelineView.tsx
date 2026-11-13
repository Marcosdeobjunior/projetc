import { useEffect, useMemo, useState } from "react";
import { useApp, type Session } from "../state/store";
import { useTimeline } from "../state/timeline";
import {
  buildLanes,
  buildTimeline,
  continuity,
  gapLabel,
  type Lanes,
  type TimelineItem,
} from "../timeline/timeline";
import type { NoteKind } from "../manuscript/types";
import { useYearLength } from "./ContinuityEditors";
import { exampleTimeline } from "../timeline/example";
import { dayToDate, formatDate, holidaysOn, seasonOf } from "../timeline/calendar";
import { DOC_ICON, KIND_LABEL } from "../links/context";
import { Icon } from "./Icon";
import { CalendarMonthView, CascadeView, type ViewActions } from "./TimelineViews";

type Layout = "list" | "lanes" | "calendar" | "cascade";
const LAYOUTS: Layout[] = ["list", "lanes", "calendar", "cascade"];

const LAYOUT_KEY = "talia.timelineLayout";
const LANE_KINDS: NoteKind[] = ["personagens", "lugares", "organizacoes"];

/**
 * Faixas: uma linha por personagem (ou lugar, organização), uma coluna por
 * dia com alguma coisa. Mostra quem está onde ao mesmo tempo.
 */
function LanesGrid({
  lanes,
  kinds,
  onKinds,
  titleOf,
  dayLabel,
  onOpen,
}: {
  lanes: Lanes;
  kinds: NoteKind[];
  onKinds(k: NoteKind[]): void;
  titleOf(id: string): string;
  dayLabel(day: number): { top: string; bottom: string };
  onOpen(id: string): void;
}) {
  return (
    <section className="lanes">
      <div className="lanes-kinds" role="group" aria-label="Linhas das faixas">
        {LANE_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            className="chip"
            aria-pressed={kinds.includes(k)}
            onClick={() =>
              onKinds(kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k])
            }
          >
            <Icon name={DOC_ICON[k]} size={13} /> {KIND_LABEL[k].many}
          </button>
        ))}
      </div>
      {lanes.rows.length === 0 ? (
        <p className="muted">
          Ninguém aparece em cenas com data ainda. Dê datas às cenas (na Lista) e cite os
          personagens no texto, ou ligue notas aos acontecimentos.
        </p>
      ) : (
        <div className="lanes-scroll">
          <table className="lanes-table">
            <thead>
              <tr>
                <th scope="col" className="lanes-name" />
                {lanes.days.map((d, i) => {
                  const l = dayLabel(d);
                  const skip = i > 0 && d - lanes.days[i - 1]! > 1;
                  return (
                    <th key={d} scope="col" className={skip ? "skip" : undefined}>
                      <span>{l.top}</span>
                      {l.bottom && <small>{l.bottom}</small>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {lanes.rows.map((r) => (
                <tr key={r.noteId}>
                  <th scope="row" className="lanes-name">
                    {titleOf(r.noteId)}
                  </th>
                  {lanes.days.map((d, i) => {
                    const items = r.cells.get(d) ?? [];
                    const skip = i > 0 && d - lanes.days[i - 1]! > 1;
                    return (
                      <td key={d} className={skip ? "skip" : undefined}>
                        {items.map((it) =>
                          it.kind === "scene" ? (
                            <button
                              key={it.id}
                              type="button"
                              className="lane-pill"
                              title={`Abrir “${it.title}”`}
                              onClick={() => onOpen(it.id)}
                            >
                              {it.title}
                            </button>
                          ) : (
                            <span key={it.id} className="lane-pill event" title="Acontecimento">
                              {it.title}
                            </span>
                          ),
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">
        Cada coluna é um dia com alguma coisa; a linha mais grossa marca dias pulados. Uma cena que
        dura vários dias aparece em todos eles.
      </p>
    </section>
  );
}

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
  const [layout, setLayoutState] = useState<Layout>(() => {
    try {
      const v = localStorage.getItem(LAYOUT_KEY) as Layout | null;
      return v && LAYOUTS.includes(v) ? v : "list";
    } catch {
      return "list";
    }
  });
  const setLayout = (v: Layout) => {
    setLayoutState(v);
    try {
      localStorage.setItem(LAYOUT_KEY, v);
    } catch {
      // sem armazenamento: vale só agora
    }
  };
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
  const [laneKinds, setLaneKinds] = useState<NoteKind[]>(["personagens"]);
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

  /** Tudo o que tem data, uma vez cada (para o calendário e a cascata). */
  const dated = useMemo(() => {
    const seen = new Set<string>();
    return timeline.groups
      .flatMap((g) => g.items)
      .filter((it) => !seen.has(it.id) && seen.add(it.id));
  }, [timeline]);
  const viewActions: ViewActions = {
    move: (it, day, days) =>
      it.kind === "scene"
        ? void setScene(it.id, { day, days })
        : void updateEvent(it.id, { day, days }),
    create: (day) =>
      addEvent({ title: "Novo acontecimento", day, days: 1, notes: filter ? [filter] : [] }),
    rename: (id, title) => void updateEvent(id, { title }),
    remove: (id) => void removeEvent(id),
    openScene: (id) => openDoc(id),
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
            Quando cada cena acontece na história. Você escolhe os dias; o app põe em ordem e conta
            quanto tempo passou.
          </p>
        </div>
      </header>

      <div className="tl-toolbar">
        <div className="segmented wide tl-layout" role="radiogroup" aria-label="Forma de mostrar">
          {(
            [
              ["list", "menu", "Lista"],
              ["calendar", "calendar", "Calendário"],
              ["cascade", "clock", "Cascata"],
              ["lanes", "person", "Faixas por personagem"],
            ] as const
          ).map(([v, icon, text]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={layout === v}
              onClick={() => setLayout(v)}
            >
              <Icon name={icon} size={14} /> {text}
            </button>
          ))}
        </div>
        <div className="tl-filters">
          <label className="tl-filter">
            <span>Mostrar</span>
            <select
              className="tool-select"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="">Tudo</option>
              {notes.map((n) => (
                <option key={n.id} value={n.id}>
                  Só {KIND_LABEL[n.kind].one.toLowerCase()}: {n.title}
                </option>
              ))}
            </select>
          </label>
          <label className="tl-filter">
            <span>Datas</span>
            <select
              className="tool-select"
              value={data.activeCalendar ?? ""}
              onChange={(e) =>
                e.target.value === "__novo"
                  ? onOpenCalendar(calendarNotes[0]?.id ?? "")
                  : void useTimeline.getState().setActiveCalendar(e.target.value || null)
              }
            >
              <option value="">Dia 1, Dia 2…</option>
              {defined.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.title}
                </option>
              ))}
              <option value="__novo">
                {defined.length ? "Editar ou criar calendário…" : "+ Criar calendário do mundo…"}
              </option>
            </select>
          </label>
        </div>
        <button type="button" className="btn sm tl-new" onClick={newEvent}>
          <Icon name="plus" size={14} /> Acontecimento
        </button>
      </div>

      {Object.keys(data.scenes).length === 0 && data.events.length === 0 && (
        <p className="tl-empty-hint">
          <span className="muted">Sua linha do tempo está vazia.</span>
          <button
            type="button"
            className="link-btn"
            title="Dá datas fictícias às cenas, idades aos personagens e distâncias aos lugares, para você ver como tudo funciona"
            onClick={() => void useTimeline.getState().replace(exampleTimeline(project, data))}
          >
            Preencher com datas de teste
          </button>
        </p>
      )}
      {(warningCount > 0 || ignoredCount > 0) && (
        <p className={"tl-summary" + (warningCount ? " warn" : "")}>
          {warningCount > 0
            ? `${warningCount} ${warningCount === 1 ? "aviso" : "avisos"} de continuidade: alguém chega a um lugar mais cedo do que a viagem permite.`
            : "Nenhum aviso de continuidade."}
          {ignoredCount > 0 &&
            ` ${ignoredCount} ${ignoredCount === 1 ? "cena com avisos ignorados" : "cenas com avisos ignorados"}.`}
        </p>
      )}

      {layout === "calendar" ? (
        <CalendarMonthView
          key={data.activeCalendar ?? ""}
          items={dated}
          calendar={calendar}
          actions={viewActions}
        />
      ) : layout === "cascade" ? (
        <CascadeView items={dated} calendar={calendar} actions={viewActions} />
      ) : layout === "lanes" ? (
        <LanesGrid
          lanes={buildLanes(project, data, linksOf, laneKinds)}
          kinds={laneKinds}
          onKinds={setLaneKinds}
          titleOf={title}
          dayLabel={(day) => {
            if (!calendar) return { top: `Dia ${day}`, bottom: "" };
            const d = dayToDate(calendar, day);
            return {
              top: `${d.day} ${calendar.months[d.month]!.name.slice(0, 3)}.`,
              bottom: String(d.year),
            };
          }}
          onOpen={openDoc}
        />
      ) : timeline.groups.length === 0 ? (
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
