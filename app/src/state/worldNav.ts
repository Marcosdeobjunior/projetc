import { create } from "zustand";

/** Qual ficha o Mundo deve mostrar (pedida de fora, ex.: o cartão de uma menção). */
interface WorldNavState {
  openId: string | null;
  setOpenId(id: string | null): void;
}

export const useWorldNav = create<WorldNavState>((set) => ({
  openId: null,
  setOpenId: (openId) => set({ openId }),
}));
