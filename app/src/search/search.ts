import { allDocs } from "../manuscript/tree";
import type { DocRef, Project } from "../manuscript/types";

/*
 * Busca no projeto inteiro. Por padrão ignora maiúsculas e acentos ("joao"
 * encontra "João"). As posições devolvidas valem para o texto original.
 */

export interface SearchOptions {
  /** Diferencia maiúsculas e acentos. */
  exact?: boolean;
  /** Só palavras inteiras ("mar" não encontra "amar"). */
  wholeWord?: boolean;
}

export interface Hit {
  from: number;
  to: number;
}

/** Tira acentos e maiúsculas sem mudar o tamanho do texto (as posições continuam valendo). */
export function fold(text: string): string {
  let out = "";
  for (const c of text) {
    const f = c.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR");
    out += f.length === c.length ? f : c;
  }
  return out;
}

const WORD = /[\p{L}\p{N}_]/u;

export function findAll(text: string, query: string, opts: SearchOptions = {}): Hit[] {
  const q = opts.exact ? query : fold(query);
  if (!q.trim()) return [];
  const t = opts.exact ? text : fold(text);
  const hits: Hit[] = [];
  for (let i = t.indexOf(q); i !== -1; i = t.indexOf(q, i + q.length)) {
    const to = i + q.length;
    if (opts.wholeWord && (WORD.test(text[i - 1] ?? "") || WORD.test(text[to] ?? ""))) continue;
    hits.push({ from: i, to });
  }
  return hits;
}

export interface Snippet {
  before: string;
  match: string;
  after: string;
}

const CONTEXT = 48;

/** Trecho em volta de um resultado, cortado em palavras inteiras. */
export function snippet(text: string, hit: Hit): Snippet {
  const flat = (s: string) => s.replace(/\s+/g, " ");
  let start = Math.max(0, hit.from - CONTEXT);
  let end = Math.min(text.length, hit.to + CONTEXT);
  if (start > 0) start = text.indexOf(" ", start) + 1 || start;
  if (end < text.length)
    end = text.lastIndexOf(" ", end) > hit.to ? text.lastIndexOf(" ", end) : end;
  return {
    before: (start > 0 ? "…" : "") + flat(text.slice(start, hit.from)).trimStart(),
    match: text.slice(hit.from, hit.to),
    after: flat(text.slice(hit.to, end)).trimEnd() + (end < text.length ? "…" : ""),
  };
}

export interface DocResult {
  doc: DocRef;
  /** O título também tem o termo procurado. */
  inTitle: boolean;
  hits: Hit[];
}

/** Procura em todas as cenas (na ordem do livro) e notas, pelo título e pelo texto. */
export function searchProject(
  project: Project,
  texts: Record<string, string>,
  query: string,
  opts: SearchOptions = {},
): DocResult[] {
  if (!query.trim()) return [];
  const results: DocResult[] = [];
  for (const doc of allDocs(project)) {
    const hits = findAll(texts[doc.id] ?? "", query, opts);
    const inTitle = findAll(doc.title, query, opts).length > 0;
    if (hits.length || inTitle) results.push({ doc, inTitle, hits });
  }
  return results;
}
