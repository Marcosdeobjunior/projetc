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
import { TEST_BOOK_TITLE, createTestBook } from "../vault/testBook";
import { flushAll, runBeforeClose, serial } from "./writes";
import {
  ATTACHMENTS_DIR,
  forgetAttachment,
  importFiles,
  setAttachmentSource,
} from "../editor/attachments";
import {
  deleteFromTrash,
  dropTrashEntry,
  moveToTrash,
  restorePlan,
  type TrashEntry,
} from "../vault/trash";
import { backupRestorePlan, insideTrash, readBackup, restorable } from "../vault/backup";
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

export type CreateResult = { ok: true; root: string } | { ok: false; error: string | null };

interface AppState {
  platform: (Platform & { persistent?: boolean }) | null;
  vaults: VaultRef[];
  session: Session | null;
  /**
   * Pasta (projeto) ativa na tela inicial: a última escolhida ou aberta.
   * Fica guardada, então o app volta para ela ao abrir.
   */
  activeFolder: string | null;
  saveState: SaveState;
  message: string | null;
  /** "info" para avisos comuns; "error" (padrão) para problemas. */
  messageTone: "info" | "error";
  busy: boolean;
  /** Pasta escolhida em "Abrir projeto existente" que ainda não é um projeto. */
  folderToConvert: ChosenFolder | null;

  init(): Promise<void>;
  /** Escolhe a pasta ativa da tela inicial (sem abrir o projeto). */
  setActiveFolder(root: string | null): void;
  refreshVaults(): Promise<void>;
  /**
   * Cria um projeto. Por padrão já abre o projeto; com `open: false` só o
   * coloca na lista. Devolve a raiz criada, ou o erro (null = cancelado).
   */
  createVault(title: string, opts?: { open?: boolean }): Promise<CreateResult>;
  /** Cria o livro grande de teste (só no modo de desenvolvimento), sem abrir. */
  createTestBook(): Promise<CreateResult>;
  openVault(root: string): Promise<void>;
  openExistingFolder(): Promise<void>;
  createVaultInFolder(folder: ChosenFolder): Promise<void>;
  cancelFolderToConvert(): void;
  /** Grava o que estiver pendente e volta para a lista de projetos. */
  closeVault(): Promise<void>;
  switchVault(root: string): Promise<void>;
  forgetVault(root: string): Promise<void>;
  /** Muda a estrutura e os arquivos. Devolve false se algo falhou (a mensagem já aparece). */
  change(edit: (p: Project) => TreeChange, after?: (p: Project) => Promise<void>): Promise<boolean>;
  /** Abre uma cena ou nota no editor. */
  openDoc(id: string): void;
  setView(view: Session["view"]): void;
  setDocText(id: string, text: string): void;
  /** Cria uma nota (sem abrir). Devolve o id, ou o id da que já existe com esse título. */
  createNote(kind: NoteKind, title: string): Promise<string | null>;
  /** Guarda a versão de fora como outro texto. Devolve false se não deu para guardar. */
  keepExternalCopy(sceneId: string, diskText: string): Promise<boolean>;
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
const ACTIVE_KEY = "inkflow.activeFolder";
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

const CLOSE_LABEL = "Ao fechar o projeto";

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
    setAttachmentSource({
      fs,
      open: (path) =>
        void platform
          .openFile(root, path)
          .catch((err: unknown) =>
            set({ message: typeof err === "string" ? err : describe(err), messageTone: "error" }),
          ),
    });
    await platform.rememberVault({
      root,
      title: project.title,
      location: platform.kind === "desktop" ? root : "Salvo neste navegador",
      openedAt: Date.now(),
    });
    storageSet(LAST_KEY, root);
    storageSet(ACTIVE_KEY, root);
    set({
      activeFolder: root,
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
    // Ao fechar o app, grava o que estiver pendente, guarda a versão de
    // fechamento e sincroniza. Se a gravação falhar, a janela não fecha.
    platform.onClose?.(async () => {
      if (await flushAll()) {
        await get().saveVersion(CLOSE_LABEL, true);
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

    // O app sempre começa na tela inicial. A pasta ativa (a última escolhida
    // ou aberta) continua selecionada, então basta "Continuar" para voltar a ela.
    const known = (root: string | null) =>
      root && get().vaults.some((v) => v.root === root) ? root : null;
    const active = known(storageGet(ACTIVE_KEY)) ?? known(storageGet(LAST_KEY));
    if (active) {
      set({ activeFolder: active });
      return;
    }

    // Primeira visita à prévia no navegador: cria um projeto de exemplo e o
    // deixa selecionado. Se o navegador não guarda dados, o exemplo volta sempre.
    if (
      platform.kind === "browser" &&
      get().vaults.length === 0 &&
      (storageGet(SAMPLE_FLAG) !== "1" || !platform.persistent)
    ) {
      const root = await platform.chooseNewVaultRoot("exemplo");
      if (root) {
        const fs = platform.fs(root);
        await createSampleVault(fs);
        storageSet(SAMPLE_FLAG, "1");
        const project = await loadProject(fs);
        await platform.rememberVault({
          root,
          title: project.title,
          location: "Salvo neste navegador",
          openedAt: Date.now(),
        });
        await get().refreshVaults();
        get().setActiveFolder(root);
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

  /**
   * Sai do projeto aberto do jeito certo: grava o pendente, guarda a versão de
   * fechamento e roda as tarefas de fechamento (sync). Devolve false se a
   * gravação falhou; aí o projeto continua aberto.
   */
  async function leaveSession() {
    if (!(await flushPending())) return false;
    if (get().session) {
      await get().saveVersion(CLOSE_LABEL, true);
      await runBeforeClose();
    }
    return true;
  }

  /**
   * Põe de volta uma cópia de segurança da Lixeira sem substituir nada: os textos
   * voltam como textos novos e os anexos para anexos/ (veja vault/backup.ts).
   * Arquivos técnicos ficam na Lixeira.
   */
  async function restoreBackup(entry: TrashEntry) {
    const session = get().session!;
    const contents = await serial(() => readBackup(session.fs, entry));
    if (!restorable(contents)) {
      set({
        message:
          "Esta cópia de segurança só tem arquivos técnicos do app, que não dá para restaurar por aqui. Ela continua na Lixeira, dentro da pasta .inkflow/lixeira do projeto.",
        messageTone: "info",
      });
      return;
    }
    const plan = backupRestorePlan(session.project, contents, session.attachments);
    const moves = plan.moves.filter((m) => insideTrash(m.from));
    const ok = await get().change(
      () => ({ project: plan.project, ops: moves.map((m) => ({ kind: "move", ...m })) }),
      async (next) => {
        for (const t of plan.texts) await writeSceneMarkdown(session.fs, next, t.id, t.body);
      },
    );
    if (!ok) return;
    const now = get().session!;
    const [{ words, texts }, attachments] = await serial(async () => {
      if (contents.other.length === 0) {
        await deleteFromTrash(now.fs, entry.id);
      } else {
        // Sobram arquivos técnicos: a entrada fica, só com eles.
        for (const path of plan.restored) {
          if (insideTrash(path) && (await now.fs.exists(path))) await now.fs.remove(path);
        }
      }
      return [await readProjectTexts(now.fs, now.project), await now.fs.list(ATTACHMENTS_DIR)];
    });
    set({ session: { ...get().session!, words, texts, attachments } });
    if (plan.openId) get().openDoc(plan.openId);
    const n = plan.texts.length;
    const a = plan.moves.length;
    const what = [
      n ? `${n} ${n === 1 ? "texto" : "textos"}` : "",
      a ? `${a} ${a === 1 ? "anexo" : "anexos"}` : "",
    ]
      .filter(Boolean)
      .join(" e ");
    const verb = n + a === 1 ? "voltou como item novo" : "voltaram como itens novos";
    set({
      message: `Cópia de segurança restaurada: ${what} ${verb}, sem substituir nada do projeto.`,
      messageTone: "info",
    });
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

  /** Escolhe a pasta, monta o projeto com `build` e depois abre ou só lista. */
  async function make(
    clean: string,
    build: (fs: VaultFs) => Promise<unknown>,
    openAfter: boolean,
    /** Mostra o erro no aviso do topo (a janela de novo projeto mostra o dela). */
    toast = openAfter,
  ): Promise<CreateResult> {
    const { platform } = get();
    if (!platform) return { ok: false, error: null };
    set({ busy: true });
    try {
      const root = await platform.chooseNewVaultRoot(folderName(clean));
      if (!root) return { ok: false, error: null };
      await build(platform.fs(root));
      if (openAfter) {
        await open(root);
      } else {
        await platform.rememberVault({
          root,
          title: clean,
          location: platform.kind === "desktop" ? root : "Salvo neste navegador",
          openedAt: Date.now(),
        });
        await get().refreshVaults();
      }
      return { ok: true, root };
    } catch (err) {
      const message = describe(err);
      if (toast) set({ message });
      return { ok: false, error: message };
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
    activeFolder: null,

    setActiveFolder(root) {
      storageSet(ACTIVE_KEY, root);
      set({ activeFolder: root });
    },

    init() {
      // Em modo de desenvolvimento o React chama efeitos duas vezes.
      initOnce ??= initialize();
      return initOnce;
    },

    async refreshVaults() {
      const { platform } = get();
      if (platform) set({ vaults: await platform.knownVaults() });
    },

    createVault(title, opts = {}) {
      const clean = title.trim() || "Meu livro";
      return make(clean, (fs) => createVault(fs, clean), opts.open !== false);
    },

    createTestBook() {
      return make(TEST_BOOK_TITLE, createTestBook, false, true);
    },

    openVault: (root) =>
      guarded(async () => {
        await open(root);
      }),

    openExistingFolder: () =>
      guarded(async () => {
        set({ folderToConvert: null });
        const folder = await get().platform?.chooseFolder?.();
        if (!folder) return;
        if (folder.isProject && folder.root === get().session?.root) return;
        if (!(await leaveSession())) return;
        if (folder.isProject) {
          await open(folder.root);
          await get().refreshVaults();
        } else {
          // Pasta comum: a tela inicial oferece transformá-la em projeto.
          storageSet(LAST_KEY, null);
          set({ session: null, saveState: "idle", folderToConvert: folder });
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
          message: `"${old?.title ?? "Texto"}" voltou a ser como estava em ${versionDate(version)}. A versão anterior ficou guardada no histórico.`,
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
        if (entry.item.kind === "backup") return restoreBackup(entry);
        const plan = restorePlan(session.project, entry, session.attachments);
        if (!plan) return;
        if (plan.project === session.project) {
          // Só arquivos (um anexo): nada muda na estrutura.
          await serial(() => applyOps(session.fs, plan.ops));
        } else if (!(await get().change(() => ({ project: plan.project, ops: plan.ops })))) {
          // Não deu para pôr de volta: o item continua na lixeira.
          return;
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
      if (!(await leaveSession())) return;
      storageSet(LAST_KEY, null);
      set({ session: null, saveState: "idle" });
      await get().refreshVaults();
    },

    switchVault: (root) =>
      guarded(async () => {
        if (root === get().session?.root) return;
        if (!(await leaveSession())) return;
        await open(root);
        await get().refreshVaults();
      }),

    forgetVault: (root) =>
      guarded(async () => {
        await get().platform?.forgetVault(root);
        if (get().activeFolder === root) get().setActiveFolder(null);
        await get().refreshVaults();
      }),

    change: (edit, after) =>
      serial(async () => {
        const session = get().session;
        if (!session) return false;
        try {
          const { project, ops } = edit(session.project);
          if (project === session.project) return true;
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
          return true;
        } catch (err) {
          set({ message: describe(err) });
          return false;
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
      if (!project || !doc) return false;
      const title = `${doc.title} (versão externa)`;
      const body = splitFrontmatter(diskText).body.replace(/^\n/, "");
      let copyId = "";
      const ok = await get().change(
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
      if (!ok) return false;
      set({
        message: `O texto “${doc.title}” foi alterado fora da Tália enquanto estava aberto. Para não perder nada, a versão de fora foi guardada como “${title}”.`,
        messageTone: "info",
      });
      return true;
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
export function renameDocAndLinks(edit: (p: Project) => TreeChange, id: string): Promise<boolean> {
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
