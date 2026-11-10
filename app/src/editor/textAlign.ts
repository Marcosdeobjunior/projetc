import { Extension } from "@tiptap/core";

/*
 * Alinhamento de parágrafos e títulos (esquerda, centro, direita, justificado).
 * Fica no atributo `textAlign` do bloco; no .md vira um comentário HTML
 * invisível antes do bloco (veja markdown/parse.ts e serialize.ts).
 */

export const ALIGNS = ["left", "center", "right", "justify"] as const;
export type Align = (typeof ALIGNS)[number];

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    textAlign: {
      /** Alinha os parágrafos e títulos da seleção ("left" volta ao padrão). */
      setTextAlign: (align: Align) => ReturnType;
    };
  }
}

const TYPES = ["paragraph", "heading"];

export const TextAlign = Extension.create({
  name: "textAlign",
  addGlobalAttributes() {
    return [
      {
        types: TYPES,
        attributes: {
          textAlign: {
            default: null,
            parseHTML: (el) => {
              const a = (el as HTMLElement).style.textAlign;
              return a && a !== "left" && (ALIGNS as readonly string[]).includes(a) ? a : null;
            },
            renderHTML: (attrs) =>
              attrs.textAlign ? { style: `text-align: ${attrs.textAlign as string}` } : {},
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setTextAlign:
        (align) =>
        ({ commands }) =>
          TYPES.map((t) =>
            commands.updateAttributes(t, { textAlign: align === "left" ? null : align }),
          ).some(Boolean),
    };
  },
  addKeyboardShortcuts() {
    return {
      "Mod-Shift-l": () => this.editor.commands.setTextAlign("left"),
      "Mod-Shift-e": () => this.editor.commands.setTextAlign("center"),
      "Mod-Shift-r": () => this.editor.commands.setTextAlign("right"),
      "Mod-Shift-j": () => this.editor.commands.setTextAlign("justify"),
    };
  },
});
