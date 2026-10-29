import { create } from "zustand";
import type { SearchOptions } from "../search/search";

/** Estado do painel de busca (Ctrl+Shift+F). */
interface SearchState extends Required<SearchOptions> {
  open: boolean;
  query: string;
  /** Aumenta a cada pedido de foco no campo (abrir de novo com o atalho). */
  focusNonce: number;
  /** Resultado clicado: o editor desse texto seleciona a ocorrência `index`. */
  target: { docId: string; index: number; nonce: number } | null;
  show(): void;
  close(): void;
  set(patch: Partial<Pick<SearchState, "query" | "exact" | "wholeWord">>): void;
  goTo(docId: string, index: number): void;
  clearTarget(): void;
}

export const useSearch = create<SearchState>((set, get) => ({
  open: false,
  query: "",
  exact: false,
  wholeWord: false,
  focusNonce: 0,
  target: null,
  show: () => set({ open: true, focusNonce: get().focusNonce + 1 }),
  close: () => set({ open: false, target: null }),
  set: (patch) => set(patch),
  goTo: (docId, index) => set({ target: { docId, index, nonce: Date.now() } }),
  clearTarget: () => set({ target: null }),
}));
