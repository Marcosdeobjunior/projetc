import { useEffect, useState } from "react";
import type { Note } from "../manuscript/types";
import { useTimeline } from "../state/timeline";
import { dayToDate, formatDate, yearLength } from "../timeline/calendar";
import { travelDays } from "../timeline/timeline";
import { Icon } from "./Icon";

/** Dias de um ano no calendário escolhido para a linha do tempo (ou 365). */
export function useYearLength() {
  const data = useTimeline((s) => s.data);
  const cal = data.activeCalendar ? data.calendars[data.activeCalendar] : undefined;
  return { yearLen: cal ? yearLength(cal) : 365, calendar: cal };
}

/** Inteiro que só grava ao sair do campo; vazio = null. */
function IntInput({
  value,
  label,
  min,
  placeholder,
  onCommit,
}: {
  value: number | null;
  label: string;
  min?: number;
  placeholder?: string;
  onCommit(v: number | null): void;
}) {
  return (
    <input
      key={String(value)}
      className="tl-num"
      inputMode="numeric"
      aria-label={label}
      title={label}
      placeholder={placeholder}
      defaultValue={value ?? ""}
      onBlur={(e) => {
        const t = e.target.value.trim();
        if (t === "") return value !== null && onCommit(null);
        const n = Number(t);
        if (!Number.isInteger(n) || (min !== undefined && n < min)) {
          e.target.value = value === null ? "" : String(value);
          return;
        }
        if (n !== value) onCommit(n);
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

/** Nascimento do personagem: dia da história, ou a idade que ele tem no dia 1. */
export function BirthEditor({ note }: { note: Note }) {
  const birth = useTimeline((s) => s.data.births[note.id]);
  const { setBirth } = useTimeline.getState();
  const { yearLen, calendar } = useYearLength();
  useEffect(() => {
    void useTimeline.getState().load();
  }, []);
  const ageAtStart = birth === undefined ? null : Math.floor((1 - birth) / yearLen);
  const date =
    birth !== undefined && calendar ? formatDate(calendar, dayToDate(calendar, birth)) : null;

  return (
    <section className="cal-editor">
      <h3>Nascimento</h3>
      <div className="cal-inline">
        Nasceu no dia
        <IntInput
          value={birth ?? null}
          label="Dia da história em que nasceu"
          placeholder="—"
          onCommit={(v) => void setBirth(note.id, v)}
        />
        da história, ou tem
        <IntInput
          value={ageAtStart}
          label="Idade no dia 1 da história"
          min={0}
          placeholder="—"
          onCommit={(age) => void setBirth(note.id, age === null ? null : 1 - age * yearLen)}
        />
        anos no dia 1.
      </div>
      <p className="muted small">
        {birth === undefined
          ? "Com o nascimento, a linha do tempo mostra a idade de " +
            note.title +
            " em cada cena (anos de " +
            yearLen +
            " dias" +
            (calendar ? ", do calendário do mundo" : "") +
            ")."
          : date
            ? `Nascimento: ${date}. Dias antes do início da história são negativos.`
            : "Dias antes do início da história são negativos (ex.: −6205 = 17 anos antes)."}
      </p>
    </section>
  );
}

/** Tempos de viagem deste lugar até os outros (referência para os avisos). */
export function TravelEditor({ note, places }: { note: Note; places: Note[] }) {
  const data = useTimeline((s) => s.data);
  const { setTravelTime } = useTimeline.getState();
  const [adding, setAdding] = useState("");
  useEffect(() => {
    void useTimeline.getState().load();
  }, []);
  const others = places.filter((p) => p.id !== note.id);
  const known = others.filter((p) => travelDays(data, note.id, p.id) !== null);
  const missing = others.filter((p) => travelDays(data, note.id, p.id) === null);

  return (
    <section className="cal-editor">
      <h3>Tempo de viagem</h3>
      <p className="muted small">
        Quanto leva para ir daqui a outro lugar. É só uma referência: a linha do tempo avisa quando
        alguém chega cedo demais, nunca quando a viagem demora mais.
      </p>
      {known.length > 0 && (
        <ul className="cal-rows">
          {known.map((p) => (
            <li key={p.id}>
              <Icon name="pin" size={14} /> <span className="travel-to">{p.title}</span>
              <IntInput
                value={travelDays(data, note.id, p.id)}
                label={`Dias de viagem até ${p.title}`}
                min={0}
                onCommit={(v) => void setTravelTime(note.id, p.id, v)}
              />
              dias
              <button
                type="button"
                className="icon-btn sm danger"
                aria-label={`Tirar o tempo até ${p.title}`}
                onClick={() => void setTravelTime(note.id, p.id, null)}
              >
                <Icon name="trash" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {missing.length > 0 ? (
        <div className="cal-inline">
          <select
            className="tool-select"
            aria-label="Outro lugar"
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
          >
            <option value="">Escolha um lugar…</option>
            {missing.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn ghost sm"
            disabled={!adding}
            onClick={() => {
              void setTravelTime(note.id, adding, 1);
              setAdding("");
            }}
          >
            + tempo de viagem
          </button>
        </div>
      ) : (
        others.length === 0 && (
          <p className="muted small">Crie outro lugar no Mundo para cadastrar distâncias.</p>
        )
      )}
    </section>
  );
}
