import type { VaultFs } from "../platform/types";
import type { Project } from "../manuscript/types";
import { sanitizeCalendar, type CalendarDef } from "./calendar";

/*
 * Linha do tempo da história. As datas são sempre do autor: cada cena (e cada
 * evento que não vira cena) recebe um dia da história e, se quiser, quantos
 * dias dura. O app só ordena e faz contas (quanto tempo passou entre uma
 * coisa e outra); nunca decide uma data sozinho.
 *
 * Os dias são números inteiros a partir do dia 1 da história. Um calendário
 * próprio do mundo (meses, eras) só muda como o número é mostrado.
 */

export const TIMELINE_FILE = ".talia/linha-do-tempo.json";

export interface Dated {
  /** Dia da história (1, 2, 3…). */
  day: number;
  /** Quantos dias dura (1 = dentro do mesmo dia). */
  days: number;
}

/** Data de uma cena, com o local (para os avisos de viagem). */
export interface SceneDate extends Dated {
  /** Onde a cena se passa (id de uma nota de lugar). Sem isto, vale o único lugar citado. */
  place?: string;
  /** O autor mandou ignorar os avisos de continuidade desta cena. */
  ignore?: boolean;
}

/** Quanto tempo leva ir de um lugar a outro (vale nos dois sentidos). */
export interface Travel {
  from: string;
  to: string;
  days: number;
}

export interface TimelineEvent extends Dated {
  id: string;
  title: string;
  /** Notas envolvidas (personagens, lugares…). */
  notes: string[];
}

export interface TimelineData {
  /** Data de cada cena, por id. Cena sem entrada = sem data. */
  scenes: Record<string, SceneDate>;
  /** Acontecimentos que não são cenas (guerras, nascimentos, a fuga do pai…). */
  events: TimelineEvent[];
  /** Definição de cada calendário do mundo, por id da nota da aba Calendários. */
  calendars: Record<string, CalendarDef>;
  /** Calendário usado para mostrar as datas da linha do tempo (null = "Dia N"). */
  activeCalendar: string | null;
  /** Dia da história em que cada personagem nasceu (por id da nota). */
  births: Record<string, number>;
  /** Tempos de viagem entre lugares (referência; só servem para avisos). */
  travel: Travel[];
}

export const EMPTY_TIMELINE: TimelineData = {
  scenes: {},
  events: [],
  calendars: {},
  activeCalendar: null,
  births: {},
  travel: [],
};

const MAX_DAY = 10_000_000;

function dated(v: unknown): Dated | null {
  const o = v as Partial<Dated> | null;
  if (!o || typeof o.day !== "number" || !Number.isInteger(o.day)) return null;
  if (o.day < -MAX_DAY || o.day > MAX_DAY) return null;
  const days =
    typeof o.days === "number" && Number.isInteger(o.days) && o.days >= 1 && o.days <= MAX_DAY
      ? o.days
      : 1;
  return { day: o.day, days };
}

/** Confere o arquivo lido (pode ter vindo de fora ou do Drive). */
export function sanitizeTimeline(raw: unknown): TimelineData {
  const o = (raw ?? {}) as {
    births?: unknown;
    travel?: unknown;
    scenes?: unknown;
    events?: unknown;
    calendars?: unknown;
    activeCalendar?: unknown;
  };
  const scenes: Record<string, SceneDate> = {};
  if (o.scenes && typeof o.scenes === "object") {
    for (const [id, v] of Object.entries(o.scenes as Record<string, unknown>)) {
      const d = dated(v);
      if (!d || id.length > 64) continue;
      const x = v as Partial<SceneDate>;
      const scene: SceneDate = d;
      if (typeof x.place === "string" && x.place && x.place.length <= 64) scene.place = x.place;
      if (x.ignore === true) scene.ignore = true;
      scenes[id] = scene;
    }
  }
  const events: TimelineEvent[] = [];
  const seen = new Set<string>();
  if (Array.isArray(o.events)) {
    for (const e of o.events as Partial<TimelineEvent>[]) {
      const d = dated(e);
      if (!d || typeof e.id !== "string" || !e.id || seen.has(e.id)) continue;
      seen.add(e.id);
      events.push({
        ...d,
        id: e.id.slice(0, 64),
        title: typeof e.title === "string" ? e.title.slice(0, 500) : "",
        notes: Array.isArray(e.notes)
          ? e.notes.filter((n): n is string => typeof n === "string").slice(0, 200)
          : [],
      });
    }
  }
  const calendars: Record<string, CalendarDef> = {};
  if (o.calendars && typeof o.calendars === "object") {
    for (const [id, v] of Object.entries(o.calendars as Record<string, unknown>).slice(0, 100))
      if (id.length <= 64) calendars[id] = sanitizeCalendar(v);
  }
  const activeCalendar =
    typeof o.activeCalendar === "string" && calendars[o.activeCalendar] ? o.activeCalendar : null;
  const births: Record<string, number> = {};
  if (o.births && typeof o.births === "object") {
    for (const [id, v] of Object.entries(o.births as Record<string, unknown>))
      if (id.length <= 64 && typeof v === "number" && Number.isInteger(v) && Math.abs(v) <= MAX_DAY)
        births[id] = v;
  }
  const travel: Travel[] = [];
  if (Array.isArray(o.travel)) {
    for (const t of (o.travel as Partial<Travel>[]).slice(0, 2000)) {
      if (
        typeof t?.from === "string" &&
        typeof t.to === "string" &&
        t.from &&
        t.to &&
        t.from !== t.to &&
        typeof t.days === "number" &&
        Number.isInteger(t.days) &&
        t.days >= 0 &&
        t.days <= MAX_DAY &&
        !travel.some((x) => samePair(x, t as Travel))
      )
        travel.push({ from: t.from.slice(0, 64), to: t.to.slice(0, 64), days: t.days });
    }
  }
  return { scenes, events, calendars, activeCalendar, births, travel };
}

export async function readTimeline(fs: VaultFs): Promise<TimelineData> {
  const raw = await fs.readText(TIMELINE_FILE);
  if (!raw) return EMPTY_TIMELINE;
  try {
    return sanitizeTimeline(JSON.parse(raw));
  } catch {
    return EMPTY_TIMELINE;
  }
}

export async function writeTimeline(fs: VaultFs, data: TimelineData): Promise<void> {
  await fs.writeText(TIMELINE_FILE, JSON.stringify({ format: 1, ...data }, null, 2) + "\n");
}

export type TimelineItem =
  | (Dated & {
      kind: "scene";
      id: string;
      title: string;
      chapter: string;
      /** Posição no livro (0, 1, 2…), para saber se a história está fora de ordem. */
      bookIndex: number;
    })
  | (Dated & { kind: "event"; id: string; title: string; notes: string[] });

export interface TimelineGroup {
  day: number;
  items: TimelineItem[];
  /** Dias desde o fim do grupo anterior (null no primeiro). */
  gap: number | null;
}

export interface Timeline {
  groups: TimelineGroup[];
  /** Cenas ainda sem data, na ordem do livro. */
  undated: { id: string; title: string; chapter: string }[];
  /** Cenas contadas antes de outra que acontece mais cedo (flashback ou fora de ordem). */
  outOfOrder: Set<string>;
}

/**
 * Monta a linha do tempo: cenas com data e eventos, agrupados por dia e em
 * ordem de acontecimento. `only` filtra pelos textos ligados a uma nota.
 */
export function buildTimeline(
  project: Project,
  data: TimelineData,
  only?: { noteId: string; linked: Set<string> },
): Timeline {
  const items: TimelineItem[] = [];
  const undated: Timeline["undated"] = [];
  let bookIndex = 0;
  for (const c of project.chapters) {
    for (const s of c.scenes) {
      const i = bookIndex++;
      if (only && !only.linked.has(s.id)) continue;
      const d = data.scenes[s.id];
      if (d)
        items.push({
          kind: "scene",
          id: s.id,
          title: s.title,
          chapter: c.title,
          bookIndex: i,
          ...d,
        });
      else undated.push({ id: s.id, title: s.title, chapter: c.title });
    }
  }
  for (const e of data.events) {
    if (only && !e.notes.includes(only.noteId)) continue;
    items.push({ kind: "event", ...e });
  }
  // Mesmo dia: cenas na ordem do livro, eventos depois.
  items.sort(
    (a, b) =>
      a.day - b.day ||
      (a.kind === b.kind
        ? a.kind === "scene" && b.kind === "scene"
          ? a.bookIndex - b.bookIndex
          : 0
        : a.kind === "scene"
          ? -1
          : 1),
  );

  const groups: TimelineGroup[] = [];
  let lastEnd: number | null = null;
  for (const it of items) {
    let g = groups[groups.length - 1];
    if (!g || g.day !== it.day) {
      g = { day: it.day, items: [], gap: lastEnd === null ? null : it.day - lastEnd };
      groups.push(g);
    }
    g.items.push(it);
    const end = it.day + it.days - 1;
    lastEnd = lastEnd === null ? end : Math.max(lastEnd, end);
  }

  // Fora de ordem: uma cena que o livro conta depois de outra que acontece mais tarde.
  const outOfOrder = new Set<string>();
  const scenes = items.filter(
    (i): i is Extract<TimelineItem, { kind: "scene" }> => i.kind === "scene",
  );
  const byBook = [...scenes].sort((a, b) => a.bookIndex - b.bookIndex);
  let maxDay = -Infinity;
  for (const s of byBook) {
    if (s.day < maxDay) outOfOrder.add(s.id);
    maxDay = Math.max(maxDay, s.day);
  }

  return { groups, undated, outOfOrder };
}

/** Quanto tempo passou desde o fim do grupo anterior, em palavras. */
export function gapLabel(gap: number): string {
  if (gap < 0) return "ao mesmo tempo que o anterior";
  if (gap === 0) return "no mesmo dia";
  if (gap === 1) return "no dia seguinte";
  return `${gap} dias depois`;
}

const samePair = (a: Pick<Travel, "from" | "to">, b: Pick<Travel, "from" | "to">) =>
  (a.from === b.from && a.to === b.to) || (a.from === b.to && a.to === b.from);

/** Tempo de viagem cadastrado entre dois lugares, ou null se não houver. */
export function travelDays(
  data: Pick<TimelineData, "travel">,
  a: string,
  b: string,
): number | null {
  return data.travel.find((t) => samePair(t, { from: a, to: b }))?.days ?? null;
}

/** Troca (ou tira, com null) o tempo de viagem entre dois lugares. */
export function setTravel(travel: Travel[], a: string, b: string, days: number | null): Travel[] {
  const rest = travel.filter((t) => !samePair(t, { from: a, to: b }));
  return days === null ? rest : [...rest, { from: a, to: b, days }];
}

// ---------------------------------------------------------------- continuidade

export interface ContinuityInput {
  project: Project;
  data: TimelineData;
  /** Textos ligados a cada texto (links e menções), nos dois sentidos. */
  linksOf: Map<string, string[]>;
  /** Dias de um ano (do calendário do mundo, ou 365). */
  yearLength: number;
}

export interface TravelWarning {
  noteId: string;
  from: string;
  to: string;
  /** Dias que a viagem leva. */
  needs: number;
  /** Dias que passaram entre o fim da cena anterior e esta. */
  had: number;
  /** Cena anterior do personagem. */
  prevScene: string;
}

export interface Continuity {
  /** Idade (anos completos) dos personagens com nascimento, em cada cena com data. */
  ages: Map<string, { noteId: string; age: number }[]>;
  /** Avisos de viagem rápida demais, pela cena de chegada. */
  warnings: Map<string, TravelWarning[]>;
  /** Local usado para cada cena (escolhido ou deduzido), e se foi deduzido. */
  places: Map<string, { place: string; auto: boolean }>;
}

/** Idade em anos completos no dia `day` de quem nasceu no dia `birth`. */
export const ageOn = (birth: number, day: number, yearLength: number) =>
  Math.floor((day - birth) / yearLength);

/**
 * Idades e avisos de continuidade. Só avisa quando a chegada é cedo demais
 * para o tempo de viagem cadastrado; demorar mais nunca é erro.
 */
export function continuity({ project, data, linksOf, yearLength }: ContinuityInput): Continuity {
  const kindOf = new Map(project.notes.map((n) => [n.id, n.kind]));
  const characters = (id: string) =>
    (linksOf.get(id) ?? []).filter((x) => kindOf.get(x) === "personagens");
  const ages = new Map<string, { noteId: string; age: number }[]>();
  const places = new Map<string, { place: string; auto: boolean }>();
  const dated: { id: string; day: number; end: number; bookIndex: number }[] = [];
  let bookIndex = 0;
  for (const c of project.chapters)
    for (const s of c.scenes) {
      const i = bookIndex++;
      const d = data.scenes[s.id];
      if (!d) continue;
      dated.push({ id: s.id, day: d.day, end: d.day + d.days - 1, bookIndex: i });
      const list = characters(s.id)
        .filter((n) => data.births[n] !== undefined)
        .map((n) => ({ noteId: n, age: ageOn(data.births[n]!, d.day, yearLength) }));
      if (list.length) ages.set(s.id, list);
      if (d.place && kindOf.get(d.place) === "lugares")
        places.set(s.id, { place: d.place, auto: false });
      else {
        const linked = (linksOf.get(s.id) ?? []).filter((x) => kindOf.get(x) === "lugares");
        if (linked.length === 1) places.set(s.id, { place: linked[0]!, auto: true });
      }
    }
  dated.sort((a, b) => a.day - b.day || a.bookIndex - b.bookIndex);

  const warnings = new Map<string, TravelWarning[]>();
  const last = new Map<string, { scene: string; end: number; place: string }>();
  for (const s of dated) {
    const place = places.get(s.id)?.place;
    for (const n of characters(s.id)) {
      const prev = last.get(n);
      if (place && prev && prev.place !== place && !data.scenes[s.id]!.ignore) {
        const needs = travelDays(data, prev.place, place);
        const had = s.day - prev.end;
        if (needs !== null && had < needs) {
          const list = warnings.get(s.id) ?? [];
          list.push({ noteId: n, from: prev.place, to: place, needs, had, prevScene: prev.scene });
          warnings.set(s.id, list);
        }
      }
      if (place) last.set(n, { scene: s.id, end: s.end, place });
    }
  }
  return { ages, warnings, places };
}

// ---------------------------------------------------------------- faixas

export interface LaneRow {
  noteId: string;
  /** Por dia: cenas e acontecimentos em que a nota aparece naquele dia. */
  cells: Map<number, { id: string; title: string; kind: "scene" | "event" }[]>;
}

export interface Lanes {
  /** Dias com alguma coisa, em ordem (as faixas pulam os dias vazios). */
  days: number[];
  rows: LaneRow[];
}

/**
 * Faixas por personagem (ou outro tipo de nota): uma linha para cada um, com
 * as cenas em que aparece, dia a dia, lado a lado com os outros. A cena entra
 * em todos os dias que dura.
 */
export function buildLanes(
  project: Project,
  data: TimelineData,
  linksOf: Map<string, string[]>,
  kinds: readonly string[] = ["personagens"],
): Lanes {
  const want = new Set(project.notes.filter((n) => kinds.includes(n.kind)).map((n) => n.id));
  const rows = new Map<string, LaneRow>();
  const days = new Set<number>();
  type Cell = { id: string; title: string; kind: "scene" | "event" };
  const put = (noteId: string, day: number, item: Cell) => {
    let row = rows.get(noteId);
    if (!row) rows.set(noteId, (row = { noteId, cells: new Map() }));
    const list = row.cells.get(day) ?? [];
    list.push(item);
    row.cells.set(day, list);
    days.add(day);
  };
  const MAX_SPAN = 366; // uma cena muito longa não enche a tela de colunas
  for (const c of project.chapters)
    for (const s of c.scenes) {
      const d = data.scenes[s.id];
      if (!d) continue;
      for (const n of linksOf.get(s.id) ?? []) {
        if (!want.has(n)) continue;
        for (let k = 0; k < Math.min(d.days, MAX_SPAN); k++)
          put(n, d.day + k, { id: s.id, title: s.title, kind: "scene" });
      }
    }
  for (const e of data.events)
    for (const n of e.notes) {
      if (!want.has(n)) continue;
      for (let k = 0; k < Math.min(e.days, MAX_SPAN); k++)
        put(n, e.day + k, { id: e.id, title: e.title, kind: "event" });
    }
  const order = new Map(project.notes.map((n, i) => [n.id, i]));
  const title = new Map(project.notes.map((n) => [n.id, n.title]));
  return {
    days: [...days].sort((a, b) => a - b),
    rows: [...rows.values()].sort(
      (a, b) =>
        (title.get(a.noteId) ?? "").localeCompare(title.get(b.noteId) ?? "", "pt-BR") ||
        (order.get(a.noteId) ?? 0) - (order.get(b.noteId) ?? 0),
    ),
  };
}
