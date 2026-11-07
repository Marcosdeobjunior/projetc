import type { VaultFs } from "../platform/types";
import { NOTE_KINDS, type NoteKind, type Project } from "../manuscript/types";
import { addChapter, addNote, addScene, allDocs, findScene, moveScene } from "../manuscript/tree";
import { splitFrontmatter } from "../markdown/parse";
import { attachmentKind } from "../editor/attachments";
import { ATTACHMENTS_DIR, MANUSCRIPT_DIR, NOTES_DIR, TRASH_DIR, uniqueName } from "./paths";
import type { TrashEntry } from "./trash";

/*
 * Cópias de segurança da Lixeira ("backup"): o que a sincronização ou a volta
 * para uma versão guardaram para nada se perder. Podem ser um arquivo (o texto
 * de um dos lados num conflito, um arquivo excluído em outro computador) ou uma
 * pasta inteira (manuscrito/ ou notas/ de antes de voltar para uma versão).
 *
 * Restaurar não substitui nada: cada texto volta como um texto novo do
 * projeto, e cada imagem, áudio ou documento volta para anexos/. Arquivos
 * técnicos (.yjs, .json) ficam na Lixeira.
 */

/** Capítulo onde entram os textos que não têm mais um lugar no projeto. */
export const RECOVERED_CHAPTER = "Recuperados da Lixeira";
const COPY_SUFFIX = " (cópia de segurança)";
const FOLDER_SUFFIX = " (recuperado)";

export interface BackupText {
  /** Caminho do .md na Lixeira. */
  path: string;
  title: string;
  body: string;
  /** id do cabeçalho do .md, quando havia um. */
  id: string | null;
  /** Numa pasta manuscrito/: a pasta do capítulo. Numa pasta notas/: o tipo da nota. */
  chapterDir: string | null;
  noteKind: NoteKind | null;
}

export interface BackupContents {
  texts: BackupText[];
  /** Imagens, áudios, vídeos e documentos: voltam para anexos/. */
  attachments: { path: string; name: string }[];
  /** Arquivos técnicos que não dá para restaurar pela interface. */
  other: string[];
}

const baseName = (path: string) => path.split("/").pop()!;
/** Tira o carimbo de data que a Lixeira põe no nome ("2026-11-07T00-00-00-000Z-"). */
const unstamp = (name: string) => name.replace(/^\d{4}-\d\d-\d\dT[\d-]+Z-/, "");

/** Título para quando o .md não tem cabeçalho: o rótulo da entrada ou o nome do arquivo. */
function fallbackTitle(entry: TrashEntry, path: string, single: boolean) {
  if (single) {
    // Rótulos das cópias do sync: “Título” — cópia ... / "Título" — editado fora...
    const quoted = entry.title.match(/^[“"](.+?)[”"]/);
    if (quoted) return quoted[1]!;
  }
  return unstamp(baseName(path)).replace(/\.md$/i, "") || "Texto";
}

/**
 * Lê o que há numa cópia de segurança. `files` é o `fs.walk()` do projeto
 * (passe o mesmo para várias entradas, para não percorrer a pasta de novo).
 */
export async function readBackup(
  fs: VaultFs,
  entry: TrashEntry,
  files?: { path: string }[],
): Promise<BackupContents> {
  const all = files ?? (await fs.walk());
  const single = all.some((f) => f.path === entry.path);
  const inside = single
    ? [entry.path]
    : all
        .map((f) => f.path)
        .filter((p) => p.startsWith(entry.path + "/"))
        .sort();
  const folder = unstamp(baseName(entry.path));
  const out: BackupContents = { texts: [], attachments: [], other: [] };
  for (const path of inside) {
    const name = baseName(path);
    if (/\.md$/i.test(name)) {
      const raw = await fs.readText(path);
      if (raw === null) continue;
      const { frontmatter, body } = splitFrontmatter(raw);
      const rel = single ? [] : path.slice(entry.path.length + 1).split("/");
      const kind = folder === NOTES_DIR ? (rel[0] as NoteKind) : null;
      out.texts.push({
        path,
        title: frontmatter.title?.trim() || fallbackTitle(entry, path, single),
        body: body.replace(/^\n+/, ""),
        id: frontmatter.id ?? null,
        chapterDir: folder === MANUSCRIPT_DIR && rel.length > 1 ? rel[0]! : null,
        noteKind: kind && NOTE_KINDS.includes(kind) ? kind : null,
      });
    } else if (name !== ".keep" && attachmentKind(name) !== "file") {
      out.attachments.push({ path, name: unstamp(name) });
    } else if (name !== ".keep") {
      out.other.push(path);
    }
  }
  return out;
}

/** Dá para pôr algo de volta no projeto. */
export const restorable = (c: BackupContents) => c.texts.length + c.attachments.length > 0;

export interface BackupPlan {
  project: Project;
  /** Textos novos: id no projeto → corpo em Markdown. */
  texts: { id: string; body: string }[];
  /** Arquivos a mover da Lixeira para anexos/. */
  moves: { from: string; to: string }[];
  /** Caminhos que saem da Lixeira depois de restaurar. */
  restored: string[];
  openId: string | null;
}

/**
 * Como pôr uma cópia de segurança de volta, sem substituir nada:
 * - texto de uma cena que ainda existe → cena nova logo abaixo dela;
 * - texto de uma nota que ainda existe → nota nova do mesmo tipo;
 * - pasta manuscrito/ → um capítulo novo por capítulo da pasta;
 * - pasta notas/ → as notas voltam, cada uma no seu tipo;
 * - o resto dos textos → o capítulo "Recuperados da Lixeira";
 * - imagens, áudios e documentos → anexos/.
 */
export function backupRestorePlan(
  p: Project,
  contents: BackupContents,
  attachments: string[] = [],
): BackupPlan {
  let project = p;
  const texts: BackupPlan["texts"] = [];
  const restored: string[] = [];
  const byTitle = new Map(allDocs(p).map((d) => [d.title, d.id]));
  const chapterFor = new Map<string, string>();

  const chapterId = (title: string) => {
    const existing = project.chapters.find((c) => c.title === title);
    if (existing) return existing.id;
    const r = addChapter(project, title);
    project = r.project;
    return r.chapter.id;
  };
  const sceneIn = (chapter: string, title: string) => {
    const r = addScene(project, chapter, title);
    project = r.project;
    return r.scene.id;
  };
  const note = (kind: NoteKind, title: string) => {
    const r = addNote(project, kind, title);
    project = r.project;
    return r.note.id;
  };

  for (const t of contents.texts) {
    let id: string;
    if (t.chapterDir !== null) {
      // Pasta manuscrito/: um capítulo novo para cada capítulo que estava nela.
      let ch = chapterFor.get(t.chapterDir);
      if (!ch) {
        const was = p.chapters.find((c) => c.dir === t.chapterDir)?.title ?? t.chapterDir;
        const r = addChapter(project, was + FOLDER_SUFFIX);
        project = r.project;
        ch = r.chapter.id;
        chapterFor.set(t.chapterDir, ch);
      }
      id = sceneIn(ch, t.title);
    } else if (t.noteKind !== null) {
      const taken = project.notes.some((n) => n.kind === t.noteKind && n.title === t.title);
      id = note(t.noteKind, taken ? t.title + FOLDER_SUFFIX : t.title);
    } else {
      // Um texto só: perto do original, se ele ainda existe.
      const originalId =
        (t.id && allDocs(p).some((d) => d.id === t.id) ? t.id : null) ?? byTitle.get(t.title);
      const original = originalId ? allDocs(p).find((d) => d.id === originalId) : undefined;
      const title = t.title + COPY_SUFFIX;
      if (original && original.type !== "scene") {
        id = note(original.type, title);
      } else if (original) {
        const at = findScene(project, original.id)!;
        id = sceneIn(at.chapter.id, title);
        project = moveScene(project, id, at.chapter.id, at.index + 1).project;
      } else {
        id = sceneIn(chapterId(RECOVERED_CHAPTER), title);
      }
    }
    texts.push({ id, body: t.body });
    restored.push(t.path);
  }

  const takenNames = new Set(attachments);
  const moves = contents.attachments.map((a) => {
    const dot = a.name.lastIndexOf(".");
    const name = uniqueName(
      dot > 0 ? a.name.slice(0, dot) : a.name,
      takenNames,
      dot > 0 ? a.name.slice(dot) : "",
    );
    takenNames.add(name);
    restored.push(a.path);
    return { from: a.path, to: `${ATTACHMENTS_DIR}/${name}` };
  });

  return { project, texts, moves, restored, openId: texts[0]?.id ?? null };
}

/** Os caminhos ainda estão na Lixeira (proteção contra uma entrada com caminho estranho). */
export const insideTrash = (path: string) => path.startsWith(TRASH_DIR + "/");
