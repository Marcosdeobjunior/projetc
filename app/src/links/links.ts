import type { DocRef, NoteKind, Project } from "../manuscript/types";
import { allDocs } from "../manuscript/tree";

/*
 * Links entre os textos do projeto, usados pelo grafo e pelo editor:
 *  - links escritos: [[Nome]] ou [[Nome|texto que aparece]]
 *  - menções: o nome de uma nota aparecendo no texto (ex.: "Helena" na cena)
 */

const WIKILINK = /\[\[([^[\]|\n]+?)(?:\|[^[\]\n]*)?\]\]/g;

export interface WikiLink {
  /** Título escrito entre os colchetes. */
  target: string;
  from: number;
  to: number;
}

export function findWikiLinks(text: string): WikiLink[] {
  return [...text.matchAll(WIKILINK)].map((m) => ({
    target: m[1]!.trim(),
    from: m.index,
    to: m.index + m[0].length,
  }));
}

const key = (title: string) => title.trim().toLocaleLowerCase("pt-BR");

/** Encontra cenas e notas pelo título, sem diferenciar maiúsculas. Notas têm prioridade. */
export function titleIndex(project: Project): Map<string, DocRef> {
  const map = new Map<string, DocRef>();
  for (const d of allDocs(project).reverse()) map.set(key(d.title), d);
  return map;
}

export function resolveLink(index: Map<string, DocRef>, target: string): DocRef | null {
  return index.get(key(target)) ?? null;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Procura onde os nomes das notas aparecem no texto. Diferencia maiúsculas
 * ("Rosa" a personagem, não "rosa" a cor) e só conta palavras inteiras.
 */
export function mentionMatcher(project: Project): RegExp | null {
  const titles = project.notes
    .map((n) => n.title.trim())
    .filter((t) => t.length >= 2)
    .sort((a, b) => b.length - a.length);
  if (titles.length === 0) return null;
  // Sem lookbehind: o macOS antes da versão 13.3 não suporta.
  return new RegExp(
    `(^|[^\\p{L}\\p{N}])(${titles.map(escapeRegex).join("|")})(?![\\p{L}\\p{N}])`,
    "gu",
  );
}

export interface Mention {
  noteId: string;
  from: number;
  to: number;
}

export function findMentions(project: Project, text: string, matcher = mentionMatcher(project)) {
  if (!matcher) return [];
  const byTitle = new Map(project.notes.map((n) => [n.title.trim(), n.id]));
  const out: Mention[] = [];
  for (const m of text.matchAll(matcher)) {
    const noteId = byTitle.get(m[2]!);
    const from = m.index + m[1]!.length;
    if (noteId) out.push({ noteId, from, to: from + m[2]!.length });
  }
  return out;
}

export type NodeType = "scene" | NoteKind;

export interface GraphNode {
  id: string;
  title: string;
  type: NodeType;
  degree: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  /** "link" = [[ ]] escrito; "mention" = nome encontrado no texto. */
  kind: "link" | "mention";
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Monta o grafo do projeto a partir do texto de cada cena e nota. */
export function buildGraph(
  project: Project,
  texts: Record<string, string>,
  opts: { mentions: boolean } = { mentions: true },
): Graph {
  const docs = allDocs(project);
  const index = titleIndex(project);
  const matcher = opts.mentions ? mentionMatcher(project) : null;
  const edges = new Map<string, GraphEdge>();

  const add = (a: string, b: string, kind: GraphEdge["kind"]) => {
    if (a === b) return;
    const id = a < b ? `${a}|${b}` : `${b}|${a}`;
    const existing = edges.get(id);
    // Um link escrito vale mais que uma menção entre os mesmos dois textos.
    if (!existing || (existing.kind === "mention" && kind === "link")) {
      edges.set(id, { source: a, target: b, kind });
    }
  };

  for (const d of docs) {
    const text = texts[d.id] ?? "";
    for (const l of findWikiLinks(text)) {
      const target = resolveLink(index, l.target);
      if (target) add(d.id, target.id, "link");
    }
    for (const m of findMentions(project, text, matcher)) add(d.id, m.noteId, "mention");
  }

  const degree = new Map<string, number>();
  for (const e of edges.values()) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }
  return {
    nodes: docs.map((d) => ({
      id: d.id,
      title: d.title,
      type: d.type,
      degree: degree.get(d.id) ?? 0,
    })),
    edges: [...edges.values()],
  };
}

const sameTitle = (a: string, b: string) => key(a) === key(b);

/**
 * Troca os links [[Antigo]] (e [[Antigo|texto]]) por [[Novo]] num texto.
 * O texto alternativo depois da barra é mantido.
 */
export function renameLinksInText(text: string, oldTitle: string, newTitle: string) {
  let count = 0;
  const out = text.replace(WIKILINK, (whole, target: string) => {
    if (!sameTitle(target, oldTitle)) return whole;
    count++;
    // Função em vez de texto: "$" no título não pode virar padrão de troca.
    return whole.replace(target, () => newTitle);
  });
  return { text: out, count };
}

/** Os trechos de um texto que precisam mudar, do fim para o começo. */
export function linkEdits(text: string, oldTitle: string) {
  return findWikiLinks(text)
    .filter((l) => sameTitle(l.target, oldTitle))
    .map((l) => {
      // Posição exata do título dentro de [[ ... ]], ignorando espaços.
      const inner = text.slice(l.from + 2, l.to - 2);
      const start = l.from + 2 + inner.indexOf(l.target);
      return { from: start, to: start + l.target.length };
    })
    .reverse();
}
