import { describe, expect, it } from "vitest";
import { KeyValueFs, MemoryStore } from "../platform/kvFs";
import { dateKey, heatmap, lastDays, readLog, sanitizeLog, streak, writeLog } from "./writing";

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);

describe("calendário de escrita", () => {
  it("grava e lê o registro", async () => {
    const fs = new KeyValueFs(new MemoryStore(), "browser:teste");
    await writeLog(fs, { dailyGoal: 500, days: { "2026-11-09": 320 } });
    expect(await readLog(fs)).toEqual({ dailyGoal: 500, days: { "2026-11-09": 320 } });
  });

  it("descarta valores inválidos", () => {
    expect(
      sanitizeLog({ dailyGoal: -1, days: { "2026-11-09": 10, ontem: 5, "2026-11-08": 0 } }),
    ).toEqual({ dailyGoal: null, days: { "2026-11-09": 10 } });
  });

  it("conta a sequência de dias e soma a semana", () => {
    const log = {
      dailyGoal: null,
      days: { "2026-11-06": 100, "2026-11-07": 200, "2026-11-08": 300 },
    };
    // Hoje (9) ainda sem escrita: a sequência vale até ontem.
    expect(streak(log, day(2026, 11, 9))).toBe(3);
    expect(streak({ ...log, days: { ...log.days, "2026-11-09": 5 } }, day(2026, 11, 9))).toBe(4);
    expect(streak(log, day(2026, 11, 10))).toBe(0);
    expect(lastDays(log, day(2026, 11, 9), 7)).toBe(600);
    expect(dateKey(day(2026, 1, 5))).toBe("2026-01-05");
  });

  it("monta semanas de domingo a sábado terminando hoje", () => {
    const today = day(2026, 11, 9); // segunda-feira
    const h = heatmap({ dailyGoal: null, days: { "2026-11-09": 50 } }, today, 2);
    expect(h).toHaveLength(2);
    const last = h[1]!;
    expect(last[0]!.key).toBe("2026-11-08"); // domingo
    expect(last[1]!.words).toBe(50);
    expect(last[2]).toBeNull(); // amanhã
  });
});
