import type { VaultFs } from "../platform/types";
import type { Chapter, FsOp, Note, Project, Scene, TrashItem } from "../manuscript/types";
import {
  ATTACHMENTS_DIR,
  MANUSCRIPT_DIR,
  NOTES_DIR,
  TRASH_DIR,
  slugify,
  uniqueName,
  ydocPath,
} from "./paths";

export type { TrashItem };

/*
 * Lixeira: o que é excluído vai para `.inkflow/lixeira/` e ganha uma entrada
 * em `indice.json` dizendo o que era e onde estava, para poder voltar.
 */

const INDEX = `${TRASH_DIR}/indice.json`;

export interface TrashEntry {
  id: string;
  deletedAt: number;
  title: string;
  item: TrashItem;
  /** Onde o arquivo ou a pasta está dentro da lixeira. */
  path: string;
  /** Estado do editor (.yjs) de cada cena guardado junto: id → caminho na lixeira. */
  ydocs: Record<string, string>;
}

export const trashStamp = () => new Date().toISOString().replace(/[:.]/g, "-");

export function itemTitle(item: TrashItem): string {
  switch (item.kind) {
    case "scene":
      return item.scene.title;
    case "chapter":
      return item.chapter.title;
    case "note":
      return item.note.title;
    case "attachment":
      return item.name;
    case "backup":
      return item.label;
  }
}

export async function listTrash(fs: VaultFs): Promise<TrashEntry[]> {
  const raw = await fs.readText(INDEX);
  if (raw === null) return [];
  try {
    return (JSON.parse(raw) as TrashEntry[]).sort((a, b) => b.deletedAt - a.deletedAt);
  } catch {
    return [];
  }
}

async function writeIndex(fs: VaultFs, entries: TrashEntry[]) {
  await fs.writeText(INDEX, JSON.stringify(entries, null, 1));
}

/**
 * Manda um arquivo ou pasta (e o estado do editor das cenas dentro) para a
 * lixeira e registra a entrada.
 */
export async function moveToTrash(
  fs: VaultFs,
  path: string,
  item: TrashItem,
  sceneIds: string[] = [],
): Promise<TrashEntry | null> {
  if (!(await fs.exists(path))) return null;
  const stamp = trashStamp();
  const name = path.split("/").pop()!;
  const entry: TrashEntry = {
    id: `${stamp}-${crypto.randomUUID().slice(0, 8)}`,
    deletedAt: Date.now(),
    title: itemTitle(item),
    item,
    path: `${TRASH_DIR}/${stamp}-${name}`,
    ydocs: {},
  };
  await fs.rename(path, entry.path);
  for (const id of sceneIds) {
    if (await fs.exists(ydocPath(id))) {
      entry.ydocs[id] = `${TRASH_DIR}/${stamp}-${id}.yjs`;
      await fs.rename(ydocPath(id), entry.ydocs[id]);
    }
  }
  await writeIndex(fs, [entry, ...(await listTrash(fs))]);
  return entry;
}

/** Apaga de vez uma entrada da lixeira. */
export async function deleteFromTrash(fs: VaultFs, id: string) {
  const entries = await listTrash(fs);
  const entry = entries.find((e) => e.id === id);
  if (!entry) return;
  await fs.remove(entry.path);
  for (const p of Object.values(entry.ydocs)) await fs.remove(p);
  await writeIndex(
    fs,
    entries.filter((e) => e.id !== id),
  );
}

/** Apaga tudo o que está na lixeira (inclusive o que foi excluído antes da lixeira ter índice). */
export async function emptyTrash(fs: VaultFs) {
  await fs.remove(TRASH_DIR);
}

/** Tira uma entrada do índice (depois de restaurada). */
export async function dropTrashEntry(fs: VaultFs, id: string) {
  await writeIndex(
    fs,
    (await listTrash(fs)).filter((e) => e.id !== id),
  );
}

const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

/**
 * Como pôr uma entrada de volta no projeto: o projeto novo e os arquivos a
 * mover da lixeira para o lugar. Nomes já usados ganham sufixo (-2, -3...).
 * Uma cena cujo capítulo também foi excluído volta num capítulo novo com o mesmo nome.
 */
export function restorePlan(
  p: Project,
  entry: TrashEntry,
  attachments: string[] = [],
): { project: Project; ops: FsOp[]; openId: string | null } | null {
  const { item } = entry;
  const usedIds = new Set([
    ...p.chapters.flatMap((c) => [c.id, ...c.scenes.map((s) => s.id)]),
    ...p.notes.map((n) => n.id),
  ]);
  const ydocMoves = (map: Record<string, string>, rename: Record<string, string> = {}): FsOp[] =>
    Object.entries(map).map(([id, from]) => ({
      kind: "move",
      from,
      to: ydocPath(rename[id] ?? id),
    }));
  const now = Date.now();

  if (item.kind === "scene") {
    const id = usedIds.has(item.scene.id) ? newId("sc") : item.scene.id;
    let chapters = p.chapters;
    let chapter =
      chapters.find((c) => c.id === item.chapter.id) ??
      chapters.find((c) => c.title === item.chapter.title);
    if (!chapter) {
      const taken = new Set(chapters.map((c) => c.dir));
      chapter = {
        id: newId("ch"),
        title: item.chapter.title,
        dir: uniqueName(slugify(item.chapter.title), taken),
        scenes: [],
      };
      chapters = [...chapters, chapter];
    }
    const file = uniqueName(
      slugify(item.scene.title),
      new Set(chapter.scenes.map((s) => s.file)),
      ".md",
    );
    const scene: Scene = { id, title: item.scene.title, file };
    const target = chapter;
    chapters = chapters.map((c) => {
      if (c.id !== target.id) return c;
      const scenes = [...c.scenes];
      scenes.splice(Math.min(item.index, scenes.length), 0, scene);
      return { ...c, scenes };
    });
    return {
      project: { ...p, chapters, updatedAt: now },
      ops: [
        { kind: "move", from: entry.path, to: `${MANUSCRIPT_DIR}/${chapter.dir}/${file}` },
        ...ydocMoves(entry.ydocs, { [item.scene.id]: id }),
      ],
      openId: id,
    };
  }

  if (item.kind === "chapter") {
    const dir = uniqueName(slugify(item.chapter.title), new Set(p.chapters.map((c) => c.dir)));
    const chapter: Chapter = {
      ...item.chapter,
      id: usedIds.has(item.chapter.id) ? newId("ch") : item.chapter.id,
      dir,
      scenes: item.chapter.scenes.filter((s) => !usedIds.has(s.id)),
    };
    const chapters = [...p.chapters];
    chapters.splice(Math.min(item.index, chapters.length), 0, chapter);
    return {
      project: { ...p, chapters, updatedAt: now },
      ops: [
        { kind: "move", from: entry.path, to: `${MANUSCRIPT_DIR}/${dir}` },
        ...ydocMoves(entry.ydocs),
      ],
      openId: chapter.scenes[0]?.id ?? null,
    };
  }

  if (item.kind === "note") {
    const id = usedIds.has(item.note.id) ? newId("nt") : item.note.id;
    const file = uniqueName(
      slugify(item.note.title),
      new Set(p.notes.filter((n) => n.kind === item.note.kind).map((n) => n.file)),
      ".md",
    );
    const note: Note = { ...item.note, id, file };
    return {
      project: { ...p, notes: [...p.notes, note], updatedAt: now },
      ops: [
        { kind: "move", from: entry.path, to: `${NOTES_DIR}/${note.kind}/${file}` },
        ...ydocMoves(entry.ydocs, { [item.note.id]: id }),
      ],
      openId: id,
    };
  }

  if (item.kind === "attachment") {
    const dot = item.name.lastIndexOf(".");
    const name = uniqueName(
      dot > 0 ? item.name.slice(0, dot) : item.name,
      new Set(attachments),
      dot > 0 ? item.name.slice(dot) : "",
    );
    return {
      project: p,
      ops: [{ kind: "move", from: entry.path, to: `${ATTACHMENTS_DIR}/${name}` }],
      openId: null,
    };
  }

  return null;
}
