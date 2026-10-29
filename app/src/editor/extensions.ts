import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

/** Nome do fragmento Yjs onde o texto da cena fica guardado. */
export const YDOC_FIELD = "default";

/**
 * Recursos de texto do editor. Precisam ser os mesmos em todo lugar, porque
 * definem o formato do documento salvo. Link e sublinhado ficam de fora por
 * não terem equivalente simples em Markdown; código não serve para escritores.
 */
export const textExtensions = [
  StarterKit.configure({
    // O histórico de desfazer vem da extensão de colaboração (Yjs).
    undoRedo: false,
    link: false,
    underline: false,
    code: false,
    codeBlock: false,
    heading: { levels: [1, 2, 3] },
  }),
];

export const textSchema = getSchema(textExtensions);
