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
import { addChapter, addNote, addScene, findDoc, findScene, moveScene } from "../manuscript/tree";
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
  renameLinksInFiles,
  saveProject,
  VaultError,
  writeSceneMarkdown,
} from "../vault/vault";
import { createSampleVault } from "../vault/sample";
import { flushAll, runBeforeClose, serial } from "./writes";
import {
  ATTACHMENTS_DIR,
  forgetAttachment,
  importFiles,
  setAttachmentSource,
} from "../editor/attachments";
import { dropTrashEntry, moveToTrash, restorePlan, type TrashEntry } from "../vault/trash";
import { restoreProjectFiles, saveVersion, type Version } from "../vault/history";
import { renameLinksInOpenEditors } from "./openEditors";

export interface Session {
  root: string;
  fs: VaultFs;
  project: Project;
  /** Palavras de cada cena e nota. */
  words: Record<string, number>;
  /** Texto puro de cada cena e nota, para os links e o grafo. */
  texts: Record<string, string>;
  activeDocId: string | null;
  /** Arquivos da pasta anexos/. */
  attachments: string[];
  view: "editor" | "graph" | "settings" | "history" | "trash";
}

type SaveState = "idle" | "saving" | "saved" | "error";

interface AppState {
  platform: (Platform & { persistent?: boolean }) | null;
  vaults: VaultRef[];
  session: Session | null;
  saveState: SaveState;
  message: string | null;
  /** "info" para avisos comuns; "error" (padrão) para problemas. */
  messageTone: "info" | "error";
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
  /** Copia arquivos para anexos/. Devolve os blocos a inserir no texto. */
  addAttachments(files: File[]): Promise<{ src: string; name: string }[]>;
  /** Manda um anexo para a lixeira. */
  removeAttachment(name: string): Promise<void>;
  /** Guarda uma versão do projeto no histórico. Automática: só se algo mudou. */
  saveVersion(label: string, auto?: boolean): Promise<void>;
  /** Volta um texto para como estava numa versão (recria se foi excluído). */
  restoreText(version: Version, docId: string): Promise<void>;
  /** Volta o projeto inteiro para uma versão (a situação atual vira uma versão antes). */
  restoreVersion(version: Version): Promise<void>;
  /** Fecha o texto aberto e espera ele gravar. Devolve false se a gravação falhou. */
  closeEditor(): Promise<boolean>;
  /** Relê o projeto do disco (depois de a sincronização trazer mudanças). */
  reloadFromDisk(openId?: string | null): Promise<void>;
  /** Põe de volta no projeto um item da lixeira. */
  restoreFromTrash(entry: TrashEntry): Promise<void>;
  setSaveState(state: SaveState): void;
  showMessage(message: string | null, tone?: "info" | "error"): void;
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
  async function open(root: string, opts: { version?: boolean } = {}) {
    const { platform } = get();
    if (!platform) return;
    const fs = platform.fs(root);
    const project = await loadProject(fs);
    const { words, texts } = await readProjectTexts(fs, project);
    const attachments = await fs.list(ATTACHMENTS_DIR);
    setAttachmentSource({ fs, open: (path) => void platform.openFile(root, path) });
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
        attachments,
        view: "editor",
      },
      saveState: "idle",
      message: null,
    });
    if (opts.version !== false) {
      void serial(() =>
        saveVersion(fs, project, { label: "Ao abrir o projeto", auto: true }),
      ).catch((err) => console.error(err));
    }
  }

  /** Fecha o texto aberto e espera o editor gravar o que tinha pendente. */
  async function closeEditor() {
    const session = get().session;
    if (session?.activeDocId) set({ session: { ...session, activeDocId: null } });
    // O editor sai da tela na próxima renderização e grava ao sair.
    await new Promise((r) => setTimeout(r, 0));
    return flushPending();
  }

  const versionDate = (v: Version) =>
    new Date(v.createdAt).toLocaleString("pt-BR", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  async function initialize() {
    const platform = await createPlatform();
    set({ platform });
    // Ao fechar o app, grava o que estiver pendente. Se falhar, a janela não fecha.
    platform.onClose?.(async () => {
      if (await flushAll()) {
        await runBeforeClose();
        return true;
      }
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
    messageTone: "error",
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

    async addAttachments(files) {
      const session = get().session;
      if (!session || files.length === 0) return [];
      try {
        const added = await serial(() => importFiles(session.fs, files));
        const attachments = await session.fs.list(ATTACHMENTS_DIR);
        const now = get().session;
        if (now?.root === session.root) set({ session: { ...now, attachments } });
        return added;
      } catch (err) {
        set({ message: describe(err), messageTone: "error" });
        return [];
      }
    },

    removeAttachment: (name) =>
      guarded(async () => {
        const session = get().session;
        if (!session) return;
        const src = `${ATTACHMENTS_DIR}/${name}`;
        await serial(() => moveToTrash(session.fs, src, { kind: "attachment", name }));
        forgetAttachment(src);
        const now = get().session;
        if (now?.root === session.root) {
          set({ session: { ...now, attachments: now.attachments.filter((a) => a !== name) } });
        }
      }),

    async saveVersion(label, auto = false) {
      const session = get().session;
      if (!session || !(await flushAll())) return;
      try {
        const saved = await serial(() =>
          saveVersion(session.fs, get().session?.project ?? session.project, { label, auto }),
        );
        if (!auto && saved) set({ message: "Versão salva no histórico.", messageTone: "info" });
      } catch (err) {
        if (!auto) set({ message: describe(err), messageTone: "error" });
        else console.error(err);
      }
    },

    restoreText: (version, docId) =>
      guarded(async () => {
        if (!get().session || !(await closeEditor())) return;
        const body = version.texts[docId] ?? "";
        const old = findDoc(version.project, docId);
        // Guarda como está agora, para dar para desfazer.
        const before = get().session!;
        await serial(() =>
          saveVersion(before.fs, before.project, {
            label: `Antes de restaurar "${old?.title ?? "um texto"}"`,
            auto: false,
          }),
        );
        let target = docId;
        const session = get().session!;
        if (findDoc(session.project, docId)) {
          await serial(() => writeSceneMarkdown(session.fs, session.project, docId, body));
        } else if (old) {
          // Foi excluído depois: recria no mesmo capítulo (ou num com o mesmo nome).
          await get().change(
            (p) => {
              if (old.type !== "scene") {
                const r = addNote(p, old.type, old.title);
                target = r.note.id;
                return r;
              }
              const thenChapter = findScene(version.project, docId)!.chapter;
              const chapter =
                p.chapters.find((c) => c.id === thenChapter.id) ??
                p.chapters.find((c) => c.title === thenChapter.title);
              if (chapter) {
                // Volta para a posição que tinha no capítulo.
                const r = addScene(p, chapter.id, old.title);
                target = r.scene.id;
                const index = findScene(version.project, docId)!.index;
                const moved = moveScene(r.project, target, chapter.id, index);
                return { project: moved.project, ops: [...r.ops, ...moved.ops] };
              }
              const c = addChapter(p, thenChapter.title);
              const r = addScene(c.project, c.chapter.id, old.title);
              target = r.scene.id;
              return { project: r.project, ops: [...c.ops, ...r.ops] };
            },
            async (next) => {
              await writeSceneMarkdown(get().session!.fs, next, target, body);
            },
          );
        }
        get().setDocText(target, toPlainText(parseMarkdown(body)));
        get().openDoc(target);
        set({
          message: `"${old?.title ?? "Texto"}" voltou a ser como estava em ${versionDate(version)}. Como estava antes ficou guardado no histórico.`,
          messageTone: "info",
        });
      }),

    restoreVersion: (version) =>
      guarded(async () => {
        const session = get().session;
        if (!session || !(await closeEditor())) return;
        // Guarda como está agora, para dar para desfazer a restauração.
        await serial(() =>
          saveVersion(session.fs, get().session!.project, {
            label: `Antes de voltar para "${version.label}"`,
            auto: false,
          }),
        );
        await serial(() => restoreProjectFiles(session.fs, version));
        await open(session.root, { version: false });
        set({
          message: `O projeto voltou a ser como estava em ${versionDate(version)}. A situação anterior ficou guardada no histórico.`,
          messageTone: "info",
        });
      }),

    closeEditor,

    async reloadFromDisk(openId) {
      const session = get().session;
      if (!session) return;
      const { fs } = session;
      const [project, attachments] = await serial(
        async () => [await loadProject(fs), await fs.list(ATTACHMENTS_DIR)] as const,
      );
      const { words, texts } = await serial(() => readProjectTexts(fs, project));
      const now = get().session;
      if (!now || now.root !== session.root) return;
      const wanted = openId ?? now.activeDocId;
      set({
        session: {
          ...now,
          project,
          words,
          texts,
          attachments,
          activeDocId: wanted && findDoc(project, wanted) ? wanted : firstScene(project),
        },
      });
    },

    restoreFromTrash: (entry) =>
      guarded(async () => {
        const session = get().session;
        if (!session) return;
        const plan = restorePlan(session.project, entry, session.attachments);
        if (!plan) return;
        if (plan.project === session.project) {
          // Só arquivos (um anexo): nada muda na estrutura.
          await serial(() => applyOps(session.fs, plan.ops));
        } else {
          await get().change(() => ({ project: plan.project, ops: plan.ops }));
        }
        const now = get().session!;
        const [{ words, texts }, attachments] = await serial(async () => {
          await dropTrashEntry(now.fs, entry.id);
          return [await readProjectTexts(now.fs, now.project), await now.fs.list(ATTACHMENTS_DIR)];
        });
        set({ session: { ...get().session!, words, texts, attachments } });
        if (plan.openId) get().openDoc(plan.openId);
        set({ message: `"${entry.title}" voltou da lixeira.`, messageTone: "info" });
      }),

    async closeVault() {
      if (!(await flushPending())) return;
      await get().saveVersion("Ao fechar o projeto", true);
      await runBeforeClose();
      storageSet(LAST_KEY, null);
      set({ session: null, saveState: "idle" });
      await get().refreshVaults();
    },

    switchVault: (root) =>
      guarded(async () => {
        if (root === get().session?.root) return;
        if (!(await flushPending())) return;
        await get().saveVersion("Ao fechar o projeto", true);
        await runBeforeClose();
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

    showMessage(message, tone = "error") {
      set({ message, messageTone: tone });
    },
  };
});

/**
 * Renomeia uma cena ou nota: atualiza o título dentro do .md e troca os links
 * [[Nome antigo]] por [[Nome novo]] em todos os textos do projeto.
 */
export function renameDocAndLinks(edit: (p: Project) => TreeChange, id: string): Promise<void> {
  const before = useApp.getState().session?.project;
  const oldTitle = before ? findDoc(before, id)?.title : undefined;
  return useApp.getState().change(edit, async (project) => {
    const { session, setDocText, showMessage } = useApp.getState();
    if (!session) return;
    await rewriteSceneHeader(session.fs, project, id);
    const newTitle = findDoc(project, id)?.title;
    if (!oldTitle || !newTitle || oldTitle === newTitle) return;

    const open = renameLinksInOpenEditors(oldTitle, newTitle);
    const files = await renameLinksInFiles(session.fs, project, oldTitle, newTitle, open.ids);
    for (const f of files) setDocText(f.id, f.text);
    const links = open.count + files.reduce((n, f) => n + f.count, 0);
    if (links > 0) {
      showMessage(
        `${links === 1 ? "1 link atualizado" : `${links} links atualizados`} para [[${newTitle}]].`,
        "info",
      );
    }
  });
}
