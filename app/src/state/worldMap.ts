import { create } from "zustand";
import {
  cellOf,
  deriveWorld,
  parseWorld,
  serializeWorld,
  WORLD_MAP_FILE,
  type WorldMap,
} from "../world/worldgen";
import { applyWorldFields, retireNotes, syncWorldNotes } from "../world/worldNotes";
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
  /**
   * Deixa o Mundo igual ao mapa: cria/liga os lugares, puxa os nomes das fichas,
   * tira do mapa o que foi apagado no Mundo e preenche tipo e "Fica em".
   * `retire`: lugares que saíram do mapa (vão para a lixeira se ninguém mexeu).
   */
  reconcile(opts?: { recreate?: boolean; retire?: string[] }): Promise<void>;
}

/** Grava o mapa sem reconciliar (usado pela própria reconciliação). */
let saveOnly: (map: WorldMap) => void = () => undefined;

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
    // O pincel muda o relevo muitas vezes por segundo: grava só quando para.
    if (map) saveOnly(map);
    else {
      set({ map });
      const fs = useApp.getState().session?.fs;
      if (fs) void serial(() => writeWorldMap(fs, null));
    }
  },
  focus(burgId) {
    set({ focusBurg: burgId });
  },
  async reconcile(opts = {}) {
    const app = useApp.getState();
    const session = app.session;
    const start = get().map;
    if (!session || !start) return;
    let nextMap = start;
    let mapChanged = false;
    const ok = await app.change((p) => {
      let project = p;
      let ops: Awaited<ReturnType<typeof retireNotes>>["ops"] = [];
      if (opts.retire?.length) {
        const keep = new Set([
          ...start.burgs.map((b) => b.noteId),
          ...start.states.map((s) => s.noteId),
        ]);
        const r = retireNotes(
          project,
          opts.retire.filter((id) => !keep.has(id)),
          useApp.getState().session?.texts ?? {},
        );
        project = r.project;
        ops = r.ops;
      }
      const s = syncWorldNotes(start, project, opts.recreate);
      project = s.project;
      nextMap = s.map;
      mapChanged = s.mapChanged;
      if (s.mapChanged || s.projectChanged || opts.retire || opts.recreate) {
        const d = deriveWorld(nextMap);
        const owner = new Map(nextMap.burgs.map((b) => [b.id, d.owner[cellOf(b.x, b.y)]!]));
        project = applyWorldFields(nextMap, project, (id) => owner.get(id) ?? -1).project;
      }
      return { project, ops };
    });
    // Só troca o mapa se ninguém mexeu nele enquanto isso.
    if (ok && mapChanged && get().map === start) saveOnly(nextMap);
  },
}));

saveOnly = (map) => {
  useWorldMap.setState({ map });
  const fs = useApp.getState().session?.fs;
  if (!fs) return;
  clearTimeout(timer);
  pending = () => serial(() => writeWorldMap(fs, useWorldMap.getState().map));
  timer = setTimeout(() => {
    const p = pending;
    pending = null;
    if (p) void p();
  }, 600);
};
