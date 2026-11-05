import * as Y from "yjs";
import { yDocToProsemirrorJSON } from "@tiptap/y-tiptap";
import type { VaultFs } from "../platform/types";
import type { Project } from "../manuscript/types";
import { allDocs, findDoc } from "../manuscript/tree";
import { splitFrontmatter } from "../markdown/parse";
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
import { sceneFile, validateProject } from "../vault/vault";
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
  /** MD5 local de cada arquivo quando o plano foi feito. */
  local: Map<string, string>;
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
  return { actions, touchedDocs, docByPath, local: hashes, cache };
}

function ydocJson(update: Uint8Array) {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, update);
  const json = yDocToProsemirrorJSON(doc, YDOC_FIELD) as PMNode;
  doc.destroy();
  return json;
}
const docText = (update: Uint8Array) => toPlainText(ydocJson(update));
/** Palavras de um texto (para conferir se alguma ficou de fora de uma mescla). */
const words = (text: string) => text.toLocaleLowerCase("pt-BR").match(/[\p{L}\p{N}]+/gu) ?? [];
const docMarkdown = (update: Uint8Array) => toMarkdown(ydocJson(update));

/** Nome legível de um arquivo para a Lixeira (sem o caminho de pastas). */
const fileLabel = (path: string) => `“${path.split("/").pop()}”`;

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

  // .yjs de antes desta sincronização, para notar .md editado fora do app.
  const previousYdoc = new Map<string, Uint8Array>();
  const keepPrevious = async (path: string) => {
    const id = ydocId(path);
    if (!id || previousYdoc.has(id)) return;
    const bytes = await fs.readBytes(path);
    if (bytes) previousYdoc.set(id, bytes);
  };

  for (const planned of plan.actions) {
    // O plano foi feito antes de pausar as gravações: se o arquivo mudou aqui
    // nesse meio-tempo, não pode ser sobrescrito nem apagado.
    let a = planned;
    if (a.kind === "download" || a.kind === "deleteLocal") {
      const now = await fs.readBytes(a.path);
      const hash = now ? md5(now) : null;
      if (hash !== (plan.local.get(a.path) ?? null)) {
        a =
          a.kind === "download"
            ? hash === null
              ? a
              : { kind: "merge", path: a.path, remote: a.remote }
            : { kind: "upload", path: a.path };
      }
    }
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
        await keepPrevious(a.path);
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
            label: `${fileLabel(a.path)} (excluído em outro computador)`,
          });
        break;
      case "merge": {
        const local = (await fs.readBytes(a.path))!;
        const remote = await drive.download(a.remote.id);
        const id = ydocId(a.path);
        if (id) {
          await keepPrevious(a.path);
          // As duas edições do mesmo texto entram (Yjs).
          const merged = Y.mergeUpdates([local, remote]);
          await write(a.path, merged);
          await upload(a.path, merged, a.remote.id);
          regen.add(id);
          result.merged++;
          // Rede de segurança: se um parágrafo de um dos lados não entrou na mescla
          // (ex.: o outro lado dividiu esse parágrafo), guarda aquele lado inteiro na lixeira.
          const mergedWords = new Set(words(docText(merged)));
          for (const [side, update] of [
            ["deste computador", local],
            ["do Drive", remote],
          ] as const) {
            const missing = words(docText(update)).filter((w) => !mergedWords.has(w));
            if (missing.length === 0) continue;
            const title = (await titleOf(id)) ?? "Texto";
            await saveToTrash(
              fs,
              `${slugify(title)}.md`,
              new TextEncoder().encode(docMarkdown(update)),
              `“${title}” — cópia ${side} antes de juntar as edições (confira)`,
            );
            result.keptBoth++;
          }
        } else if (yjsChanging.has(plan.docByPath.get(a.path) ?? "")) {
          // O .md é refeito no fim a partir do .yjs mesclado.
          base[a.path] = a.remote.md5;
        } else {
          await upload(a.path, local, a.remote.id);
          await saveToTrash(
            fs,
            a.path,
            remote,
            `${fileLabel(a.path)} — versão do Drive (alterado nos dois computadores)`,
          );
          result.keptBoth++;
        }
        break;
      }
    }
  }

  /** .md por id (lido do cabeçalho), montado só se precisar. */
  let mdById: Map<string, string> | null = null;
  const findMd = async (id: string) => {
    if (!mdById) {
      mdById = new Map();
      for (const f of await fs.walk()) {
        if (!/^(manuscrito|notas)\/.+\.md$/.test(f.path)) continue;
        const fid = splitFrontmatter((await fs.readText(f.path)) ?? "").frontmatter.id;
        if (fid && !mdById.has(fid)) mdById.set(fid, f.path);
      }
    }
    return mdById.get(id) ?? null;
  };
  const mdFromYdoc = (bytes: Uint8Array) => toMarkdown(ydocJson(bytes));
  const sameBody = (a: string, b: string) =>
    a.replace(/\r\n?/g, "\n").trim() === b.replace(/\r\n?/g, "\n").trim();

  /**
   * Garante que cada cena e nota tem o seu texto no arquivo certo: refaz o .md
   * de quem teve o .yjs alterado e, quando a junção mudou o nome de um arquivo
   * (ou dois textos disputavam o mesmo nome), põe cada texto no seu lugar.
   */
  const placeDocs = async (p: Project, regenIds: Set<string>) => {
    const used = new Set(allDocs(p).map((d) => d.path));
    for (const doc of allDocs(p)) {
      const current = await fs.readText(doc.path);
      const fm = current === null ? null : splitFrontmatter(current);
      const mine = fm !== null && fm.frontmatter.id === doc.id;
      const ybytes = await fs.readBytes(ydocPath(doc.id));
      let body: string | null = null;
      if (regenIds.has(doc.id) && ybytes) {
        body = mdFromYdoc(ybytes);
        // O .md tinha sido editado fora do app: guarda essa versão antes de refazer.
        const before = previousYdoc.get(doc.id);
        if (mine && before && !sameBody(fm.body, mdFromYdoc(before)) && !sameBody(fm.body, body)) {
          await saveToTrash(
            fs,
            doc.path,
            new TextEncoder().encode(current!),
            `"${doc.title}" — editado fora do app antes de sincronizar`,
          );
          result.keptBoth++;
        }
      } else if (!mine) {
        const source = await findMd(doc.id);
        if (source && source !== doc.path) {
          body = splitFrontmatter((await fs.readText(source)) ?? "").body.replace(/^\n+/, "");
          if (!used.has(source)) await fs.remove(source);
        } else if (ybytes) body = mdFromYdoc(ybytes);
        else if (current === null) body = "";
      }
      if (body === null) continue;
      const data = new TextEncoder().encode(sceneFile(doc, body));
      if (current !== null && sameBody(current, new TextDecoder().decode(data))) continue;
      await write(doc.path, data);
      await upload(doc.path, data, remoteIds.get(doc.path));
    }
  };

  // Estrutura do projeto, por último.
  let project: Project | null = null;
  const projectText = async () =>
    new TextDecoder().decode((await fs.readBytes(PROJECT_FILE)) ?? new Uint8Array());
  /** Lê um project.json vindo do Drive; null se estiver corrompido ou estranho. */
  const parseRemote = (data: Uint8Array): Project | null => {
    try {
      const p = JSON.parse(new TextDecoder().decode(data)) as Project;
      validateProject(p);
      return p;
    } catch {
      return null;
    }
  };
  // Textos que mudaram de cada lado: uma cena excluída lá mas editada aqui (ou o contrário) fica.
  const changed = { local: new Set<string>(), remote: new Set<string>() };
  for (const x of plan.actions) {
    const id = ydocId(x.path) ?? plan.docByPath.get(x.path);
    if (!id) continue;
    if (x.kind === "upload" || x.kind === "merge") changed.local.add(id);
    if (x.kind === "download" || x.kind === "merge") changed.remote.add(id);
  }
  if (projectAction?.kind === "merge" || projectAction?.kind === "download") {
    const data = await drive.download(projectAction.remote.id);
    const remote = parseRemote(data);
    if (!remote) {
      // project.json do Drive com problema: fica o daqui, e o do Drive vai para a lixeira.
      await saveToTrash(fs, PROJECT_FILE, data, "project.json do Drive (com problema)");
      result.keptBoth++;
      const local = await fs.readBytes(PROJECT_FILE);
      if (local) await upload(PROJECT_FILE, local, projectAction.remote.id);
    } else {
      // Mesmo quando só o Drive mudou a estrutura, junta com a daqui: uma cena
      // que lá foi excluída mas aqui foi editada continua no projeto.
      const localText = await projectText();
      const local = localText ? (JSON.parse(localText) as Project) : null;
      const baseProject = state.projectBase ? (JSON.parse(state.projectBase) as Project) : null;
      project = local ? mergeProjects(baseProject, local, remote, changed) : remote;
      const merged = new TextEncoder().encode(JSON.stringify(project, null, 2) + "\n");
      const same = md5(merged) === md5(data);
      await write(PROJECT_FILE, same ? data : merged);
      if (!same) await upload(PROJECT_FILE, merged, projectAction.remote.id);
      if (projectAction.kind === "merge") result.merged++;
    }
  } else if (projectAction?.kind === "upload") {
    const data = await fs.readBytes(PROJECT_FILE);
    if (data) await upload(PROJECT_FILE, data, projectAction.remote?.id);
  }

  const text = await projectText();
  if (text) project = JSON.parse(text) as Project;
  if (project) {
    await placeDocs(project, regen);
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
