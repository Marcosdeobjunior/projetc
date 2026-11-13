import { useEffect, useState } from "react";
import { useTimeline } from "../state/timeline";
import {
  CALENDAR_PRESETS,
  calendarSummary,
  dayToDate,
  holidaysOn,
  formatDate,
  sanitizeCalendar,
  yearLength,
  type CalendarDef,
} from "../timeline/calendar";
import { Icon } from "./Icon";

/** Texto que só grava ao sair do campo (ou Enter), para não gravar a cada tecla. */
function TextField({
  value,
  label,
  className = "text-input",
  placeholder,
  onCommit,
}: {
  value: string;
  label: string;
  className?: string;
  placeholder?: string;
  onCommit(v: string): void;
}) {
  return (
    <input
      key={value}
      className={className}
      aria-label={label}
      placeholder={placeholder}
      defaultValue={value}
      onBlur={(e) => e.target.value !== value && onCommit(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

/** Número inteiro que só grava ao sair do campo. */
function IntField({
  value,
  label,
  min,
  max,
  onCommit,
}: {
  value: number;
  label: string;
  min?: number;
  max?: number;
  onCommit(v: number): void;
}) {
  return (
    <input
      key={value}
      className="tl-num"
      inputMode="numeric"
      aria-label={label}
      title={label}
      defaultValue={value}
      onBlur={(e) => {
        const n = Number(e.target.value.trim());
        const ok =
          Number.isInteger(n) && (min === undefined || n >= min) && (max === undefined || n <= max);
        if (!ok) e.target.value = String(value);
        else if (n !== value) onCommit(n);
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

function MonthSelect({
  def,
  value,
  label,
  onChange,
}: {
  def: CalendarDef;
  value: number;
  label: string;
  onChange(m: number): void;
}) {
  return (
    <select
      className="tool-select"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {def.months.map((m, i) => (
        <option key={i} value={i}>
          {m.name}
        </option>
      ))}
    </select>
  );
}

/**
 * Definição de um calendário do mundo, na ficha de uma nota da aba
 * Calendários: meses, semana, ano, que data é o dia 1 da história, feriados e
 * estações. A linha do tempo usa o calendário escolhido para mostrar as datas.
 */
/** Modelos para começar: um clique cria a definição inteira (dá para mudar tudo depois). */
export function PresetPicker({ onPick }: { onPick(def: CalendarDef, title: string): void }) {
  return (
    <ul className="cal-presets">
      {CALENDAR_PRESETS.map((p) => {
        const d1 = dayToDate(p.def, 1);
        return (
          <li key={p.id}>
            <button type="button" className="cal-preset" onClick={() => onPick(p.def, p.title)}>
              <b>{p.title}</b>
              <span className="muted small">{p.hint}</span>
              <span className="cal-preset-sample">
                <Icon name="calendar" size={13} />
                {formatDate(p.def, d1)}
              </span>
              <small className="muted">{calendarSummary(p.def)}</small>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Prévia de um mês do calendário em grade (o mês em que a história começa),
 * com o dia 1 da história marcado e os feriados.
 */
export function MonthPreview({ def, month: m }: { def: CalendarDef; month?: number }) {
  const month = m ?? def.start.month;
  const days = def.months[month]!.days;
  const week = def.weekdays.length;
  const cols = week >= 1 && week <= 10 ? week : 7;
  // Dia da semana do dia 1 do mês: anda a partir do dia 1 da história.
  const offset =
    def.months.slice(0, month).reduce((n, x) => n + x.days, 0) -
    def.months.slice(0, def.start.month).reduce((n, x) => n + x.days, 0) -
    (def.start.day - 1);
  const lead = week >= 1 && week <= 10 ? (((def.startWeekday + offset) % week) + week) % week : 0;
  const cells = [
    ...Array.from({ length: lead }, () => 0),
    ...Array.from({ length: Math.min(days, 70) }, (_, i) => i + 1),
  ];
  while (cells.length % cols) cells.push(0);
  return (
    <div className="cal-preview">
      <div className="cal-preview-title">
        <b>{def.months[month]!.name}</b>
        <span className="muted small">
          {days} dias{def.weekdays.length ? "" : " · sem semana"}
        </span>
      </div>
      <div className="cal-preview-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {week >= 1 &&
          week <= 10 &&
          def.weekdays.map((w) => (
            <span key={w} className="cal-preview-wd" title={w}>
              {w.slice(0, 2)}
            </span>
          ))}
        {cells.map((d, i) => {
          const start = month === def.start.month && d === def.start.day;
          const hol = d
            ? holidaysOn(def, { year: def.start.year, month, day: d, weekday: null })
            : [];
          return (
            <span
              key={i}
              className={
                "cal-preview-day" +
                (d ? "" : " empty") +
                (start ? " start" : "") +
                (hol.length ? " hol" : "")
              }
              title={start ? "Dia 1 da história" : hol.join(", ") || undefined}
            >
              {d || ""}
            </span>
          );
        })}
      </div>
      {days > 70 && <p className="muted small">Mostrando os primeiros 70 dias.</p>}
    </div>
  );
}

export function CalendarEditor({
  noteId,
  embedded = false,
}: {
  noteId: string;
  /** Dentro da tela "Calendário do mundo" (sem o título e sem a caixa "usar"). */
  embedded?: boolean;
}) {
  const data = useTimeline((s) => s.data);
  const { setCalendar, setActiveCalendar } = useTimeline.getState();
  const def = data.calendars[noteId];
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    void useTimeline.getState().load();
  }, []);

  if (!def) {
    return (
      <section className="cal-editor">
        <h3>Calendário do mundo</h3>
        <p className="muted small">
          Escolha um modelo para começar. A linha do tempo passa a mostrar as datas nele (“15 de
          Brumal de 412”) em vez de “Dia 37”; nomes e quantidades mudam à vontade depois.
        </p>
        <PresetPicker onPick={(d) => void setCalendar(noteId, d)} />
      </section>
    );
  }

  /** Grava uma mudança (sempre conferida, para meses e datas continuarem válidos). */
  const save = (patch: Partial<CalendarDef>) =>
    void setCalendar(noteId, sanitizeCalendar({ ...def, ...patch }));
  const day1 = dayToDate(def, 1);
  const active = data.activeCalendar === noteId;

  return (
    <section className="cal-editor">
      {!embedded && (
        <div className="cal-head">
          <h3>Calendário do mundo</h3>
          <label className="cal-active">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => void setActiveCalendar(e.target.checked ? noteId : null)}
            />
            Usar na linha do tempo
          </label>
        </div>
      )}
      <p className="muted small">
        O dia 1 da história é{" "}
        <b>{(day1.weekday ? `${day1.weekday}, ` : "") + formatDate(def, day1)}</b>. O ano tem{" "}
        {yearLength(def)} dias.
      </p>

      <div className="cal-block">
        <h4>Meses</h4>
        <ol className="cal-rows">
          {def.months.map((m, i) => (
            <li key={i}>
              <span className="cal-index">{i + 1}</span>
              <TextField
                value={m.name}
                label={`Nome do mês ${i + 1}`}
                onCommit={(name) =>
                  save({ months: def.months.map((x, j) => (j === i ? { ...x, name } : x)) })
                }
              />
              <IntField
                value={m.days}
                label={`Dias de ${m.name}`}
                min={1}
                max={1000}
                onCommit={(days) =>
                  save({ months: def.months.map((x, j) => (j === i ? { ...x, days } : x)) })
                }
              />
              <span className="muted small">dias</span>
              <button
                type="button"
                className="icon-btn sm"
                aria-label={`Subir ${m.name}`}
                title="Subir"
                disabled={i === 0}
                onClick={() => {
                  const months = [...def.months];
                  [months[i - 1], months[i]] = [months[i]!, months[i - 1]!];
                  save({ months });
                }}
              >
                <Icon name="up" size={14} />
              </button>
              <button
                type="button"
                className="icon-btn sm danger"
                aria-label={`Tirar ${m.name}`}
                title="Tirar o mês"
                disabled={def.months.length === 1}
                onClick={() => save({ months: def.months.filter((_, j) => j !== i) })}
              >
                <Icon name="trash" size={14} />
              </button>
            </li>
          ))}
        </ol>
        <button
          type="button"
          className="link-btn"
          onClick={() =>
            save({ months: [...def.months, { name: `Mês ${def.months.length + 1}`, days: 30 }] })
          }
        >
          + mês
        </button>
      </div>

      <div className="cal-grid">
        <div className="cal-block">
          <h4>Semana</h4>
          <TextField
            value={def.weekdays.join(", ")}
            label="Dias da semana, separados por vírgula"
            placeholder="Sem semana"
            onCommit={(v) =>
              save({
                weekdays: v
                  .split(",")
                  .map((w) => w.trim())
                  .filter(Boolean),
              })
            }
          />
          <p className="muted small">Separados por vírgula. Vazio = o mundo não tem semana.</p>
        </div>
        <div className="cal-block">
          <h4>Ano</h4>
          <TextField
            value={def.yearSuffix}
            label="Texto depois do ano"
            placeholder="ex.: da Segunda Era"
            onCommit={(yearSuffix) => save({ yearSuffix })}
          />
          <p className="muted small">Aparece depois do número do ano.</p>
        </div>
      </div>

      <div className="cal-block">
        <h4>O dia 1 da história é</h4>
        <div className="cal-inline">
          <IntField
            value={def.start.day}
            label="Dia do mês"
            min={1}
            max={def.months[def.start.month]!.days}
            onCommit={(day) => save({ start: { ...def.start, day } })}
          />
          de
          <MonthSelect
            def={def}
            value={def.start.month}
            label="Mês"
            onChange={(month) => save({ start: { ...def.start, month, day: 1 } })}
          />
          de
          <IntField
            value={def.start.year}
            label="Ano"
            onCommit={(year) => save({ start: { ...def.start, year } })}
          />
          {def.weekdays.length > 0 && (
            <>
              , um(a)
              <select
                className="tool-select"
                aria-label="Dia da semana do dia 1"
                value={def.startWeekday}
                onChange={(e) => save({ startWeekday: Number(e.target.value) })}
              >
                {def.weekdays.map((w, i) => (
                  <option key={i} value={i}>
                    {w}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>

      <div className="cal-grid">
        <div className="cal-block">
          <h4>Feriados e festas</h4>
          <ul className="cal-rows">
            {def.holidays.map((h, i) => (
              <li key={i}>
                <TextField
                  value={h.name}
                  label="Nome do feriado"
                  onCommit={(name) =>
                    name.trim() &&
                    save({ holidays: def.holidays.map((x, j) => (j === i ? { ...x, name } : x)) })
                  }
                />
                <IntField
                  value={h.day}
                  label="Dia"
                  min={1}
                  max={def.months[h.month]!.days}
                  onCommit={(day) =>
                    save({ holidays: def.holidays.map((x, j) => (j === i ? { ...x, day } : x)) })
                  }
                />
                <MonthSelect
                  def={def}
                  value={h.month}
                  label="Mês do feriado"
                  onChange={(month) =>
                    save({
                      holidays: def.holidays.map((x, j) => (j === i ? { ...x, month, day: 1 } : x)),
                    })
                  }
                />
                <button
                  type="button"
                  className="icon-btn sm danger"
                  aria-label={`Tirar ${h.name}`}
                  onClick={() => save({ holidays: def.holidays.filter((_, j) => j !== i) })}
                >
                  <Icon name="trash" size={14} />
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="link-btn"
            onClick={() =>
              save({ holidays: [...def.holidays, { name: "Nova festa", month: 0, day: 1 }] })
            }
          >
            + feriado
          </button>
        </div>
        <div className="cal-block">
          <h4>Estações</h4>
          <ul className="cal-rows">
            {def.seasons.map((x, i) => (
              <li key={i}>
                <TextField
                  value={x.name}
                  label="Nome da estação"
                  onCommit={(name) =>
                    name.trim() &&
                    save({ seasons: def.seasons.map((y, j) => (j === i ? { ...y, name } : y)) })
                  }
                />
                começa em
                <MonthSelect
                  def={def}
                  value={x.month}
                  label="Mês em que a estação começa"
                  onChange={(month) =>
                    save({ seasons: def.seasons.map((y, j) => (j === i ? { ...y, month } : y)) })
                  }
                />
                <button
                  type="button"
                  className="icon-btn sm danger"
                  aria-label={`Tirar ${x.name}`}
                  onClick={() => save({ seasons: def.seasons.filter((_, j) => j !== i) })}
                >
                  <Icon name="trash" size={14} />
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="link-btn"
            onClick={() => save({ seasons: [...def.seasons, { name: "Nova estação", month: 0 }] })}
          >
            + estação
          </button>
        </div>
      </div>

      <div className="cal-foot">
        {confirming ? (
          <span className="tl-confirm">
            Apagar a definição deste calendário? A ficha e as datas das cenas continuam.
            <button
              type="button"
              className="link-btn danger"
              onClick={() => {
                setConfirming(false);
                void setCalendar(noteId, null);
              }}
            >
              Apagar
            </button>
            <button type="button" className="link-btn" onClick={() => setConfirming(false)}>
              Cancelar
            </button>
          </span>
        ) : (
          <button type="button" className="link-btn danger" onClick={() => setConfirming(true)}>
            Apagar a definição do calendário
          </button>
        )}
      </div>
    </section>
  );
}
