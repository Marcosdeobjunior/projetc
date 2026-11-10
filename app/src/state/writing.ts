import { create } from "zustand";
import { EMPTY_LOG, dateKey, readLog, writeLog, type WritingLog } from "../writing/writing";
import { useApp } from "./store";
import { registerFlush, serial } from "./writes";

/** Registro de escrita do projeto aberto. Grava com folga (não a cada pausa). */
interface WritingState {
  root: string | null;
  log: WritingLog;
  load(): Promise<void>;
  /** Soma palavras escritas agora (só valores positivos contam). */
  add(words: number): void;
  setGoal(goal: number | null): Promise<void>;
  /** Troca o registro inteiro (dias de teste). */
  replace(log: WritingLog): Promise<void>;
  /** Grava o que ainda não foi para o disco. */
  flush(): Promise<void>;
}

const SAVE_DELAY_MS = 5000;
let timer: number | undefined;
let dirty = false;

export const useWriting = create<WritingState>((set, get) => {
  const persist = async () => {
    window.clearTimeout(timer);
    if (!dirty) return;
    dirty = false;
    const session = useApp.getState().session;
    const { root, log } = get();
    if (session && session.root === root) await serial(() => writeLog(session.fs, log));
  };
  return {
    root: null,
    log: EMPTY_LOG,
    async load() {
      const session = useApp.getState().session;
      if (!session) return;
      if (get().root === session.root) return;
      await persist();
      set({ root: session.root, log: EMPTY_LOG });
      const log = await serial(() => readLog(session.fs));
      if (get().root === session.root) set({ log });
    },
    add(words) {
      if (!(words > 0) || !get().root) return;
      const key = dateKey(new Date());
      const log = get().log;
      set({ log: { ...log, days: { ...log.days, [key]: (log.days[key] ?? 0) + words } } });
      dirty = true;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void persist(), SAVE_DELAY_MS);
    },
    async replace(log) {
      set({ log });
      dirty = true;
      await persist();
    },
    async setGoal(goal) {
      set({ log: { ...get().log, dailyGoal: goal } });
      dirty = true;
      await persist();
    },
    flush: persist,
  };
});

// Ao fechar o app ou trocar de projeto, o que estava pendente é gravado.
registerFlush(() => useWriting.getState().flush());
