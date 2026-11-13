import { useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import type { TimelineItem } from "../timeline/timeline";
import {
  dateToDay,
  dayToDate,
  holidaysOn,
  seasonOf,
  yearLength,
  type CalendarDef,
} from "../timeline/calendar";
import { Icon } from "./Icon";

/*
 * Duas formas simples de ver a linha do tempo, além da lista e das faixas:
 * - Calendário: a grade de um mês; clicar num dia cria um acontecimento e
 *   arrastar um item para outro dia muda a data dele.
 * - Cascata: cada cena ou acontecimento é uma barra numa régua de tempo, em
 *   degraus (o que vem depois fica mais abaixo e mais à direita); arrastar a
 *   barra muda o dia e puxar a ponta direita muda quanto dura.
 * Sem calendário do mundo, os dias se agrupam em "Mês 1, 2…" de 30 dias.
 */

/** Calendário neutro (sem nomes do mundo real) quando o autor não definiu um. */
export const PLAIN_CALENDAR: CalendarDef = {
  months: Array.from({ length: 12 }, (_, i) => ({ name: `Mês ${i + 1}`, days: 30 })),
  weekdays: [],
  yearSuffix: "",
  start: { year: 1, month: 0, day: 1 },
  startWeekday: 0,
  holidays: [],
  seasons: [],
};

export interface ViewActions {
  /** Muda o dia e/ou a duração de uma cena ou acontecimento. */
  move(it: TimelineItem, day: number, days: number): void;
  /** Cria um acontecimento no dia (devolve o id, para já abrir os detalhes). */
  create(day: number): Promise<string>;
  rename(id: string, title: string): void;
  remove(id: string): void;
  openScene(id: string): void;
}

/** Painel do item escolhido: nome, dia, duração e excluir (ou abrir a cena). */
function ItemPanel({
  item,
  dateText,
  actions,
  onClose,
  fresh = false,
}: {
  /** Acabou de ser criado: o nome já vem selecionado para digitar. */
  fresh?: boolean;
  item: TimelineItem;
  dateText(day: number): string;
  actions: ViewActions;
  onClose(): void;
}) {
  const [confirm, setConfirm] = useState(false);
  const end = item.day + item.days - 1;
  return (
    <div className="tlv-panel" role="dialog" aria-label={`Detalhes de ${item.title}`}>
      <div className="tlv-panel-head">
        <Icon name={item.kind === "scene" ? "file" : "clock"} size={15} />
        {item.kind === "scene" ? (
          <b>{item.title}</b>
        ) : (
          <input
            key={item.id + item.title}
            className="tl-title-input"
            aria-label="Nome do acontecimento"
            defaultValue={item.title}
            autoFocus={fresh}
            onFocus={(e) => fresh && e.target.select()}
            onBlur={(e) => {
              const t = e.target.value.trim();
              if (t && t !== item.title) actions.rename(item.id, t);
            }}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          />
        )}
        <button type="button" className="icon-btn sm" aria-label="Fechar" onClick={onClose}>
          <Icon name="close" size={14} />
        </button>
      </div>
      <p className="muted small">
        {dateText(item.day)}
        {item.days > 1 && ` até ${dateText(end)} (${item.days} dias)`}
      </p>
      <div className="tlv-panel-row">
        <span className="muted small">Dura</span>
        <button
          type="button"
          className="icon-btn sm"
          aria-label="Um dia a menos"
          disabled={item.days <= 1}
          onClick={() => actions.move(item, item.day, item.days - 1)}
        >
          −
        </button>
        <b>
          {item.days} {item.days === 1 ? "dia" : "dias"}
        </b>
        <button
          type="button"
          className="icon-btn sm"
          aria-label="Um dia a mais"
          onClick={() => actions.move(item, item.day, item.days + 1)}
        >
          +
        </button>
        <span className="tlv-spacer" />
        <button
          type="button"
          className="btn ghost sm"
          title="Um dia antes"
          onClick={() => actions.move(item, item.day - 1, item.days)}
        >
          ← dia
        </button>
        <button
          type="button"
          className="btn ghost sm"
          title="Um dia depois"
          onClick={() => actions.move(item, item.day + 1, item.days)}
        >
          dia →
        </button>
      </div>
      <div className="tlv-panel-row">
        {item.kind === "scene" ? (
          <button type="button" className="btn sm" onClick={() => actions.openScene(item.id)}>
            <Icon name="file" size={14} /> Abrir a cena
          </button>
        ) : confirm ? (
          <span className="tl-confirm">
            Excluir este acontecimento?
            <button
              type="button"
              className="link-btn danger"
              onClick={() => {
                actions.remove(item.id);
                onClose();
              }}
            >
              Sim
            </button>
            <button type="button" className="link-btn" onClick={() => setConfirm(false)}>
              Não
            </button>
          </span>
        ) : (
          <button type="button" className="btn ghost sm danger" onClick={() => setConfirm(true)}>
            <Icon name="trash" size={14} /> Excluir
          </button>
        )}
      </div>
    </div>
  );
}

const DRAG_TYPE = "application/x-talia-item";

/** Grade de um mês do calendário, com as cenas e acontecimentos de cada dia. */
export function CalendarMonthView({
  items,
  calendar,
  actions,
}: {
  items: TimelineItem[];
  calendar: CalendarDef | undefined;
  actions: ViewActions;
}) {
  const cal = calendar ?? PLAIN_CALENDAR;
  const named = !!calendar;
  // Começa no mês do primeiro item (ou no dia 1 da história).
  // (o primeiro a partir do dia 1: nascimentos de anos antes não puxam a vista para trás).
  const inStory = items.filter((i) => i.day >= 1);
  const first = inStory.length
    ? Math.min(...inStory.map((i) => i.day))
    : items.length
      ? Math.min(...items.map((i) => i.day))
      : 1;
  const [cursor, setCursor] = useState(() => {
    const d = dayToDate(cal, first);
    return { year: d.year, month: d.month };
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const month = cal.months[cursor.month] ?? cal.months[0]!;
  const day1 = dateToDay(cal, { year: cursor.year, month: cursor.month, day: 1 });
  // Semana: as colunas são os dias da semana do mundo (até 10); sem semana, 7 colunas.
  const week = cal.weekdays.length;
  const cols = week >= 1 && week <= 10 ? week : 7;
  const lead = week >= 1 && week <= 10 ? dayToDateWeekIndex(cal, day1) : 0;

  const byDay = (() => {
    const m = new Map<number, TimelineItem[]>();
    for (const it of items)
      for (let k = 0; k < Math.min(it.days, 400); k++) {
        const d = it.day + k;
        if (d < day1 || d >= day1 + month.days) continue;
        const list = m.get(d) ?? [];
        list.push(it);
        m.set(d, list);
      }
    return m;
  })();

  const step = (delta: number) => {
    let year = cursor.year;
    let mo = cursor.month;
    mo += delta;
    while (mo < 0) {
      mo += cal.months.length;
      year--;
    }
    while (mo >= cal.months.length) {
      mo -= cal.months.length;
      year++;
    }
    setCursor({ year, month: mo });
  };
  const dateText = (day: number) => {
    const d = dayToDate(cal, day);
    return named
      ? `${d.weekday ? d.weekday + ", " : ""}${d.day} de ${cal.months[d.month]!.name} de ${d.year}${cal.yearSuffix ? " " + cal.yearSuffix : ""}`
      : `Dia ${day}`;
  };
  const season = named
    ? seasonOf(cal, { year: cursor.year, month: cursor.month, day: 1, weekday: null })
    : null;
  const sel = items.find((i) => i.id === selected) ?? null;
  const count = [...byDay.values()].reduce((n, l) => n + l.length, 0);
  const itemsInYear = (y: number) => items.filter((i) => dayToDate(cal, i.day).year === y).length;

  const cells: (number | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: month.days }, (_, i) => day1 + i),
  ];
  while (cells.length % cols) cells.push(null);

  return (
    <section className="tlv-cal">
      <div className="tlv-cal-head">
        <button
          type="button"
          className="icon-btn"
          aria-label="Mês anterior"
          onClick={() => step(-1)}
        >
          ‹
        </button>
        <div className="tlv-cal-title">
          <h3>
            {month.name}{" "}
            {named
              ? `de ${cursor.year}${cal.yearSuffix ? " " + cal.yearSuffix : ""}`
              : `· Ano ${cursor.year}`}
          </h3>
          <small className="muted">
            {season && `${season} · `}
            {count ? `${count} ${count === 1 ? "item" : "itens"} neste mês` : "Nada neste mês"}
            {` · ${itemsInYear(cursor.year)} no ano`}
          </small>
        </div>
        <button type="button" className="icon-btn" aria-label="Próximo mês" onClick={() => step(1)}>
          ›
        </button>
        <span className="tlv-spacer" />
        <select
          className="tool-select"
          aria-label="Ir para o mês"
          value={cursor.month}
          onChange={(e) => setCursor({ ...cursor, month: Number(e.target.value) })}
        >
          {cal.months.map((m, i) => (
            <option key={i} value={i}>
              {m.name}
            </option>
          ))}
        </select>
        <input
          className="tl-num"
          type="number"
          aria-label="Ano"
          title="Ano"
          value={cursor.year}
          onChange={(e) =>
            Number.isInteger(Number(e.target.value)) &&
            e.target.value !== "" &&
            setCursor({ ...cursor, year: Number(e.target.value) })
          }
        />
        {items.length > 0 && (
          <button
            type="button"
            className="btn ghost sm"
            title="Volta para o mês do primeiro item da linha do tempo"
            onClick={() => {
              const d = dayToDate(cal, first);
              setCursor({ year: d.year, month: d.month });
            }}
          >
            Início da história
          </button>
        )}
      </div>
      <div
        className="tlv-grid"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        role="grid"
        aria-label={`${month.name}: clique num dia para criar um acontecimento`}
      >
        {week >= 1 &&
          week <= 10 &&
          cal.weekdays.map((w) => (
            <div key={w} className="tlv-wd" role="columnheader">
              {w.slice(0, 3)}
            </div>
          ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`e${i}`} className="tlv-cell empty" />;
          const list = byDay.get(day) ?? [];
          const d = dayToDate(cal, day);
          const hol = named ? holidaysOn(cal, d) : [];
          return (
            <div
              key={day}
              role="gridcell"
              className={"tlv-cell" + (over === day ? " over" : "") + (list.length ? " busy" : "")}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
                e.preventDefault();
                setOver(day);
              }}
              onDragLeave={() => setOver((o) => (o === day ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const id = e.dataTransfer.getData(DRAG_TYPE);
                const it = items.find((x) => x.id === id);
                if (it && it.day !== day) actions.move(it, day, it.days);
              }}
            >
              <button
                type="button"
                className="tlv-daynum"
                title={`${dateText(day)} · Dia ${day} da história. Clique para criar um acontecimento.`}
                onClick={() =>
                  void actions.create(day).then((id) => {
                    setFresh(id);
                    setSelected(id);
                  })
                }
              >
                {d.day}
                <span className="tlv-add" aria-hidden="true">
                  +
                </span>
              </button>
              {hol.map((h) => (
                <span key={h} className="tlv-holiday">
                  {h}
                </span>
              ))}
              {list.slice(0, 4).map((it) => (
                <button
                  key={it.id}
                  type="button"
                  draggable
                  className={
                    "tlv-pill " +
                    it.kind +
                    (it.day !== day ? " cont" : "") +
                    (selected === it.id ? " on" : "")
                  }
                  title={`${it.title}${it.days > 1 ? ` (${it.days} dias)` : ""}. Arraste para outro dia.`}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DRAG_TYPE, it.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onClick={() => setSelected(it.id)}
                >
                  {it.title}
                </button>
              ))}
              {list.length > 4 && <span className="tlv-more">+{list.length - 4}</span>}
            </div>
          );
        })}
      </div>
      {sel ? (
        <ItemPanel
          key={sel.id}
          fresh={fresh === sel.id}
          item={sel}
          dateText={dateText}
          actions={actions}
          onClose={() => setSelected(null)}
        />
      ) : (
        <p className="muted small">
          Clique no número de um dia para criar um acontecimento. Clique num item para ver os
          detalhes; arraste para outro dia para mudar a data.
          {!named && " Defina um calendário do mundo para ver meses e semanas com nomes."}
        </p>
      )}
    </section>
  );
}

/** Coluna (dia da semana) em que cai um dia da história. */
function dayToDateWeekIndex(cal: CalendarDef, day: number): number {
  const n = cal.weekdays.length;
  return (((cal.startWeekday + (day - 1)) % n) + n) % n;
}

const ZOOMS = [
  { label: "Dias", px: 34 },
  { label: "Semanas", px: 10 },
  { label: "Meses", px: 3 },
  { label: "Anos", px: 0.4 },
] as const;

/**
 * Cascata: uma barra por item numa régua de tempo, em degraus. Arrastar move o
 * item; puxar a ponta direita muda a duração.
 */
export function CascadeView({
  items,
  calendar,
  actions,
}: {
  items: TimelineItem[];
  calendar: CalendarDef | undefined;
  actions: ViewActions;
}) {
  const cal = calendar ?? PLAIN_CALENDAR;
  const named = !!calendar;
  const sorted = useMemo(
    () => [...items].sort((a, b) => a.day - b.day || a.days - b.days),
    [items],
  );
  const max = sorted.length ? Math.max(...sorted.map((i) => i.day + i.days)) : 30;
  // Trechos com alguma coisa; vazios longos viram um corte estreito ("… 7 anos depois").
  const spans = useMemo(() => {
    const out: { from: number; to: number }[] = [];
    for (const it of sorted) {
      const a = it.day - 2;
      const b = it.day + it.days + 2;
      const last = out[out.length - 1];
      if (last && a <= last.to + 45) last.to = Math.max(last.to, b);
      else out.push({ from: a, to: b });
    }
    return out.length ? out : [{ from: -1, to: 32 }];
  }, [sorted]);
  const active = spans.reduce((n, s) => n + (s.to - s.from), 0);
  // Começa num zoom em que tudo cabe numa tela larga (~900 px).
  const [zoom, setZoom] = useState(() => {
    const k = ZOOMS.findIndex((z) => active * z.px <= 900);
    return k < 0 ? ZOOMS.length - 1 : k;
  });
  const px = ZOOMS[zoom]!.px;
  const BREAK = 56;
  // Onde cada trecho começa na tela (com os cortes entre eles).
  const layout = useMemo(() => {
    let x0 = 0;
    return spans.map((s) => {
      const seg = { ...s, x0 };
      x0 += (s.to - s.from) * px + BREAK;
      return seg;
    });
  }, [spans, px]);
  const width = Math.max(320, layout.at(-1)!.x0 + (layout.at(-1)!.to - layout.at(-1)!.from) * px);
  const x = (day: number) => {
    let seg = layout[0]!;
    for (const s of layout) if (day >= s.from) seg = s;
    return seg.x0 + (day - seg.from) * px;
  };
  const [selected, setSelected] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [drag, setDrag] = useState<{
    id: string;
    mode: "move" | "size";
    start: number;
    delta: number;
  } | null>(null);
  const moved = useRef(false);

  const dateText = (day: number) => {
    const d = dayToDate(cal, day);
    return named
      ? `${d.day} de ${cal.months[d.month]!.name} de ${d.year}${cal.yearSuffix ? " " + cal.yearSuffix : ""}`
      : `Dia ${day}`;
  };
  const gapText = (days: number) => {
    const ylen = yearLength(cal);
    if (days >= ylen) {
      const y = Math.round(days / ylen);
      return `${y} ${y === 1 ? "ano" : "anos"}`;
    }
    const m = Math.round(days / 30);
    return m >= 2 ? `${m} meses` : `${days} dias`;
  };

  // Marcas da régua em cada trecho: cada dia de perto; meses (ou anos) de longe.
  const ticks = useMemo(() => {
    const out: { day: number; label: string; major: boolean }[] = [];
    const ylen = yearLength(cal);
    for (const seg of layout) {
      if (px >= 20) {
        for (let d = Math.ceil(seg.from); d <= seg.to; d++) {
          const dt = dayToDate(cal, d);
          out.push({ day: d, label: named ? String(dt.day) : String(d), major: dt.day === 1 });
        }
        continue;
      }
      const yearsOnly = px * ylen < 260;
      let d = dateToDay(cal, { ...dayToDate(cal, Math.floor(seg.from)), day: 1 });
      let firstOfSeg = true;
      for (let guard = 0; d <= seg.to && guard < 2000; guard++) {
        const dt = dayToDate(cal, d);
        if (d >= seg.from && (!yearsOnly || dt.month === 0 || firstOfSeg)) {
          out.push({
            day: d,
            label:
              dt.month === 0 || firstOfSeg
                ? `${named ? cal.months[dt.month]!.name.slice(0, 3) + " " + dt.year : "Ano " + dt.year}`
                : named
                  ? cal.months[dt.month]!.name.slice(0, 3)
                  : `M${dt.month + 1}`,
            major: dt.month === 0 || firstOfSeg,
          });
          firstOfSeg = false;
        }
        d += cal.months[dt.month]!.days;
      }
      // De perto mas sem início de mês no trecho: marca o primeiro dia dele.
      if (firstOfSeg) {
        const d0 = Math.ceil(seg.from);
        out.push({ day: d0, label: named ? dateText(d0) : `Dia ${d0}`, major: true });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cal, layout, px, named]);

  const onDown = (e: RPointerEvent, it: TimelineItem, mode: "move" | "size") => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    moved.current = false;
    setDrag({ id: it.id, mode, start: e.clientX, delta: 0 });
  };
  const onMove = (e: RPointerEvent) => {
    if (!drag) return;
    const delta = Math.round((e.clientX - drag.start) / px);
    if (delta !== drag.delta) {
      moved.current = true;
      setDrag({ ...drag, delta });
    }
  };
  const onUp = () => {
    if (!drag) return;
    const it = items.find((i) => i.id === drag.id);
    if (it && drag.delta) {
      if (drag.mode === "move") actions.move(it, it.day + drag.delta, it.days);
      else actions.move(it, it.day, Math.max(1, it.days + drag.delta));
    }
    if (!moved.current) setSelected(drag.id);
    setDrag(null);
  };

  const sel = items.find((i) => i.id === selected) ?? null;
  const ROW = 30;

  return (
    <section className="tlv-cascade">
      <div className="tlv-cal-head">
        <div className="segmented wide tlv-zoom" role="radiogroup" aria-label="Escala">
          {ZOOMS.map((z, i) => (
            <button
              key={z.label}
              type="button"
              role="radio"
              aria-checked={zoom === i}
              onClick={() => setZoom(i)}
            >
              {z.label}
            </button>
          ))}
        </div>
        <span className="tlv-spacer" />
        <button
          type="button"
          className="btn sm"
          onClick={() =>
            void actions.create(max).then((id) => {
              setFresh(id);
              setSelected(id);
            })
          }
        >
          <Icon name="plus" size={14} /> Acontecimento no fim
        </button>
      </div>
      {sorted.length === 0 ? (
        <p className="muted">
          Nada na linha do tempo ainda. Crie um acontecimento ou dê um dia às cenas em “Sem data”.
        </p>
      ) : (
        <div className="tlv-cascade-scroll">
          <div
            className="tlv-cascade-canvas"
            style={{ width, height: 30 + sorted.length * ROW + 10 }}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={() => setDrag(null)}
          >
            <div className="tlv-ruler">
              {ticks.map((t) => (
                <span
                  key={t.day}
                  className={"tlv-tick" + (t.major ? " major" : "")}
                  style={{ left: x(t.day) }}
                >
                  {t.label}
                </span>
              ))}
            </div>
            {layout.slice(1).map((seg, k) => {
              const prev = layout[k]!;
              return (
                <span
                  key={"b" + seg.from}
                  className="tlv-break"
                  style={{ left: prev.x0 + (prev.to - prev.from) * px, width: BREAK }}
                  title={`${gapText(seg.from - prev.to)} sem nada`}
                >
                  <span>… {gapText(seg.from - prev.to)}</span>
                </span>
              );
            })}
            {ticks.map((t) => (
              <span
                key={"l" + t.day}
                className={"tlv-gridline" + (t.major ? " major" : "")}
                style={{ left: x(t.day) }}
              />
            ))}
            {sorted.map((it, row) => {
              const d = drag?.id === it.id ? drag : null;
              const day = it.day + (d?.mode === "move" ? d.delta : 0);
              const days = Math.max(1, it.days + (d?.mode === "size" ? d.delta : 0));
              const left = x(day);
              const w = Math.max(6, days * px);
              const label = `${it.title} · ${dateText(day)}${days > 1 ? ` · ${days} dias` : ""}`;
              return (
                <div key={it.id} className="tlv-row" style={{ top: 30 + row * ROW }}>
                  {row > 0 && (
                    <span
                      className="tlv-link"
                      aria-hidden="true"
                      style={{
                        left: x(sorted[row - 1]!.day) + 3,
                        width: Math.max(0, left - x(sorted[row - 1]!.day) - 3),
                      }}
                    />
                  )}
                  <div
                    role="button"
                    tabIndex={0}
                    className={
                      "tlv-bar " +
                      it.kind +
                      (selected === it.id ? " on" : "") +
                      (d ? " dragging" : "")
                    }
                    style={{ left, width: w }}
                    title={`${label}. Arraste para mudar o dia; puxe a ponta para mudar a duração.`}
                    aria-label={label}
                    onPointerDown={(e) => onDown(e, it, "move")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") setSelected(it.id);
                      if (e.key === "ArrowRight") actions.move(it, it.day + 1, it.days);
                      if (e.key === "ArrowLeft") actions.move(it, it.day - 1, it.days);
                    }}
                  >
                    <span
                      className="tlv-grip"
                      aria-hidden="true"
                      onPointerDown={(e) => onDown(e, it, "size")}
                    />
                  </div>
                  <span className="tlv-bar-label" style={{ left: left + w + 6 }}>
                    <Icon name={it.kind === "scene" ? "file" : "clock"} size={12} /> {it.title}
                    <small>
                      {" "}
                      {dateText(day)}
                      {days > 1 && ` · ${days} dias`}
                    </small>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {sel ? (
        <ItemPanel
          key={sel.id}
          fresh={fresh === sel.id}
          item={sel}
          dateText={dateText}
          actions={actions}
          onClose={() => setSelected(null)}
        />
      ) : (
        sorted.length > 0 && (
          <p className="muted small">
            Cada barra é uma cena (azul) ou um acontecimento (dourado), em degraus na ordem da
            história. Arraste a barra para mudar o dia, puxe a ponta direita para mudar quanto dura,
            e clique para ver os detalhes. As setas ← → do teclado também movem a barra escolhida.
          </p>
        )
      )}
    </section>
  );
}
