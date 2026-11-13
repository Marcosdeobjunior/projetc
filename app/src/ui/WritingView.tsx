import { useEffect } from "react";
import { useWriting } from "../state/writing";
import { useApp } from "../state/store";
import { dateKey, heatmap, lastDays, streak } from "../writing/writing";
import { formatCount } from "../manuscript/wordCount";
import { exampleWriting } from "../timeline/example";

const WEEKS = 26;
const dayFmt = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" });
const monthFmt = new Intl.DateTimeFormat("pt-BR", { month: "short" });

/**
 * Calendário de escrita: palavras escritas por dia, meta diária, sequência
 * de dias e um mapa dos últimos meses.
 */
export function WritingView() {
  const log = useWriting((s) => s.log);
  const root = useApp((s) => s.session?.root);
  useEffect(() => {
    void useWriting.getState().load();
  }, [root]);

  const today = new Date();
  const todayKey = dateKey(today);
  const todayWords = log.days[todayKey] ?? 0;
  const goal = log.dailyGoal;
  const pct = goal ? Math.min(100, Math.round((todayWords / goal) * 100)) : 0;
  const weeks = heatmap(log, today, WEEKS);
  const max = Math.max(goal ?? 0, ...Object.values(log.days), 1);
  const level = (w: number) => (w <= 0 ? 0 : Math.min(4, Math.ceil((w / max) * 4)));
  const daysWithGoal = goal ? Object.values(log.days).filter((w) => w >= goal).length : 0;

  return (
    <div className="writing">
      <header className="world-head">
        <div>
          <h2>Metas de escrita</h2>
          <p className="muted">
            Palavras que você escreveu em cada dia, nas cenas do manuscrito. Apagar texto não
            desconta o que já foi escrito.
          </p>
        </div>
      </header>

      <div className="writing-stats">
        <div className="writing-stat">
          <b>{formatCount(todayWords)}</b>
          <span>hoje{goal ? ` de ${formatCount(goal)}` : ""}</span>
          {goal ? (
            <span className="bar" aria-label={`${pct}% da meta`}>
              <span style={{ width: `${pct}%` }} />
            </span>
          ) : null}
        </div>
        <div className="writing-stat">
          <b>{streak(log, today)}</b>
          <span>{streak(log, today) === 1 ? "dia seguido" : "dias seguidos"}</span>
        </div>
        <div className="writing-stat">
          <b>{formatCount(lastDays(log, today, 7))}</b>
          <span>nos últimos 7 dias</span>
        </div>
        <div className="writing-stat">
          <b>{formatCount(lastDays(log, today, 30))}</b>
          <span>nos últimos 30 dias</span>
        </div>
      </div>

      {Object.keys(log.days).length === 0 && (
        <p className="muted small">
          Ainda sem dias registrados: o calendário começa a contar quando você escreve.{" "}
          <button
            type="button"
            className="link-btn"
            onClick={() => void useWriting.getState().replace(exampleWriting(new Date()))}
          >
            Preencher com dias de teste
          </button>
        </p>
      )}

      <label className="writing-goal">
        Meta diária
        <input
          key={String(goal)}
          className="tl-num"
          inputMode="numeric"
          aria-label="Meta de palavras por dia"
          placeholder="—"
          defaultValue={goal ?? ""}
          onBlur={(e) => {
            const t = e.target.value.trim();
            const n = Number(t);
            if (t === "") return goal !== null && void useWriting.getState().setGoal(null);
            if (!Number.isInteger(n) || n <= 0) {
              e.target.value = goal === null ? "" : String(goal);
              return;
            }
            if (n !== goal) void useWriting.getState().setGoal(n);
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
        palavras
        {goal ? (
          <span className="muted small">
            · meta batida em {daysWithGoal} {daysWithGoal === 1 ? "dia" : "dias"}
          </span>
        ) : null}
      </label>

      <section className="heat" aria-label="Mapa dos dias escritos">
        <div className="heat-months" aria-hidden="true">
          {weeks.map((col, i) => {
            const first = col.find(Boolean);
            const prev = weeks[i - 1]?.find(Boolean);
            const show = first && (!prev || prev.date.getMonth() !== first.date.getMonth());
            return <span key={i}>{show ? monthFmt.format(first!.date) : ""}</span>;
          })}
        </div>
        <div className="heat-grid">
          {weeks.map((col, i) => (
            <div key={i} className="heat-col">
              {col.map((c, j) =>
                c ? (
                  <span
                    key={j}
                    className={
                      "heat-cell l" + level(c.words) + (c.key === todayKey ? " today" : "")
                    }
                    title={`${dayFmt.format(c.date)}: ${formatCount(c.words)} ${c.words === 1 ? "palavra" : "palavras"}`}
                  />
                ) : (
                  <span key={j} className="heat-cell empty" />
                ),
              )}
            </div>
          ))}
        </div>
        <p className="muted small heat-legend">
          Menos <span className="heat-cell l0" /> <span className="heat-cell l1" />{" "}
          <span className="heat-cell l2" /> <span className="heat-cell l3" />{" "}
          <span className="heat-cell l4" /> Mais · passe o mouse num dia para ver as palavras.
        </p>
      </section>
    </div>
  );
}
