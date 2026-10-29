import { create } from "zustand";
import {
  createPlatform,
  PlatformError,
  type ChosenFolder,
  type Platform,
  type VaultFs,
  type VaultRef,
} from "../platform";
import type { NoteKind, Project, TreeChange } from "../manuscript/types";
import { addNote, addScene, findDoc, findScene, moveScene } from "../manuscript/tree";
import { countWords } from "../manuscript/wordCount";
import { parseMarkdown, splitFrontmatter } from "../markdown/parse";
import { toPlainText } from "../markdown/serialize";
import { folderName } from "../vault/paths";
import {
  applyOps,
  readProjectTexts,
  createVault,
  ensureChapterDirs,
  loadProject,
  rewriteSceneHeader,
  saveProject,
  VaultError,
  writeSceneMarkdown,
} from "../vault/vault";
import { createSampleVault } from "../vault/sample";
import { flushAll, serial } from "./writes";

export interface Session {
  root: string;
  fs: VaultFs;
  project: Project;
  /** Palavras de cada cena e nota. */
  words: Record<string, number>;
  /** Texto puro de cada cena e nota, para os links e o grafo. */
  texts: Record<string, string>;
  activeDocId: string | null;
  view: "editor" | "graph";
}

type SaveState = "idle" | "saving" | "saved" | "error";

interface AppState {
  platform: (Platform & { persistent?: boolean }) | null;
  vaults: VaultRef[];
  session: Session | null;
  saveState: SaveState;
  message: string | null;
  busy: boolean;
  /** Pasta escolhida em "Abrir projeto existente" que ainda não é um projeto. */
  folderToConvert: ChosenFolder | null;

  init(): Promise<void>;
  refreshVaults(): Promise<void>;
  createVault(title: string): Promise<void>;
  openVault(root: string): Promise<void>;
  openExistingFolder(): Promise<void>;
  createVaultInFolder(folder: ChosenFolder): Promise<void>;
  cancelFolderToConvert(): void;
  /** Grava o que estiver pendente e volta para a lista de projetos. */
  closeVault(): Promise<void>;
  switchVault(root: string): Promise<void>;
  forgetVault(root: string): Promise<void>;
  change(edit: (p: Project) => TreeChange, after?: (p: Project) => Promise<void>): Promise<void>;
  /** Abre uma cena ou nota no editor. */
  openDoc(id: string): void;
  setView(view: Session["view"]): void;
  setDocText(id: string, text: string): void;
  /** Cria uma nota (sem abrir). Devolve o id, ou o id da que já existe com esse título. */
  createNote(kind: NoteKind, title: string): Promise<string | null>;
  keepExternalCopy(sceneId: string, diskText: string): Promise<void>;
  setSaveState(state: SaveState): void;
  showMessage(message: string | null): void;
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
    const { words, texts } = await readProjectTexts(fs, project);
    await platform.rememberVault({
      root,
      title: project.title,
      location: platform.kind === "desktop" ? root : "Salvo neste navegador",
      openedAt: Date.now(),
    });
    storageSet(LAST_KEY, root);
    set({
      session: {
        root,
        fs,
        project,
        words,
        texts,
        activeDocId: firstScene(project),
        view: "editor",
      },
      saveState: "idle",
      message: null,
    });
  }

  async function initialize() {
    const platform = await createPlatform();
    set({ platform });
    // Ao fechar o app, grava o que estiver pendente. Se falhar, a janela não fecha.
    platform.onClose?.(async () => {
      if (await flushAll()) return true;
      set({
        message:
          "Não foi possível salvar as últimas alterações, então o app não foi fechado. Verifique se a pasta do projeto está acessível e tente de novo.",
      });
      return false;
    });
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

    // Primeira visita à prévia no navegador: abre um projeto de exemplo. Se o
    // navegador não guarda dados, os projetos somem e o exemplo volta sempre.
    if (
      platform.kind === "browser" &&
      get().vaults.length === 0 &&
      (storageGet(SAMPLE_FLAG) !== "1" || !platform.persistent)
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

  /**
   * Antes de trocar ou fechar o projeto, grava as edições pendentes. O editor
   * só grava depois de uma pausa na digitação; sem isso as últimas palavras
   * se perderiam.
   */
  async function flushPending() {
    if (await flushAll()) return true;
    set({
      message:
        "Não foi possível salvar as últimas alterações. Verifique se a pasta do projeto está acessível e tente de novo.",
    });
    return false;
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
    folderToConvert: null,

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
        set({ folderToConvert: null });
        const folder = await get().platform?.chooseFolder?.();
        if (!folder) return;
        if (!(await flushPending())) return;
        if (folder.isProject) {
          await open(folder.root);
          await get().refreshVaults();
        } else {
          // Pasta comum: a tela inicial oferece transformá-la em projeto.
          storageSet(LAST_KEY, null);
          set({ session: null, folderToConvert: folder });
        }
      }),

    createVaultInFolder: (folder) =>
      guarded(async () => {
        const { platform } = get();
        if (!platform) return;
        set({ folderToConvert: null });
        await createVault(platform.fs(folder.root), folder.name);
        await open(folder.root);
      }),

    cancelFolderToConvert() {
      set({ folderToConvert: null });
    },

    async closeVault() {
      if (!(await flushPending())) return;
      storageSet(LAST_KEY, null);
      set({ session: null, saveState: "idle" });
      await get().refreshVaults();
    },

    switchVault: (root) =>
      guarded(async () => {
        if (root === get().session?.root) return;
        if (!(await flushPending())) return;
        await open(root);
        await get().refreshVaults();
      }),

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
          let activeDocId = session.activeDocId;
          if (activeDocId && !findDoc(project, activeDocId)) activeDocId = firstScene(project);
          set({ session: { ...session, project, activeDocId } });
          if (project.title !== session.project.title) {
            // Mantém a lista de projetos recentes com o nome novo.
            await get().platform?.rememberVault({
              root: session.root,
              title: project.title,
              location: get().platform?.kind === "desktop" ? session.root : "Salvo neste navegador",
              openedAt: Date.now(),
            });
          }
          await after?.(project);
        } catch (err) {
          set({ message: describe(err) });
        }
      }),

    openDoc(id) {
      const session = get().session;
      if (session) set({ session: { ...session, activeDocId: id, view: "editor" } });
    },

    setView(view) {
      const session = get().session;
      if (session) set({ session: { ...session, view } });
    },

    setDocText(id, text) {
      const session = get().session;
      if (!session || session.texts[id] === text) return;
      set({
        session: {
          ...session,
          texts: { ...session.texts, [id]: text },
          words: { ...session.words, [id]: countWords(text) },
        },
      });
    },

    async createNote(kind, title) {
      const existing = get().session?.project.notes.find(
        (n) => n.title.toLocaleLowerCase("pt-BR") === title.toLocaleLowerCase("pt-BR"),
      );
      if (existing) return existing.id;
      let id: string | null = null;
      await get().change((p) => {
        const r = addNote(p, kind, title);
        id = r.note.id;
        return r;
      });
      return id;
    },

    async keepExternalCopy(id, diskText) {
      const project = get().session?.project;
      const doc = project && findDoc(project, id);
      if (!project || !doc) return;
      const title = `${doc.title} (versão externa)`;
      const body = splitFrontmatter(diskText).body.replace(/^\n/, "");
      let copyId = "";
      await get().change(
        (p) => {
          const scene = findScene(p, id);
          if (scene) {
            const added = addScene(p, scene.chapter.id, title);
            copyId = added.scene.id;
            // Logo abaixo da cena original.
            return moveScene(added.project, copyId, scene.chapter.id, scene.index + 1);
          }
          const added = addNote(p, p.notes.find((n) => n.id === id)!.kind, title);
          copyId = added.note.id;
          return added;
        },
        async (next) => {
          const session = get().session!;
          await writeSceneMarkdown(session.fs, next, copyId, body);
          get().setDocText(copyId, toPlainText(parseMarkdown(body)));
        },
      );
      set({
        message: `"${doc.title}" foi alterada fora do InkFlow enquanto estava aberta. Para não perder nada, a versão de fora foi guardada como "${title}".`,
      });
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
