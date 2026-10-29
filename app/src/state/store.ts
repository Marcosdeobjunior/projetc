import { create } from "zustand";
import {
  createPlatform,
  PlatformError,
  type Platform,
  type VaultFs,
  type VaultRef,
} from "../platform";
import type { Project, TreeChange } from "../manuscript/types";
import { findScene } from "../manuscript/tree";
import { folderName } from "../vault/paths";
import {
  applyOps,
  countProjectWords,
  createVault,
  ensureChapterDirs,
  loadProject,
  rewriteSceneHeader,
  saveProject,
  VaultError,
} from "../vault/vault";
import { createSampleVault } from "../vault/sample";

export interface Session {
  root: string;
  fs: VaultFs;
  project: Project;
  words: Record<string, number>;
  activeSceneId: string | null;
}

export type SaveState = "idle" | "saving" | "saved" | "error";

interface AppState {
  platform: (Platform & { persistent?: boolean }) | null;
  vaults: VaultRef[];
  session: Session | null;
  saveState: SaveState;
  message: string | null;
  busy: boolean;

  init(): Promise<void>;
  refreshVaults(): Promise<void>;
  createVault(title: string): Promise<void>;
  openVault(root: string): Promise<void>;
  openExistingFolder(): Promise<void>;
  closeVault(): void;
  forgetVault(root: string): Promise<void>;
  change(edit: (p: Project) => TreeChange, after?: (p: Project) => Promise<void>): Promise<void>;
  selectScene(sceneId: string | null): void;
  setSceneWords(sceneId: string, words: number): void;
  setSaveState(state: SaveState): void;
  showMessage(message: string | null): void;
}

/*
 * Toda escrita no vault passa por esta fila, uma de cada vez. Assim uma cena
 * nunca é gravada enquanto o arquivo dela está sendo movido ou renomeado.
 */
let queue: Promise<unknown> = Promise.resolve();
export function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

const SAMPLE_FLAG = "inkflow.sampleCreated";
const LAST_KEY = "inkflow.lastVault";
let initOnce: Promise<void> | undefined;

function storageGet(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // sem armazenamento: o app só não lembra disso na próxima vez
  }
}

function describe(err: unknown): string {
  if (err instanceof VaultError || err instanceof PlatformError) return err.message;
  console.error(err);
  return "Algo deu errado ao acessar os arquivos do projeto. Tente de novo.";
}

function firstScene(p: Project) {
  return p.chapters.find((c) => c.scenes.length)?.scenes[0]?.id ?? null;
}

export const useApp = create<AppState>((set, get) => {
  async function open(root: string) {
    const { platform } = get();
    if (!platform) return;
    const fs = platform.fs(root);
    const project = await loadProject(fs);
    const words = await countProjectWords(fs, project);
    await platform.rememberVault({
      root,
      title: project.title,
      location: platform.kind === "desktop" ? root : "Salvo neste navegador",
      openedAt: Date.now(),
    });
    storageSet(LAST_KEY, root);
    set({
      session: { root, fs, project, words, activeSceneId: firstScene(project) },
      saveState: "idle",
      message: null,
    });
  }

  async function initialize() {
    const platform = await createPlatform();
    set({ platform });
    await get().refreshVaults();

    // Reabre o último projeto usado, se ele ainda existir.
    const last = storageGet(LAST_KEY);
    if (last && get().vaults.some((v) => v.root === last)) {
      try {
        await open(last);
        return;
      } catch {
        storageSet(LAST_KEY, null);
      }
    }

    // Primeira visita à prévia no navegador: abre um projeto de exemplo.
    if (
      platform.kind === "browser" &&
      get().vaults.length === 0 &&
      storageGet(SAMPLE_FLAG) !== "1"
    ) {
      const root = await platform.chooseNewVaultRoot("exemplo");
      if (root) {
        await createSampleVault(platform.fs(root));
        storageSet(SAMPLE_FLAG, "1");
        await open(root);
        await get().refreshVaults();
      }
    }
  }

  async function guarded(task: () => Promise<void>) {
    set({ busy: true });
    try {
      await task();
    } catch (err) {
      set({ message: describe(err) });
    } finally {
      set({ busy: false });
    }
  }

  return {
    platform: null,
    vaults: [],
    session: null,
    saveState: "idle",
    message: null,
    busy: false,

    init() {
      // Em modo de desenvolvimento o React chama efeitos duas vezes.
      initOnce ??= initialize();
      return initOnce;
    },

    async refreshVaults() {
      const { platform } = get();
      if (platform) set({ vaults: await platform.knownVaults() });
    },

    createVault: (title) =>
      guarded(async () => {
        const { platform } = get();
        if (!platform) return;
        const clean = title.trim() || "Meu livro";
        const root = await platform.chooseNewVaultRoot(folderName(clean));
        if (!root) return;
        await createVault(platform.fs(root), clean);
        await open(root);
      }),

    openVault: (root) =>
      guarded(async () => {
        await open(root);
      }),

    openExistingFolder: () =>
      guarded(async () => {
        const root = await get().platform?.chooseExistingVault?.();
        if (root) await open(root);
      }),

    closeVault() {
      storageSet(LAST_KEY, null);
      set({ session: null, saveState: "idle" });
      void get().refreshVaults();
    },

    forgetVault: (root) =>
      guarded(async () => {
        await get().platform?.forgetVault(root);
        await get().refreshVaults();
      }),

    change: (edit, after) =>
      serial(async () => {
        const session = get().session;
        if (!session) return;
        try {
          const { project, ops } = edit(session.project);
          if (project === session.project) return;
          await applyOps(session.fs, ops);
          await ensureChapterDirs(session.fs, project);
          await saveProject(session.fs, project);
          let activeSceneId = session.activeSceneId;
          if (activeSceneId && !findScene(project, activeSceneId))
            activeSceneId = firstScene(project);
          set({ session: { ...session, project, activeSceneId } });
          await after?.(project);
        } catch (err) {
          set({ message: describe(err) });
        }
      }),

    selectScene(sceneId) {
      const session = get().session;
      if (session) set({ session: { ...session, activeSceneId: sceneId } });
    },

    setSceneWords(sceneId, words) {
      const session = get().session;
      if (!session || session.words[sceneId] === words) return;
      set({ session: { ...session, words: { ...session.words, [sceneId]: words } } });
    },

    setSaveState(saveState) {
      set({ saveState });
    },

    showMessage(message) {
      set({ message });
    },
  };
});

/** Renomeia uma cena e atualiza o título dentro do arquivo .md. */
export function renameSceneAndHeader(
  edit: (p: Project) => TreeChange,
  sceneId: string,
): Promise<void> {
  return useApp.getState().change(edit, async (project) => {
    const session = useApp.getState().session;
    if (session) await rewriteSceneHeader(session.fs, project, sceneId);
  });
}
