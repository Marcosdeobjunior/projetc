/*
 * Calendário próprio do mundo (fantasia, ficção científica…). Só muda como um
 * dia da história é mostrado: "Dia 37" vira "15 de Brumal de 412 da Segunda
 * Era". Sem anos bissextos: cada ano tem a soma dos dias dos meses.
 */

export interface CalendarMonth {
  name: string;
  days: number;
}

export interface CalendarDef {
  months: CalendarMonth[];
  /** Nomes dos dias da semana, em ordem. Vazio = o mundo não tem semana. */
  weekdays: string[];
  /** Texto depois do ano ("da Segunda Era", "d.C."). */
  yearSuffix: string;
  /** Que data é o dia 1 da história. */
  start: { year: number; month: number; day: number };
  /** Dia da semana do dia 1 da história (índice em `weekdays`). */
  startWeekday: number;
  /** Datas fixas que se repetem todo ano. */
  holidays: { name: string; month: number; day: number }[];
  /** Estações: cada uma começa no primeiro dia de um mês. */
  seasons: { name: string; month: number }[];
}

export interface CalendarDate {
  year: number;
  /** Índice do mês (0…). */
  month: number;
  /** Dia do mês (1…). */
  day: number;
  weekday: string | null;
}

export const DEFAULT_CALENDAR: CalendarDef = {
  months: [
    ["Janeiro", 31],
    ["Fevereiro", 28],
    ["Março", 31],
    ["Abril", 30],
    ["Maio", 31],
    ["Junho", 30],
    ["Julho", 31],
    ["Agosto", 31],
    ["Setembro", 30],
    ["Outubro", 31],
    ["Novembro", 30],
    ["Dezembro", 31],
  ].map(([name, days]) => ({ name: name as string, days: days as number })),
  weekdays: ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"],
  yearSuffix: "",
  start: { year: 1, month: 0, day: 1 },
  startWeekday: 0,
  holidays: [],
  seasons: [],
};

const int = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : fallback;
const str = (v: unknown, max = 80) => (typeof v === "string" ? v.slice(0, max) : "");

/** Confere uma definição lida do disco; o que não fizer sentido volta ao padrão. */
export function sanitizeCalendar(raw: unknown): CalendarDef {
  const o = (raw ?? {}) as Partial<CalendarDef>;
  const months = Array.isArray(o.months)
    ? o.months
        .map((m) => ({ name: str(m?.name) || "Mês", days: int(m?.days, 1, 1000, 30) }))
        .slice(0, 100)
    : [];
  const def: CalendarDef = {
    months: months.length ? months : DEFAULT_CALENDAR.months,
    weekdays: Array.isArray(o.weekdays)
      ? o.weekdays
          .map((w) => str(w))
          .filter(Boolean)
          .slice(0, 50)
      : [],
    yearSuffix: str(o.yearSuffix),
    start: { year: 1, month: 0, day: 1 },
    startWeekday: 0,
    holidays: [],
    seasons: [],
  };
  const m = def.months.length;
  const s = o.start ?? ({} as CalendarDef["start"]);
  const month = int(s.month, 0, m - 1, 0);
  def.start = {
    year: int(s.year, -1_000_000, 1_000_000, 1),
    month,
    day: int(s.day, 1, def.months[month]!.days, 1),
  };
  def.startWeekday = def.weekdays.length ? int(o.startWeekday, 0, def.weekdays.length - 1, 0) : 0;
  if (Array.isArray(o.holidays))
    def.holidays = o.holidays
      .map((h) => {
        const hm = int(h?.month, 0, m - 1, -1);
        return {
          name: str(h?.name),
          month: hm,
          day: hm < 0 ? 0 : int(h?.day, 1, def.months[hm]!.days, 0),
        };
      })
      .filter((h) => h.name && h.month >= 0 && h.day > 0)
      .slice(0, 500);
  if (Array.isArray(o.seasons))
    def.seasons = o.seasons
      .map((x) => ({ name: str(x?.name), month: int(x?.month, 0, m - 1, -1) }))
      .filter((x) => x.name && x.month >= 0)
      .slice(0, 50);
  return def;
}

export const yearLength = (def: CalendarDef) => def.months.reduce((n, m) => n + m.days, 0);

/** Dias desde o começo do ano até o início do mês. */
const monthOffset = (def: CalendarDef, month: number) =>
  def.months.slice(0, month).reduce((n, m) => n + m.days, 0);

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Que data do mundo é um dia da história (o dia 1 é `def.start`). */
export function dayToDate(def: CalendarDef, storyDay: number): CalendarDate {
  const ylen = yearLength(def);
  // Posição absoluta: dias desde o começo do "ano 0" do calendário.
  const startAbs = def.start.year * ylen + monthOffset(def, def.start.month) + (def.start.day - 1);
  const abs = startAbs + (storyDay - 1);
  const year = Math.floor(abs / ylen);
  let rest = abs - year * ylen;
  let month = 0;
  while (rest >= def.months[month]!.days) {
    rest -= def.months[month]!.days;
    month++;
  }
  const weekday = def.weekdays.length
    ? def.weekdays[mod(def.startWeekday + (storyDay - 1), def.weekdays.length)]!
    : null;
  return { year, month, day: rest + 1, weekday };
}

/** O dia da história de uma data do mundo (inverso de `dayToDate`). */
export function dateToDay(def: CalendarDef, d: { year: number; month: number; day: number }) {
  const ylen = yearLength(def);
  const startAbs = def.start.year * ylen + monthOffset(def, def.start.month) + (def.start.day - 1);
  const abs = d.year * ylen + monthOffset(def, d.month) + (d.day - 1);
  return abs - startAbs + 1;
}

export function holidaysOn(def: CalendarDef, d: CalendarDate): string[] {
  return def.holidays.filter((h) => h.month === d.month && h.day === d.day).map((h) => h.name);
}

/** Estação da data: a última que começou até aquele mês (dando a volta no ano). */
export function seasonOf(def: CalendarDef, d: CalendarDate): string | null {
  if (!def.seasons.length) return null;
  const sorted = [...def.seasons].sort((a, b) => a.month - b.month);
  const current = [...sorted].reverse().find((s) => s.month <= d.month);
  return (current ?? sorted[sorted.length - 1]!).name;
}

/** "15 de Brumal de 412 da Segunda Era". */
export function formatDate(def: CalendarDef, d: CalendarDate): string {
  const suffix = def.yearSuffix.trim();
  return `${d.day} de ${def.months[d.month]!.name} de ${d.year}${suffix ? " " + suffix : ""}`;
}

/** Modelos prontos para começar um calendário do mundo. */
export const CALENDAR_PRESETS: {
  id: string;
  title: string;
  hint: string;
  def: CalendarDef;
}[] = [
  {
    id: "nosso",
    title: "Como o nosso",
    hint: "12 meses de janeiro a dezembro, semana de 7 dias.",
    def: DEFAULT_CALENDAR,
  },
  {
    id: "fantasia",
    title: "Fantasia simples",
    hint: "12 meses de 30 dias com nomes do campo, 4 estações e uma era.",
    def: {
      ...DEFAULT_CALENDAR,
      months: [
        "Alvorada",
        "Degelo",
        "Semeadura",
        "Florada",
        "Verdejo",
        "Solar",
        "Colheita",
        "Vindima",
        "Brumal",
        "Geada",
        "Ermo",
        "Vigília",
      ].map((name) => ({ name, days: 30 })),
      weekdays: ["Soldia", "Luadia", "Ventodia", "Fogodia", "Águadia", "Terradia", "Repouso"],
      yearSuffix: "da Nova Era",
      start: { year: 412, month: 0, day: 1 },
      holidays: [
        { name: "Festa da Colheita", month: 6, day: 1 },
        { name: "Noite Longa", month: 11, day: 30 },
      ],
      seasons: [
        { name: "Primavera", month: 0 },
        { name: "Verão", month: 3 },
        { name: "Outono", month: 6 },
        { name: "Inverno", month: 9 },
      ],
    },
  },
  {
    id: "lunar",
    title: "Lunar",
    hint: "13 luas de 28 dias (4 semanas certinhas cada).",
    def: {
      ...DEFAULT_CALENDAR,
      months: [
        "Lua do Lobo",
        "Lua da Neve",
        "Lua do Corvo",
        "Lua da Semente",
        "Lua da Flor",
        "Lua do Mel",
        "Lua do Trovão",
        "Lua do Feno",
        "Lua da Cevada",
        "Lua da Caça",
        "Lua da Névoa",
        "Lua do Gelo",
        "Lua Azul",
      ].map((name) => ({ name, days: 28 })),
      start: { year: 1, month: 0, day: 1 },
    },
  },
  {
    id: "branco",
    title: "Em branco",
    hint: "12 meses numerados de 30 dias, sem semana. Dê os nomes depois.",
    def: {
      ...DEFAULT_CALENDAR,
      months: Array.from({ length: 12 }, (_, i) => ({ name: `Mês ${i + 1}`, days: 30 })),
      weekdays: [],
    },
  },
];

/** Resumo de uma definição: "12 meses · 360 dias · semana de 7". */
export function calendarSummary(def: CalendarDef): string {
  const w = def.weekdays.length;
  return `${def.months.length} ${def.months.length === 1 ? "mês" : "meses"} · ${yearLength(def)} dias${
    w ? ` · semana de ${w}` : " · sem semana"
  }`;
}
