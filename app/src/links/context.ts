import type { LinkContext, LinkSuggestion } from "../editor/links";
import { allDocs } from "../manuscript/tree";
import { NOTE_KINDS, type NoteKind, type Project } from "../manuscript/types";
import { useApp } from "../state/store";
import { findMentions, mentionMatcher, resolveLink, titleIndex } from "./links";

export const KIND_LABEL: Record<NoteKind, { one: string; many: string; new: string }> = {
  personagens: { one: "Personagem", many: "Personagens", new: "Novo personagem" },
  lugares: { one: "Lugar", many: "Lugares", new: "Novo lugar" },
  ideias: { one: "Ideia", many: "Ideias", new: "Nova ideia" },
};

// Índices recalculados só quando o projeto muda (não a cada tecla).
const cache = new WeakMap<
  Project,
  { index: ReturnType<typeof titleIndex>; matcher: RegExp | null }
>();
function indexes(p: Project) {
  let c = cache.get(p);
  if (!c) {
    c = { index: titleIndex(p), matcher: mentionMatcher(p) };
    cache.set(p, c);
  }
  return c;
}

const fold = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR").trim();

/** Sugestões para [[: notas primeiro, depois cenas; e opções para criar a nota. */
export function suggestLinks(p: Project, query: string): LinkSuggestion[] {
  const q = fold(query);
  const chapterOf = new Map(p.chapters.flatMap((c) => c.scenes.map((s) => [s.id, c.title])));
  const docs = allDocs(p)
    .filter((d) => fold(d.title).includes(q))
    .sort((a, b) => Number(a.type === "scene") - Number(b.type === "scene"))
    .slice(0, 8)
    .map<LinkSuggestion>((d) => ({
      id: d.id,
      title: d.title,
      hint: d.type === "scene" ? `Cena · ${chapterOf.get(d.id)}` : KIND_LABEL[d.type].one,
    }));
  const title = query.trim();
  if (!title || allDocs(p).some((d) => fold(d.title) === q)) return docs;
  return [
    ...docs,
    ...NOTE_KINDS.map((kind) => ({
      title,
      hint: KIND_LABEL[kind].new,
      create: kind,
    })),
  ];
}

export function createLinkContext(currentId: string): LinkContext {
  const project = () => useApp.getState().session?.project ?? null;
  return {
    currentId,
    resolve(title) {
      const p = project();
      return p ? (resolveLink(indexes(p).index, title)?.id ?? null) : null;
    },
    mentions(text) {
      const p = project();
      return p ? findMentions(p, text, indexes(p).matcher) : [];
    },
    open: (id) => useApp.getState().openDoc(id),
    createNote: (title, kind) => useApp.getState().createNote(kind, title),
    suggest(query) {
      const p = project();
      return p ? suggestLinks(p, query) : [];
    },
  };
}
