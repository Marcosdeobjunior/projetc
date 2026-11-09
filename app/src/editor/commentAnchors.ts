import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import * as Y from "yjs";
import {
  absolutePositionToRelativePosition,
  relativePositionToAbsolutePosition,
  ySyncPluginKey,
} from "@tiptap/y-tiptap";
import type { Comment } from "../comments/comments";

/*
 * Âncoras dos comentários no texto: converte a seleção em posições relativas
 * do Yjs (que acompanham as edições) e pinta os trechos comentados.
 */

/** Evento para o editor redesenhar os trechos depois que a lista mudou. */
export const REFRESH_COMMENTS = "taliaRefreshComments";

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));

function binding(state: EditorState) {
  const b = ySyncPluginKey.getState(state)?.binding;
  return b && b.type && b.doc ? b : null;
}

/** Âncora da seleção atual, ou null se não há texto selecionado. */
export function anchorFromSelection(
  editor: Editor,
): { from: string; to: string; quote: string } | null {
  const { state } = editor;
  const { from, to, empty } = state.selection;
  const b = binding(state);
  if (empty || !b) return null;
  const quote = state.doc.textBetween(from, to, " ").trim();
  if (!quote) return null;
  const rel = (pos: number) =>
    toB64(Y.encodeRelativePosition(absolutePositionToRelativePosition(pos, b.type, b.mapping)));
  return { from: rel(from), to: rel(to), quote: quote.slice(0, 2000) };
}

/** Onde o trecho do comentário está agora no texto (null se foi apagado). */
export function resolveAnchor(
  state: EditorState,
  c: Pick<Comment, "from" | "to">,
): { from: number; to: number } | null {
  const b = binding(state);
  if (!b) return null;
  try {
    const abs = (s: string) =>
      relativePositionToAbsolutePosition(
        b.doc,
        b.type,
        Y.decodeRelativePosition(fromB64(s)),
        b.mapping,
      );
    const from = abs(c.from);
    const to = abs(c.to);
    if (from === null || to === null || to <= from) return null;
    return { from, to };
  } catch {
    return null;
  }
}

const key = new PluginKey<DecorationSet>("taliaComments");

export interface CommentAnchorsOptions {
  /** Comentários da cena (lidos a cada desenho). */
  comments: () => Comment[];
  /** Comentário em destaque (selecionado na lista). */
  focused: () => string | null;
}

export const CommentAnchors = Extension.create<CommentAnchorsOptions>({
  name: "taliaComments",
  addOptions() {
    return { comments: () => [], focused: () => null };
  },
  addProseMirrorPlugins() {
    const opts = this.options;
    const build = (state: EditorState) => {
      const decos: Decoration[] = [];
      const focused = opts.focused();
      for (const c of opts.comments()) {
        if (c.resolved) continue;
        const r = resolveAnchor(state, c);
        if (!r) continue;
        decos.push(
          Decoration.inline(r.from, r.to, {
            class: "comment-mark" + (c.id === focused ? " focused" : ""),
            "data-comment": c.id,
          }),
        );
      }
      return DecorationSet.create(state.doc, decos);
    };
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: (_, state) => build(state),
          // Edição local: só desloca os trechos (o mapeamento do Yjs ainda não
          // foi atualizado nesta transação). Mudanças vindas do Yjs (abrir,
          // sync) ou da lista de comentários: recalcula pelas âncoras.
          apply: (tr, old, _prev, state) =>
            tr.getMeta(REFRESH_COMMENTS) || tr.getMeta(ySyncPluginKey)
              ? build(state)
              : old.map(tr.mapping, tr.doc),
        },
        props: {
          decorations: (state) => key.getState(state),
        },
      }),
    ];
  },
});
