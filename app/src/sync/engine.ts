import * as Y from "yjs";
import { yDocToProsemirrorJSON } from "@tiptap/y-tiptap";
import type { VaultFs } from "../platform/types";
import type { Project } from "../manuscript/types";
import { findDoc } from "../manuscript/tree";
import { toMarkdown, toPlainText } from "../markdown/serialize";
import type { PMNode } from "../markdown/types";
import { YDOC_FIELD } from "../editor/extensions";
import {
  HISTORY_DIR,
  MANUSCRIPT_DIR,
  NOTES_DIR,
  PROJECT_FILE,
  TRASH_DIR,
  slugify,
  ydocPath,
} from "../vault/paths";
import { sceneFile } from "../vault/vault";
import { forgetVersionIndex } from "../vault/history";
import { moveToTrash, saveToTrash } from "../vault/trash";
import { md5 } from "./md5";
import { mergeProjects } from "./mergeProject";
import type { Drive, RemoteFile } from "./drive";

/*
 * Sincronização de um vault com uma pasta do Google Drive.
 *
 * Para cada arquivo compara três MD5: o local, o do Drive e o da última
 * sincronização (a "base"). Quem mudou desde a base manda:
 *  - só o local mudou → envia; só o Drive mudou → baixa;
 *  - os dois mudaram (conflito):
 *      .yjs (o texto de uma cena/nota) → mescla as duas edições (Yjs) e
 *        refaz o .md a partir do resultado;
 *      project.json → junta a estrutura (mergeProject.ts);
 *      outros → fica o local, e o do Drive vai para a lixeira.
 *  - excluído de um lado e alterado do outro → fica o alterado.
 * Arquivos excluídos pelo Drive vão para a lixeira local, não somem.
 */

export const SYNC_FILE = ".inkflow/sync.json";
const VERSION_INDEX = `${HISTORY_DIR}/indice.json`;

export interface SyncState {
  folderId: string;
  /** MD5 de cada arquivo na última sincronização (igual nos dois lados). */
  base: Record<string, string>;
  /** MD5 local já calculado, pelo tamanho e data do arquivo (para não reler tudo). */
  cache: Record<string, { size: number; mtime: number; md5: string }>;
  /** project.json na última sincronização, para juntar mudanças na estrutura. */
  projectBase: string | null;
  lastSync: number | null;
}

export interface LocalFile {
  path: string;
  size: number;
  /** null quando a plataforma não informa (navegador): o MD5 é recalculado sempre. */
  mtime: number | null;
}

/** Fica só neste computador. */
export function excluded(path: string): boolean {
  return (
    path === SYNC_FILE ||
    path === VERSION_INDEX ||
    path.startsWith(TRASH_DIR + "/") ||
    path.endsWith(".inkflow-tmp") ||
    /(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini)$/i.test(path)
  );
}

export async function readSyncState(fs: VaultFs): Promise<SyncState | null> {
  const raw = await fs.readText(SYNC_FILE);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SyncState;
  } catch {
    return null;
  }
}

export async function writeSyncState(fs: VaultFs, state: SyncState | null) {
  if (state) await fs.writeText(SYNC_FILE, JSON.stringify(state));
  else await fs.remove(SYNC_FILE);
}

export type Action =
  | { kind: "upload"; path: string; remote?: RemoteFile }
  | { kind: "download"; path: string; remote: RemoteFile }
  | { kind: "merge"; path: string; remote: RemoteFile }
  | { kind: "deleteLocal"; path: string }
  | { kind: "deleteRemote"; path: string; remote: RemoteFile }
  | { kind: "same"; path: string; md5: string }
  | { kind: "forget"; path: string };

export interface Plan {
  actions: Action[];
  /** Cenas e notas cujos arquivos serão escritos (o editor delas precisa ser fechado antes). */
  touchedDocs: Set<string>;
  /** Caminho do .md → id da cena ou nota. */
  docByPath: Map<string, string>;
}

const ydocId = (path: string) => path.match(/^\.inkflow\/ydoc\/(.+)\.yjs$/)?.[1] ?? null;

/** Compara local, Drive e base e decide o que fazer com cada arquivo. */
export function decide(
  local: Map<string, string>,
  remote: Map<string, RemoteFile>,
  base: Record<string, string>,
): Action[] {
  const actions: Action[] = [];
  const paths = new Set([...local.keys(), ...remote.keys(), ...Object.keys(base)]);
  for (const path of [...paths].sort()) {
    if (excluded(path)) continue;
    const l = local.get(path) ?? null;
    const r = remote.get(path) ?? null;
    const rm = r?.md5 ?? null;
    const b = base[path] ?? null;
    if (l === rm) {
      actions.push(l === null ? { kind: "forget", path } : { kind: "same", path, md5: l });
    } else if (l === b) {
      // Só o Drive mudou.
      actions.push(r ? { kind: "download", path, remote: r } : { kind: "deleteLocal", path });
    } else if (rm === b) {
      // Só aqui mudou.
      actions.push(
        l !== null
          ? { kind: "upload", path, remote: r ?? undefined }
          : { kind: "deleteRemote", path, remote: r! },
      );
    } else if (l === null) {
      actions.push({ kind: "download", path, remote: r! }); // excluído aqui, alterado lá
    } else if (r === null) {
      actions.push({ kind: "upload", path }); // excluído lá, alterado aqui
    } else {
      actions.push({ kind: "merge", path, remote: r });
    }
  }
  return actions;
}

/** Lista e calcula o MD5 dos arquivos locais, reaproveitando o que não mudou. */
export async function hashLocal(
  fs: VaultFs,
  files: LocalFile[],
  cache: SyncState["cache"],
): Promise<{ hashes: Map<string, string>; cache: SyncState["cache"] }> {
  const hashes = new Map<string, string>();
  const next: SyncState["cache"] = {};
  for (const f of files) {
    if (excluded(f.path)) continue;
    const c = cache[f.path];
    let hash: string;
    if (f.mtime !== null && c && c.size === f.size && c.mtime === f.mtime) hash = c.md5;
    else {
      const bytes = await fs.readBytes(f.path);
      if (!bytes) continue;
      hash = md5(bytes);
    }
    hashes.set(f.path, hash);
    if (f.mtime !== null) next[f.path] = { size: f.size, mtime: f.mtime, md5: hash };
  }
  return { hashes, cache: next };
}

/** Planeja a sincronização (só lê: nada é alterado ainda). */
export async function planSync(
  fs: VaultFs,
  drive: Drive,
  state: SyncState,
  files: LocalFile[],
  project: Project,
): Promise<Plan & { cache: SyncState["cache"] }> {
  const { hashes, cache } = await hashLocal(fs, files, state.cache);
  const remote = await drive.list(state.folderId);
  const actions = decide(hashes, remote, state.base);

  const touchedDocs = new Set<string>();
  const docByPath = new Map<string, string>();
  for (const c of project.chapters)
    for (const s of c.scenes) docByPath.set(`${MANUSCRIPT_DIR}/${c.dir}/${s.file}`, s.id);
  for (const n of project.notes) docByPath.set(`${NOTES_DIR}/${n.kind}/${n.file}`, n.id);
  for (const a of actions) {
    if (
      a.kind === "same" ||
      a.kind === "forget" ||
      a.kind === "upload" ||
      a.kind === "deleteRemote"
    )
      continue;
    const id = ydocId(a.path) ?? docByPath.get(a.path);
    if (id) touchedDocs.add(id);
    if (a.path === PROJECT_FILE) for (const id of docByPath.values()) touchedDocs.add(id);
  }
  return { actions, touchedDocs, docByPath, cache };
}

function ydocJson(update: Uint8Array) {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, update);
  const json = yDocToProsemirrorJSON(doc, YDOC_FIELD) as PMNode;
  doc.destroy();
  return json;
}
const docText = (update: Uint8Array) => toPlainText(ydocJson(update));
const docMarkdown = (update: Uint8Array) => toMarkdown(ydocJson(update));

export interface SyncResult {
  state: SyncState;
  /** Algo chegou do Drive: o app precisa reler o projeto. */
  changed: boolean;
  uploaded: number;
  downloaded: number;
  /** Conflitos em que a versão do Drive foi guardada na lixeira. */
  keptBoth: number;
  merged: number;
}

/** Executa o plano. Deve rodar com as gravações do app pausadas (fila `serial`). */
export async function applySync(
  fs: VaultFs,
  drive: Drive,
  state: SyncState,
  plan: Plan & { cache: SyncState["cache"] },
): Promise<SyncResult> {
  const base: Record<string, string> = {};
  const result: SyncResult = {
    state,
    changed: false,
    uploaded: 0,
    downloaded: 0,
    keptBoth: 0,
    merged: 0,
  };
  // Ids dos arquivos no Drive, para substituir o conteúdo em vez de criar outro.
  const remoteIds = new Map<string, string>();
  for (const a of plan.actions) if ("remote" in a && a.remote) remoteIds.set(a.path, a.remote.id);
  const regen = new Set<string>();
  // Textos cujo .yjs muda nesta sincronização: o .md deles é refeito no fim.
  const yjsChanging = new Set(
    plan.actions
      .filter((a) => a.kind === "download" || a.kind === "merge")
      .map((a) => ydocId(a.path))
      .filter((id): id is string => id !== null),
  );
  let versionsChanged = false;
  let projectAction: Action | null = null;

  const titleOf = async (id: string) => {
    const raw = await fs.readText(PROJECT_FILE);
    return raw ? (findDoc(JSON.parse(raw) as Project, id)?.title ?? null) : null;
  };
  const upload = async (path: string, data: Uint8Array, id?: string) => {
    const f = await drive.upload(state.folderId, path, data, id);
    remoteIds.set(path, f.id);
    base[path] = f.md5 || md5(data);
    result.uploaded++;
  };
  const write = async (path: string, data: Uint8Array) => {
    await fs.writeBytes(path, data);
    base[path] = md5(data);
    result.downloaded++;
    result.changed = true;
    if (path.startsWith(HISTORY_DIR + "/")) versionsChanged = true;
  };

  for (const a of plan.actions) {
    if (a.path === PROJECT_FILE && a.kind !== "same" && a.kind !== "forget") {
      projectAction = a; // depois de todos os textos
      continue;
    }
    switch (a.kind) {
      case "same":
        base[a.path] = a.md5;
        break;
      case "forget":
        break;
      case "upload": {
        const data = await fs.readBytes(a.path);
        if (data) await upload(a.path, data, a.remote?.id);
        break;
      }
      case "download": {
        await write(a.path, await drive.download(a.remote.id));
        const id = ydocId(a.path);
        if (id) regen.add(id);
        break;
      }
      case "deleteRemote":
        await drive.remove(a.remote.id);
        break;
      case "deleteLocal":
        result.changed = true;
        if (a.path.startsWith(HISTORY_DIR + "/")) versionsChanged = true;
        if (a.path.startsWith(".inkflow/")) await fs.remove(a.path);
        else
          await moveToTrash(fs, a.path, {
            kind: "backup",
            label: `${a.path} (excluído em outro computador)`,
          });
        break;
      case "merge": {
        const local = (await fs.readBytes(a.path))!;
        const remote = await drive.download(a.remote.id);
        const id = ydocId(a.path);
        if (id) {
          // As duas edições do mesmo texto entram (Yjs).
          const merged = Y.mergeUpdates([local, remote]);
          await write(a.path, merged);
          await upload(a.path, merged, a.remote.id);
          regen.add(id);
          result.merged++;
          // Rede de segurança: se um parágrafo de um dos lados não entrou na mescla
          // (ex.: o outro lado dividiu esse parágrafo), guarda aquele lado inteiro na lixeira.
          const mergedText = docText(merged);
          for (const [side, update] of [
            ["deste computador", local],
            ["do Drive", remote],
          ] as const) {
            const missing = docText(update)
              .split("\n")
              .map((p) => p.trim())
              .filter((p) => p && !mergedText.includes(p));
            if (missing.length === 0) continue;
            const title = (await titleOf(id)) ?? "Texto";
            await saveToTrash(
              fs,
              `${slugify(title)}.md`,
              new TextEncoder().encode(docMarkdown(update)),
              `"${title}" — versão ${side} antes de mesclar (conferir)`,
            );
            result.keptBoth++;
          }
        } else if (yjsChanging.has(plan.docByPath.get(a.path) ?? "")) {
          // O .md é refeito no fim a partir do .yjs mesclado.
          base[a.path] = a.remote.md5;
        } else {
          await upload(a.path, local, a.remote.id);
          await saveToTrash(fs, a.path, remote, `${a.path} — versão do Drive (conflito)`);
          result.keptBoth++;
        }
        break;
      }
    }
  }

  // Estrutura do projeto, por último.
  let project: Project | null = null;
  const projectText = async () =>
    new TextDecoder().decode((await fs.readBytes(PROJECT_FILE)) ?? new Uint8Array());
  if (projectAction?.kind === "merge") {
    const local = JSON.parse(await projectText()) as Project;
    const remote = JSON.parse(
      new TextDecoder().decode(await drive.download(projectAction.remote.id)),
    ) as Project;
    const baseProject = state.projectBase ? (JSON.parse(state.projectBase) as Project) : null;
    project = mergeProjects(baseProject, local, remote);
    const data = new TextEncoder().encode(JSON.stringify(project, null, 2) + "\n");
    await write(PROJECT_FILE, data);
    await upload(PROJECT_FILE, data, projectAction.remote.id);
    result.merged++;
  } else if (projectAction?.kind === "download") {
    await write(PROJECT_FILE, await drive.download(projectAction.remote.id));
  } else if (projectAction?.kind === "upload") {
    const data = await fs.readBytes(PROJECT_FILE);
    if (data) await upload(PROJECT_FILE, data, projectAction.remote?.id);
  }

  // Refaz o .md dos textos cujo .yjs chegou do Drive ou foi mesclado.
  const text = await projectText();
  if (text) project = JSON.parse(text) as Project;
  if (project) {
    for (const id of regen) {
      const doc = findDoc(project, id);
      const bytes = await fs.readBytes(ydocPath(id));
      if (!doc || !bytes) continue;
      const ydoc = new Y.Doc();
      Y.applyUpdate(ydoc, bytes);
      const md = sceneFile(doc, toMarkdown(yDocToProsemirrorJSON(ydoc, YDOC_FIELD) as PMNode));
      ydoc.destroy();
      const data = new TextEncoder().encode(md);
      const current = await fs.readBytes(doc.path);
      if (current && md5(current) === md5(data)) continue;
      await write(doc.path, data);
      await upload(doc.path, data, remoteIds.get(doc.path));
    }
  }
  if (versionsChanged) await forgetVersionIndex(fs);

  // A data do arquivo muda ao gravar: o MD5 dos que foram escritos é recalculado na próxima vez.
  const cache = { ...plan.cache };
  for (const path of Object.keys(base)) if (cache[path]?.md5 !== base[path]) delete cache[path];

  result.state = {
    ...state,
    base,
    cache,
    projectBase: text || state.projectBase,
    lastSync: Date.now(),
  };
  return result;
}
