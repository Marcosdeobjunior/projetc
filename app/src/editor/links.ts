import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import { findWikiLinks, type Mention } from "../links/links";
import type { NoteKind } from "../manuscript/types";

/*
 * Links no editor:
 *  - destaca [[Nome]] (tracejado se o texto ainda não existe)
 *  - sublinha de leve os nomes de notas que aparecem no texto (menções)
 *  - Ctrl/⌘ + clique abre o texto ligado (ou cria a nota, se não existe)
 *  - ao digitar [[ mostra sugestões de cenas e notas
 */

export interface LinkSuggestion {
  id?: string;
  title: string;
  /** Descrição curta mostrada ao lado (ex.: "Personagem"). */
  hint: string;
  /** Criar uma nota nova com este título e tipo. */
  create?: NoteKind;
}

/** O editor pergunta ao app sobre os textos do projeto por aqui. */
export interface LinkContext {
  /** Id do texto aberto neste editor. */
  currentId: string;
  resolve(title: string): string | null;
  mentions(text: string): Mention[];
  open(id: string): void;
  createNote(title: string, kind: NoteKind): Promise<string | null>;
  suggest(query: string): LinkSuggestion[];
}

/** Meta de transação para redesenhar os links quando títulos mudam. */
export const REFRESH_LINKS = "inkflowRefreshLinks";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const OPEN_HINT = `${isMac ? "⌘" : "Ctrl"}+clique para abrir`;

function decorate(doc: PMNode, ctx: LinkContext): DecorationSet {
  const decos: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    // Folhas (quebra de linha) contam como 1 caractere, igual ao tamanho delas no documento.
    let text = "";
    node.forEach((child) => {
      text += child.isText ? child.text! : "\n";
    });
    const at = (offset: number) => pos + 1 + offset;

    const linked: [number, number][] = [];
    for (const l of findWikiLinks(text)) {
      const id = ctx.resolve(l.target);
      linked.push([l.from, l.to]);
      decos.push(
        Decoration.inline(at(l.from), at(l.to), {
          class: id ? "wikilink" : "wikilink unresolved",
          "data-doc": id ?? "",
          "data-title": l.target,
          title: id ? OPEN_HINT : `"${l.target}" ainda não existe. ${OPEN_HINT} para criar`,
        }),
      );
    }
    for (const m of ctx.mentions(text)) {
      if (m.noteId === ctx.currentId) continue;
      if (linked.some(([a, b]) => m.from < b && m.to > a)) continue;
      decos.push(
        Decoration.inline(at(m.from), at(m.to), {
          class: "mention",
          "data-doc": m.noteId,
          title: OPEN_HINT,
        }),
      );
    }
    return false;
  });
  return DecorationSet.create(doc, decos);
}

const linksKey = new PluginKey<DecorationSet>("inkflowLinks");

function linksPlugin(ctx: LinkContext) {
  return new Plugin<DecorationSet>({
    key: linksKey,
    state: {
      init: (_, state) => decorate(state.doc, ctx),
      apply: (tr, old, _prev, state: EditorState) =>
        tr.docChanged || tr.getMeta(REFRESH_LINKS) ? decorate(state.doc, ctx) : old,
    },
    props: {
      decorations: (state) => linksKey.getState(state),
      handleClick(_view, _pos, event) {
        if (!(event.ctrlKey || event.metaKey)) return false;
        const el = (event.target as HTMLElement).closest<HTMLElement>(".wikilink, .mention");
        if (!el) return false;
        const id = el.dataset.doc;
        if (id) ctx.open(id);
        else if (el.dataset.title) {
          void ctx.createNote(el.dataset.title, "ideias").then((newId) => newId && ctx.open(newId));
        }
        return true;
      },
    },
  });
}

/** Lista de sugestões que aparece ao digitar [[. */
function suggestionPopup() {
  let el: HTMLDivElement | null = null;
  let props: SuggestionProps<LinkSuggestion, LinkSuggestion> | null = null;
  let selected = 0;

  const render = () => {
    if (!el || !props) return;
    el.replaceChildren();
    if (props.items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "suggest-empty";
      empty.textContent = "Digite o nome de uma cena ou nota";
      el.append(empty);
    }
    props.items.forEach((item, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "suggest-item" + (i === selected ? " on" : "");
      b.setAttribute("role", "option");
      b.setAttribute("aria-selected", String(i === selected));
      const title = document.createElement("span");
      title.textContent = item.create ? `+ ${item.title}` : item.title;
      const hint = document.createElement("small");
      hint.textContent = item.hint;
      b.append(title, hint);
      b.addEventListener("mousedown", (e) => {
        e.preventDefault();
        props?.command(item);
      });
      el!.append(b);
    });
    const rect = props.clientRect?.();
    if (rect) {
      const top = Math.min(rect.bottom + 6, window.innerHeight - el.offsetHeight - 8);
      el.style.top = `${Math.max(8, top)}px`;
      el.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - el.offsetWidth - 8))}px`;
    }
  };

  return {
    onStart(p: SuggestionProps<LinkSuggestion, LinkSuggestion>) {
      el = document.createElement("div");
      el.className = "suggest";
      el.setAttribute("role", "listbox");
      el.setAttribute("aria-label", "Ligar a uma cena ou nota");
      document.body.append(el);
      props = p;
      selected = 0;
      render();
    },
    onUpdate(p: SuggestionProps<LinkSuggestion, LinkSuggestion>) {
      props = p;
      selected = Math.min(selected, Math.max(0, p.items.length - 1));
      render();
    },
    onKeyDown({ event }: { event: KeyboardEvent }) {
      if (!props || props.items.length === 0) return false;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const n = props.items.length;
        selected = (selected + (event.key === "ArrowDown" ? 1 : n - 1)) % n;
        render();
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        props.command(props.items[selected]!);
        return true;
      }
      return false;
    },
    onExit() {
      el?.remove();
      el = null;
      props = null;
    },
  };
}

export function createLinksExtension(ctx: LinkContext) {
  return Extension.create({
    name: "inkflowLinks",
    addProseMirrorPlugins() {
      const editor = this.editor as Editor;
      return [
        linksPlugin(ctx),
        Suggestion<LinkSuggestion, LinkSuggestion>({
          editor,
          pluginKey: new PluginKey("inkflowLinkSuggest"),
          char: "[[",
          allowSpaces: true,
          allowedPrefixes: null,
          // Fecha a lista quando o link já foi fechado com ]].
          allow: ({ state, range }) => !state.doc.textBetween(range.from, range.to).includes("]"),
          items: ({ query }) => ctx.suggest(query),
          command: ({ editor: ed, range, props: item }) => {
            ed.chain().focus().insertContentAt(range, `[[${item.title}]]`).run();
            if (item.create) void ctx.createNote(item.title, item.create);
          },
          render: suggestionPopup,
        }),
      ];
    },
  });
}
