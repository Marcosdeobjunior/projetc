import { useEffect, useState } from "react";
import { useApp, type Session } from "../state/store";
import { useTimeline } from "../state/timeline";
import { addNote, renameNote } from "../manuscript/tree";
import { calendarSummary, type CalendarDef } from "../timeline/calendar";
import { CalendarEditor, MonthPreview, PresetPicker } from "./CalendarEditor";
import { Icon } from "./Icon";

/*
 * "Calendário do mundo": tudo numa tela só. Sem calendário, modelos prontos
 * para escolher com um clique; com calendários, a lista à esquerda e o editor
 * (com a prévia do mês) à direita. A ficha completa da nota (imagens,
 * anotações) continua a um clique, mas não é preciso passar por ela.
 */
export function WorldCalendars({
  session,
  onOpenNote,
}: {
  session: Session;
  /** Abre a ficha completa da nota do calendário. */
  onOpenNote(id: string): void;
}) {
  const change = useApp((s) => s.change);
  const data = useTimeline((s) => s.data);
  const { setCalendar, setActiveCalendar } = useTimeline.getState();
  const notes = session.project.notes
    .filter((n) => n.kind === "calendarios")
    .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
  const [chosen, setChosen] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const current =
    notes.find((n) => n.id === chosen) ??
    notes.find((n) => n.id === data.activeCalendar) ??
    notes[0];

  useEffect(() => {
    void useTimeline.getState().load();
  }, [session.root]);

  /** Cria a nota do calendário já com a definição do modelo (e a põe em uso se for a única). */
  const create = (def: CalendarDef, title: string) => {
    let id: string | null = null;
    void change(
      (p) => {
        const r = addNote(p, "calendarios", title);
        id = r.note.id;
        return r;
      },
      async () => {
        if (!id) return;
        await setCalendar(id, def);
        setChosen(id);
        setPicking(false);
      },
    );
  };
  const rename = (id: string, title: string) => {
    const t = title.trim();
    if (t) void change((p) => renameNote(p, id, t));
  };

  const def = current ? data.calendars[current.id] : undefined;
  const inUse = current && data.activeCalendar === current.id;

  return (
    <div className="wcal">
      <header className="world-head">
        <div>
          <h2>Calendário do mundo</h2>
          <p className="muted">
            Como se contam os dias no seu mundo: meses, semana, eras, feriados. A linha do tempo
            mostra as datas no calendário em uso.
          </p>
        </div>
        {notes.length > 0 && !picking && (
          <button type="button" className="btn sm" onClick={() => setPicking(true)}>
            <Icon name="plus" size={14} /> Novo calendário
          </button>
        )}
      </header>

      {notes.length === 0 || picking ? (
        <section className="wcal-start">
          <h3>{notes.length ? "Novo calendário" : "Comece por um modelo"}</h3>
          <p className="muted small">
            Escolha o mais parecido com o que você imagina. Tudo pode ser mudado depois: nomes,
            quantos meses e dias, a semana, o ano em que a história começa.
          </p>
          <PresetPicker onPick={create} />
          {picking && (
            <button type="button" className="link-btn" onClick={() => setPicking(false)}>
              Cancelar
            </button>
          )}
        </section>
      ) : (
        <div className="wcal-body">
          <nav className="wcal-list" aria-label="Calendários do mundo">
            {notes.map((n) => {
              const d = data.calendars[n.id];
              const on = n.id === current?.id;
              return (
                <button
                  key={n.id}
                  type="button"
                  className={"wcal-item" + (on ? " on" : "")}
                  aria-current={on ? "true" : undefined}
                  onClick={() => setChosen(n.id)}
                >
                  <Icon name="calendar" size={16} />
                  <span>
                    <b>{n.title}</b>
                    <small className="muted">{d ? calendarSummary(d) : "Ainda sem meses"}</small>
                  </span>
                  {data.activeCalendar === n.id && <span className="wcal-badge">Em uso</span>}
                </button>
              );
            })}
          </nav>

          {current && (
            <section className="wcal-main">
              <div className="wcal-main-head">
                <input
                  key={current.id + current.title}
                  className="wcal-name"
                  aria-label="Nome do calendário"
                  defaultValue={current.title}
                  onBlur={(e) =>
                    e.target.value !== current.title && rename(current.id, e.target.value)
                  }
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                />
                {def &&
                  (inUse ? (
                    <span
                      className="wcal-badge big"
                      title="As datas da linha do tempo usam este calendário"
                    >
                      <Icon name="check" size={13} /> Em uso na linha do tempo
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="btn sm"
                      onClick={() => void setActiveCalendar(current.id)}
                    >
                      Usar na linha do tempo
                    </button>
                  ))}
                {inUse && (
                  <button
                    type="button"
                    className="link-btn"
                    title="A linha do tempo volta a mostrar Dia 1, Dia 2…"
                    onClick={() => void setActiveCalendar(null)}
                  >
                    parar de usar
                  </button>
                )}
                <button
                  type="button"
                  className="link-btn"
                  title="Imagens, anotações e onde o calendário aparece no texto"
                  onClick={() => onOpenNote(current.id)}
                >
                  Abrir ficha
                </button>
              </div>
              {def ? (
                <div className="wcal-editor">
                  <div className="wcal-side">
                    <MonthPreview def={def} />
                  </div>
                  <CalendarEditor noteId={current.id} embedded />
                </div>
              ) : (
                <>
                  <p className="muted small">Escolha um modelo para este calendário:</p>
                  <PresetPicker onPick={(d) => void setCalendar(current.id, d)} />
                </>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
