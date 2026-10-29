import type { VaultFs } from "../platform/types";
import type { Project } from "../manuscript/types";
import { allDocs } from "../manuscript/tree";
import { parseMarkdown, splitFrontmatter } from "../markdown/parse";
import { toPlainText } from "../markdown/serialize";
import { countWords } from "../manuscript/wordCount";
import { HISTORY_DIR, MANUSCRIPT_DIR, NOTES_DIR } from "./paths";
import { moveToTrash } from "./trash";
import { ensureChapterDirs, saveProject, sceneFile } from "./vault";

/*
 * Histórico de versões do projeto inteiro. Cada versão é um arquivo JSON em
 * `.inkflow/versoes/` com a estrutura (project.json) e o texto de todas as
 * cenas e notas. Os anexos não entram: eles ficam na pasta anexos/.
 */

const INDEX = `${HISTORY_DIR}/indice.json`;
/** Versões automáticas mais recentes mantidas inteiras; das mais antigas fica uma por dia. */
const KEEP_RECENT_AUTO = 20;

export interface VersionInfo {
  id: string;
  createdAt: number;
  /** Nome dado pela pessoa, ou o motivo de uma versão automática. */
  label: string;
  auto: boolean;
  /** Palavras do manuscrito (só cenas), como na barra lateral. */
  words: number;
  /** Resumo do conteúdo, para não guardar duas versões iguais seguidas. */
  hash: string;
}

export interface Version extends VersionInfo {
  format: 1;
  project: Project;
  /** Texto (Markdown, sem o cabeçalho) de cada cena e nota, pelo id. */
  texts: Record<string, string>;
}

const versionPath = (id: string) => `${HISTORY_DIR}/${id}.json`;

/** FNV-1a de 32 bits: rápido e suficiente para comparar duas versões. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function contentHash(project: Project, texts: Record<string, string>) {
  const { chapters, notes, title } = project;
  return hash(JSON.stringify({ title, chapters, notes, texts }));
}

/** Texto de cada cena e nota como está no disco agora. */
export async function readBodies(fs: VaultFs, project: Project): Promise<Record<string, string>> {
  const texts: Record<string, string> = {};
  for (const d of allDocs(project)) {
    const md = await fs.readText(d.path);
    texts[d.id] = md === null ? "" : splitFrontmatter(md).body.replace(/^\n+/, "");
  }
  return texts;
}

export function manuscriptWords(project: Project, texts: Record<string, string>) {
  return project.chapters.reduce(
    (n, c) => n + c.scenes.reduce((m, s) => m + bodyWords(texts[s.id] ?? ""), 0),
    0,
  );
}

export const bodyWords = (body: string) => countWords(toPlainText(parseMarkdown(body)));

export async function listVersions(fs: VaultFs): Promise<VersionInfo[]> {
  const raw = await fs.readText(INDEX);
  if (raw !== null) {
    try {
      return JSON.parse(raw) as VersionInfo[];
    } catch {
      // índice corrompido: refaz a partir dos arquivos
    }
  }
  const list: VersionInfo[] = [];
  for (const name of await fs.list(HISTORY_DIR)) {
    if (name === "indice.json" || !name.endsWith(".json")) continue;
    const v = await readVersion(fs, name.slice(0, -5));
    if (v) list.push(info(v));
  }
  list.sort((a, b) => b.createdAt - a.createdAt);
  if (list.length) await fs.writeText(INDEX, JSON.stringify(list, null, 1));
  return list;
}

export async function readVersion(fs: VaultFs, id: string): Promise<Version | null> {
  const raw = await fs.readText(versionPath(id));
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as Version;
  } catch {
    return null;
  }
}

function info(v: Version): VersionInfo {
  const { id, createdAt, label, auto, words, hash } = v;
  return { id, createdAt, label, auto, words, hash };
}

/**
 * Guarda uma versão do projeto como está no disco. Uma versão automática
 * igual à última não é guardada (devolve null).
 */
export async function saveVersion(
  fs: VaultFs,
  project: Project,
  opts: { label: string; auto: boolean; now?: number },
): Promise<VersionInfo | null> {
  const texts = await readBodies(fs, project);
  const list = await listVersions(fs);
  const h = contentHash(project, texts);
  if (opts.auto && list[0]?.hash === h) return null;

  const createdAt = opts.now ?? Date.now();
  let id = "v-" + new Date(createdAt).toISOString().replace(/[:.]/g, "-");
  if (list.some((v) => v.id === id)) id += "-" + list.length;
  const version: Version = {
    format: 1,
    id,
    createdAt,
    label: opts.label.trim() || (opts.auto ? "Automática" : "Versão sem nome"),
    auto: opts.auto,
    words: manuscriptWords(project, texts),
    hash: h,
    project,
    texts,
  };
  await fs.writeText(versionPath(id), JSON.stringify(version));

  const next = [info(version), ...list];
  const drop = new Set(versionsToPrune(next));
  for (const v of next) if (drop.has(v.id)) await fs.remove(versionPath(v.id));
  await fs.writeText(
    INDEX,
    JSON.stringify(
      next.filter((v) => !drop.has(v.id)),
      null,
      1,
    ),
  );
  return info(version);
}

/**
 * Versões automáticas que podem ser apagadas: das mais antigas que as 20
 * mais recentes, fica só a última de cada dia. As salvas pela pessoa ficam sempre.
 */
export function versionsToPrune(list: VersionInfo[]): string[] {
  const autos = list.filter((v) => v.auto).sort((a, b) => b.createdAt - a.createdAt);
  const seenDays = new Set<string>();
  const drop: string[] = [];
  autos.slice(KEEP_RECENT_AUTO).forEach((v) => {
    const day = new Date(v.createdAt).toDateString();
    if (seenDays.has(day)) drop.push(v.id);
    else seenDays.add(day);
  });
  return drop;
}

/** Esquece o índice para ser refeito a partir dos arquivos (ex.: chegaram versões pelo sync). */
export async function forgetVersionIndex(fs: VaultFs) {
  await fs.remove(INDEX);
}

export async function deleteVersion(fs: VaultFs, id: string) {
  const list = await listVersions(fs);
  await fs.remove(versionPath(id));
  await fs.writeText(
    INDEX,
    JSON.stringify(
      list.filter((v) => v.id !== id),
      null,
      1,
    ),
  );
}

export type DocStatus = "changed" | "same" | "removed" | "added";

export interface DocComparison {
  id: string;
  title: string;
  type: "scene" | Project["notes"][number]["kind"];
  /** Capítulo da cena nesta versão, ou do projeto atual se ela é nova. */
  chapter?: string;
  status: DocStatus;
  /** Palavras na versão e agora. */
  then: number;
  now: number;
}

/** Compara cada cena e nota de uma versão com o projeto atual. */
export function compareVersion(
  version: Version,
  project: Project,
  current: Record<string, string>,
): DocComparison[] {
  const now = new Map(allDocs(project).map((d) => [d.id, d]));
  const chapterOf = (p: Project) =>
    new Map(p.chapters.flatMap((c) => c.scenes.map((s) => [s.id, c.title] as const)));
  const thenChapters = chapterOf(version.project);
  const nowChapters = chapterOf(project);
  const out: DocComparison[] = [];
  for (const d of allDocs(version.project)) {
    const body = version.texts[d.id] ?? "";
    const cur = now.get(d.id);
    out.push({
      id: d.id,
      title: d.title,
      type: d.type,
      chapter: thenChapters.get(d.id),
      status: !cur ? "removed" : (current[d.id] ?? "").trim() === body.trim() ? "same" : "changed",
      then: bodyWords(body),
      now: cur ? bodyWords(current[d.id] ?? "") : 0,
    });
  }
  const inVersion = new Set(out.map((d) => d.id));
  for (const d of now.values()) {
    if (inVersion.has(d.id)) continue;
    out.push({
      id: d.id,
      title: d.title,
      type: d.type,
      chapter: nowChapters.get(d.id),
      status: "added",
      then: 0,
      now: bodyWords(current[d.id] ?? ""),
    });
  }
  return out;
}

/**
 * Volta o projeto inteiro para uma versão. As pastas manuscrito/ e notas/
 * de agora vão para a lixeira antes (nada é apagado). O estado do editor
 * (.inkflow/ydoc) fica: ao abrir, cada texto percebe que o .md mudou e
 * aplica a diferença como uma edição.
 */
export async function restoreProjectFiles(fs: VaultFs, version: Version): Promise<Project> {
  for (const dir of [MANUSCRIPT_DIR, NOTES_DIR]) {
    await moveToTrash(fs, dir, {
      kind: "backup",
      label: `${dir}/ antes de voltar para "${version.label}"`,
    });
  }
  const project: Project = {
    ...version.project,
    notes: version.project.notes ?? [],
    updatedAt: Date.now(),
  };
  for (const d of allDocs(project)) {
    await fs.writeText(d.path, sceneFile(d, version.texts[d.id] ?? ""));
  }
  await ensureChapterDirs(fs, project);
  await saveProject(fs, project);
  return project;
}
