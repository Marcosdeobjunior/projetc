import type { Editor } from "@tiptap/core";

/*
 * Editores abertos. Quando um título muda, os links dentro do texto aberto
 * são trocados pelo próprio editor (como uma edição normal); os textos
 * fechados são atualizados direto nos arquivos.
 */
type RenameLinks = (oldTitle: string, newTitle: string) => number;

const editors = new Map<string, RenameLinks>();

export function registerOpenEditor(id: string, renameLinks: RenameLinks): () => void {
  editors.set(id, renameLinks);
  return () => {
    if (editors.get(id) === renameLinks) editors.delete(id);
  };
}

export function renameLinksInOpenEditors(oldTitle: string, newTitle: string) {
  let count = 0;
  for (const rename of editors.values()) count += rename(oldTitle, newTitle);
  return { ids: new Set(editors.keys()), count };
}

/* O editor do texto aberto, para a barra lateral inserir anexos nele. */
let active: Editor | null = null;

export function setActiveEditor(editor: Editor | null) {
  active = editor;
}

export const activeEditor = () => (active && !active.isDestroyed ? active : null);
