import type { VaultFs } from "../platform/types";

/*
 * Calendário de escrita (do escritor, não do mundo): quantas palavras foram
 * escritas em cada dia e a meta diária. Conta só o que entra digitando nas
 * cenas do manuscrito (palavras apagadas não descontam o que já foi escrito).
 */

export const WRITING_FILE = ".talia/escrita.json";

export interface WritingLog {
  /** Meta de palavras por dia (null = sem meta). */
  dailyGoal: number | null;
  /** Palavras escritas por dia, chave "AAAA-MM-DD" (data local). */
  days: Record<string, number>;
}

export const EMPTY_LOG: WritingLog = { dailyGoal: null, days: {} };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX = 10_000_000;

export function sanitizeLog(raw: unknown): WritingLog {
  const o = (raw ?? {}) as Partial<WritingLog>;
  const days: Record<string, number> = {};
  if (o.days && typeof o.days === "object")
    for (const [k, v] of Object.entries(o.days))
      if (DATE.test(k) && typeof v === "number" && Number.isInteger(v) && v > 0 && v <= MAX)
        days[k] = v;
  const g = o.dailyGoal;
  return {
    dailyGoal: typeof g === "number" && Number.isInteger(g) && g > 0 && g <= MAX ? g : null,
    days,
  };
}

export async function readLog(fs: VaultFs): Promise<WritingLog> {
  const raw = await fs.readText(WRITING_FILE);
  if (!raw) return EMPTY_LOG;
  try {
    return sanitizeLog(JSON.parse(raw));
  } catch {
    return EMPTY_LOG;
  }
}

export async function writeLog(fs: VaultFs, log: WritingLog): Promise<void> {
  await fs.writeText(WRITING_FILE, JSON.stringify({ format: 1, ...log }, null, 2) + "\n");
}

/** "AAAA-MM-DD" da data local. */
export function dateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/**
 * Dias seguidos com escrita até hoje. Se hoje ainda não teve escrita, conta
 * até ontem (a sequência só quebra quando um dia inteiro passa em branco).
 */
export function streak(log: WritingLog, today: Date): number {
  let d = log.days[dateKey(today)] ? today : addDays(today, -1);
  let n = 0;
  while (log.days[dateKey(d)]) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

/** Soma das palavras nos últimos `n` dias, contando hoje. */
export function lastDays(log: WritingLog, today: Date, n: number): number {
  let total = 0;
  for (let i = 0; i < n; i++) total += log.days[dateKey(addDays(today, -i))] ?? 0;
  return total;
}

/**
 * Semanas para o mapa de calor: colunas de domingo a sábado, terminando na
 * semana de hoje. Dias depois de hoje vêm como null.
 */
export type HeatCell = { key: string; words: number; date: Date } | null;

export function heatmap(log: WritingLog, today: Date, weeks: number): HeatCell[][] {
  const end = addDays(today, 6 - today.getDay());
  const start = addDays(end, -(weeks * 7 - 1));
  const out: HeatCell[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col: HeatCell[] = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, w * 7 + d);
      const key = dateKey(date);
      col.push(date > today ? null : { key, words: log.days[key] ?? 0, date });
    }
    out.push(col);
  }
  return out;
}
