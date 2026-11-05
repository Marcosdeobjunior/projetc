import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { findAll, type Hit } from "../search/search";
import { useSearch } from "../state/search";

/** Meta de transação para redesenhar os destaques quando a busca muda. */
export const REFRESH_SEARCH = "inkflowRefreshSearch";

/** Ocorrências da busca atual no documento do editor, em posições do documento. */
export function searchHits(doc: PMNode): Hit[] {
  const { open, query, exact, wholeWord } = useSearch.getState();
  if (!open || !query.trim()) return [];
  const out: Hit[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    let text = "";
    node.forEach((child) => {
      text += child.isText ? child.text! : "\n";
    });
    for (const h of findAll(text, query, { exact, wholeWord })) {
      out.push({ from: pos + 1 + h.from, to: pos + 1 + h.to });
    }
    return false;
  });
  return out;
}

const key = new PluginKey<DecorationSet>("inkflowSearch");

/** Destaca no texto aberto o que está sendo procurado no painel de busca. */
export const SearchHighlight = Extension.create({
  name: "searchHighlight",
  addProseMirrorPlugins() {
    const build = (doc: PMNode) =>
      DecorationSet.create(
        doc,
        searchHits(doc).map((h) => Decoration.inline(h.from, h.to, { class: "search-hit" })),
      );
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: (_, state) => build(state.doc),
          apply: (tr, old) => (tr.docChanged || tr.getMeta(REFRESH_SEARCH) ? build(tr.doc) : old),
        },
        props: { decorations: (state) => key.getState(state) },
      }),
    ];
  },
});
