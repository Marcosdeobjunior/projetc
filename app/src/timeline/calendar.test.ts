import { describe, expect, it } from "vitest";
import {
  DEFAULT_CALENDAR,
  dateToDay,
  dayToDate,
  formatDate,
  holidaysOn,
  sanitizeCalendar,
  seasonOf,
  yearLength,
  type CalendarDef,
} from "./calendar";

const brumal: CalendarDef = {
  months: [
    { name: "Geada", days: 30 },
    { name: "Brumal", days: 20 },
    { name: "Colheita", days: 40 },
  ],
  weekdays: ["Sol", "Lua", "Ferro", "Água", "Vento"],
  yearSuffix: "da Segunda Era",
  start: { year: 412, month: 1, day: 15 },
  startWeekday: 2,
  holidays: [{ name: "Festa da Lua", month: 1, day: 20 }],
  seasons: [
    { name: "Inverno", month: 0 },
    { name: "Outono", month: 2 },
  ],
};

describe("calendário do mundo", () => {
  it("o dia 1 da história é a data de início", () => {
    const d = dayToDate(brumal, 1);
    expect(d).toEqual({ year: 412, month: 1, day: 15, weekday: "Ferro" });
    expect(formatDate(brumal, d)).toBe("15 de Brumal de 412 da Segunda Era");
  });

  it("avança meses, anos e dias da semana", () => {
    expect(dayToDate(brumal, 7)).toMatchObject({ year: 412, month: 2, day: 1, weekday: "Água" });
    // Ano de 90 dias: 90 dias depois do início, mesma data no ano seguinte.
    expect(yearLength(brumal)).toBe(90);
    expect(dayToDate(brumal, 91)).toMatchObject({ year: 413, month: 1, day: 15 });
  });

  it("volta para antes do início (dias negativos)", () => {
    expect(dayToDate(brumal, 0)).toMatchObject({ year: 412, month: 1, day: 14, weekday: "Lua" });
    expect(dayToDate(brumal, -14)).toMatchObject({ year: 412, month: 0, day: 30 });
    expect(dayToDate(brumal, -134)).toMatchObject({ year: 410, month: 2, day: 40 });
  });

  it("converte data em dia da história e de volta", () => {
    for (const day of [-500, -1, 0, 1, 2, 6, 7, 90, 91, 1234]) {
      const d = dayToDate(brumal, day);
      expect(dateToDay(brumal, d)).toBe(day);
    }
  });

  it("acha feriados e estações", () => {
    expect(holidaysOn(brumal, dayToDate(brumal, 6))).toEqual(["Festa da Lua"]);
    expect(seasonOf(brumal, dayToDate(brumal, 1))).toBe("Inverno");
    expect(seasonOf(brumal, dayToDate(brumal, 7))).toBe("Outono");
  });

  it("saneia definições vindas de fora", () => {
    const s = sanitizeCalendar({
      months: [{ name: "A", days: 0 }, { days: 10 }],
      weekdays: ["x", 3, ""],
      start: { year: 1.5, month: 9, day: 99 },
      holidays: [
        { name: "ok", month: 1, day: 10 },
        { name: "ruim", month: 7, day: 1 },
      ],
    });
    expect(s.months).toEqual([
      { name: "A", days: 30 },
      { name: "Mês", days: 10 },
    ]);
    expect(s.weekdays).toEqual(["x"]);
    expect(s.start).toEqual({ year: 1, month: 0, day: 1 });
    expect(s.holidays).toEqual([{ name: "ok", month: 1, day: 10 }]);
    expect(sanitizeCalendar(null).months).toEqual(DEFAULT_CALENDAR.months);
  });
});
