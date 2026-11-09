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

export interface TimelineEvent extends Dated {
  id: string;
  title: string;
  /** Notas envolvidas (personagens, lugares…). */
  notes: string[];
}

export interface TimelineData {
  /** Data de cada cena, por id. Cena sem entrada = sem data. */
  scenes: Record<string, Dated>;
  /** Acontecimentos que não são cenas (guerras, nascimentos, a fuga do pai…). */
  events: TimelineEvent[];
  /** Definição de cada calendário do mundo, por id da nota da aba Calendários. */
  calendars: Record<string, CalendarDef>;
  /** Calendário usado para mostrar as datas da linha do tempo (null = "Dia N"). */
  activeCalendar: string | null;
}

export const EMPTY_TIMELINE: TimelineData = {
  scenes: {},
  events: [],
  calendars: {},
  activeCalendar: null,
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
    scenes?: unknown;
    events?: unknown;
    calendars?: unknown;
    activeCalendar?: unknown;
  };
  const scenes: Record<string, Dated> = {};
  if (o.scenes && typeof o.scenes === "object") {
    for (const [id, v] of Object.entries(o.scenes as Record<string, unknown>)) {
      const d = dated(v);
      if (d && id.length <= 64) scenes[id] = d;
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
  return { scenes, events, calendars, activeCalendar };
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
