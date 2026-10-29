import type { Editor } from "@tiptap/core";

/*
 * Comandos de formatação usados pela barra de ferramentas e pelo menu do
 * botão direito, para os dois mostrarem os mesmos nomes e atalhos.
 */

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? "⌘" : "Ctrl";

export const shortcut = (keys: string) => keys.replace("Mod", MOD);

export type MarkId = "bold" | "italic" | "strike" | "highlight";

export const MARKS: { id: MarkId; label: string; icon: string; keys: string }[] = [
  { id: "bold", label: "Negrito", icon: "bold", keys: shortcut("Mod+B") },
  { id: "italic", label: "Itálico", icon: "italic", keys: shortcut("Mod+I") },
  { id: "strike", label: "Tachado", icon: "strike", keys: shortcut("Mod+Shift+S") },
  { id: "highlight", label: "Destacar", icon: "highlight", keys: shortcut("Mod+Shift+H") },
];

export function toggleMark(editor: Editor, id: MarkId) {
  const chain = editor.chain().focus();
  if (id === "bold") chain.toggleBold().run();
  else if (id === "italic") chain.toggleItalic().run();
  else if (id === "strike") chain.toggleStrike().run();
  else chain.toggleHighlight().run();
}

export type BlockStyle = "paragraph" | "1" | "2" | "3";

export const BLOCK_STYLES: { id: BlockStyle; label: string }[] = [
  { id: "paragraph", label: "Texto" },
  { id: "1", label: "Título 1" },
  { id: "2", label: "Título 2" },
  { id: "3", label: "Título 3" },
];

export function blockStyle(editor: Editor): BlockStyle {
  for (const level of [1, 2, 3] as const) {
    if (editor.isActive("heading", { level })) return String(level) as BlockStyle;
  }
  return "paragraph";
}

export function setBlockStyle(editor: Editor, style: BlockStyle) {
  const chain = editor.chain().focus();
  if (style === "paragraph") chain.setParagraph().run();
  else chain.setHeading({ level: Number(style) as 1 | 2 | 3 }).run();
}

export const clearFormatting = (editor: Editor) =>
  editor.chain().focus().unsetAllMarks().clearNodes().run();
