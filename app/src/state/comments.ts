import { create } from "zustand";
import { readComments, writeComments, type Comment } from "../comments/comments";
import { useApp } from "./store";
import { serial } from "./writes";

/** Comentários da cena aberta. Gravados na fila única de escrita. */
interface CommentsState {
  sceneId: string | null;
  comments: Comment[];
  /** Comentário destacado (clicado na lista ou no texto). */
  focused: string | null;
  /** Painel de comentários aberto ao lado do texto. */
  panelOpen: boolean;
  load(sceneId: string): Promise<void>;
  add(c: Omit<Comment, "id" | "createdAt" | "resolved">): Promise<void>;
  update(id: string, patch: Partial<Pick<Comment, "text" | "resolved">>): Promise<void>;
  remove(id: string): Promise<void>;
  focus(id: string | null): void;
  setPanel(open: boolean): void;
}

function fs() {
  return useApp.getState().session?.fs ?? null;
}

export const useComments = create<CommentsState>((set, get) => {
  /** Grava a lista da cena e atualiza a tela. */
  const save = async (sceneId: string, next: Comment[]) => {
    set({ comments: next });
    const f = fs();
    if (f) await serial(() => writeComments(f, sceneId, next));
  };
  return {
    sceneId: null,
    comments: [],
    focused: null,
    panelOpen: false,
    async load(sceneId) {
      set({ sceneId, comments: [], focused: null });
      const f = fs();
      if (!f) return;
      const list = await serial(() => readComments(f, sceneId));
      if (get().sceneId === sceneId) set({ comments: list });
    },
    async add(c) {
      const { sceneId, comments } = get();
      if (!sceneId) return;
      const comment: Comment = {
        ...c,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        resolved: false,
      };
      set({ panelOpen: true, focused: comment.id });
      await save(sceneId, [...comments, comment]);
    },
    async update(id, patch) {
      const { sceneId, comments } = get();
      if (!sceneId) return;
      await save(
        sceneId,
        comments.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      );
    },
    async remove(id) {
      const { sceneId, comments, focused } = get();
      if (!sceneId) return;
      if (focused === id) set({ focused: null });
      await save(
        sceneId,
        comments.filter((c) => c.id !== id),
      );
    },
    focus(id) {
      set({ focused: id });
    },
    setPanel(open) {
      set({ panelOpen: open });
    },
  };
});
