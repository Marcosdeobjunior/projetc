import { create } from "zustand";
import { parseWorld, serializeWorld, WORLD_MAP_FILE, type WorldMap } from "../world/worldgen";
import type { VaultFs } from "../platform/types";
import { useApp } from "./store";
import { registerFlush, serial } from "./writes";

export async function readWorldMap(fs: VaultFs): Promise<WorldMap | null> {
  const raw = await fs.readText(WORLD_MAP_FILE);
  return raw ? parseWorld(raw) : null;
}

export async function writeWorldMap(fs: VaultFs, map: WorldMap | null): Promise<void> {
  if (map) await fs.writeText(WORLD_MAP_FILE, serializeWorld(map));
  else if (await fs.readText(WORLD_MAP_FILE)) await fs.remove(WORLD_MAP_FILE);
}

/** Mapa-múndi do projeto aberto. Gravado na fila única de escrita (com uma pequena espera). */
interface WorldMapState {
  root: string | null;
  map: WorldMap | null;
  loaded: boolean;
  /** Cidade a destacar ao abrir o mapa (vinda da ficha de um lugar). */
  focusBurg: string | null;
  load(): Promise<void>;
  set(map: WorldMap | null): void;
  focus(burgId: string | null): void;
}

let timer: ReturnType<typeof setTimeout> | undefined;
let pending: (() => Promise<void>) | null = null;

// Antes de fechar o app, grava o que o pincel ainda não gravou.
registerFlush(async () => {
  clearTimeout(timer);
  const p = pending;
  pending = null;
  if (p) await p();
});

export const useWorldMap = create<WorldMapState>((set, get) => ({
  root: null,
  map: null,
  loaded: false,
  focusBurg: null,
  async load() {
    const session = useApp.getState().session;
    if (!session) return;
    // Já carregado deste projeto: o que está na memória é o mais novo (pode haver
    // gravação pendente do pincel), então não relê do disco.
    if (get().root === session.root && get().loaded) return;
    if (get().root !== session.root) set({ root: session.root, map: null, loaded: false });
    const map = await serial(() => readWorldMap(session.fs));
    if (useApp.getState().session?.root === session.root) set({ map, loaded: true });
  },
  set(map) {
    set({ map });
    const fs = useApp.getState().session?.fs;
    if (!fs) return;
    // O pincel muda o relevo muitas vezes por segundo: grava só quando para.
    clearTimeout(timer);
    pending = () => serial(() => writeWorldMap(fs, get().map));
    timer = setTimeout(() => {
      const p = pending;
      pending = null;
      if (p) void p();
    }, 600);
  },
  focus(burgId) {
    set({ focusBurg: burgId });
  },
}));
