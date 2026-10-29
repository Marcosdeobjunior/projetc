import * as Y from "yjs";
import { prosemirrorJSONToYDoc, yDocToProsemirrorJSON } from "@tiptap/y-tiptap";
import type { VaultFs } from "../platform/types";
import type { FsOp, Project, Scene } from "../manuscript/types";
import { chapterDirPath, createProject, findScene, scenePath } from "../manuscript/tree";
import { parseMarkdown, splitFrontmatter } from "../markdown/parse";
import { toMarkdown, toPlainText } from "../markdown/serialize";
import type { PMNode } from "../markdown/types";
import { countWords } from "../manuscript/wordCount";
import { textSchema, YDOC_FIELD } from "../editor/extensions";
import { PROJECT_FILE, TRASH_DIR, ydocPath } from "./paths";

/*
 * Leitura e gravação de um vault. Cada cena é guardada em dois formatos:
 *  - manuscrito/<capítulo>/<cena>.md  → texto legível, a fonte da verdade para o usuário
 *  - .inkflow/ydoc/<id>.yjs           → estado do editor, usado para mesclar edições no sync
 */

export class VaultError extends Error {}

/**
 * Cria um projeto na raiz do vault. A pasta pode já ter outros arquivos:
 * nada que já existe é sobrescrito.
 */
export async function createVault(fs: VaultFs, title: string): Promise<Project> {
  if (await fs.exists(PROJECT_FILE)) throw new VaultError("Essa pasta já é um projeto do InkFlow.");
  const project = createProject(title);
  const writeNew = async (path: string, text: string) => {
    if (!(await fs.exists(path))) await fs.writeText(path, text);
  };
  for (const chapter of project.chapters) {
    for (const scene of chapter.scenes) {
      await writeNew(scenePath(chapter, scene), sceneFile(scene, ""));
    }
  }
  await writeNew(
    "LEIA-ME.md",
    `# ${project.title}\n\nEste é um projeto do InkFlow.\n\n` +
      "- `manuscrito/` guarda os capítulos e as cenas em Markdown, legíveis em qualquer editor de texto.\n" +
      "- `.inkflow/` guarda a ordem dos capítulos, o histórico e os dados do app. Não apague essa pasta.\n",
  );
  await saveProject(fs, project);
  return project;
}

export async function loadProject(fs: VaultFs): Promise<Project> {
  const raw = await fs.readText(PROJECT_FILE);
  if (raw === null) throw new VaultError("Essa pasta não é um projeto do InkFlow.");
  let data: Project;
  try {
    data = JSON.parse(raw) as Project;
  } catch {
    throw new VaultError("O arquivo .inkflow/project.json está corrompido.");
  }
  if (data.format !== 1) {
    throw new VaultError("Este projeto foi criado por uma versão mais nova do InkFlow.");
  }
  return data;
}

export async function saveProject(fs: VaultFs, project: Project): Promise<void> {
  await fs.writeText(PROJECT_FILE, JSON.stringify(project, null, 2) + "\n");
}

/** Aplica no disco as operações geradas por uma mudança na estrutura. */
export async function applyOps(fs: VaultFs, ops: FsOp[]): Promise<void> {
  for (const op of ops) {
    if (op.kind === "move") {
      if (await fs.exists(op.from)) await fs.rename(op.from, op.to);
    } else {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const name = op.path.split("/").pop()!;
      if (await fs.exists(op.path)) await fs.rename(op.path, `${TRASH_DIR}/${stamp}-${name}`);
      for (const id of op.sceneIds) {
        if (await fs.exists(ydocPath(id))) {
          await fs.rename(ydocPath(id), `${TRASH_DIR}/${stamp}-${id}.yjs`);
        }
      }
    }
  }
}

export async function ensureChapterDirs(fs: VaultFs, project: Project) {
  for (const c of project.chapters) {
    if (c.scenes.length === 0 && !(await fs.exists(chapterDirPath(c)))) {
      await fs.writeText(`${chapterDirPath(c)}/.keep`, "");
    }
  }
}

function sceneFile(scene: Scene, markdown: string) {
  return `---\nid: ${scene.id}\ntitle: ${JSON.stringify(scene.title)}\n---\n\n${markdown}`;
}

/** Atualiza o título no cabeçalho do .md depois de renomear a cena. */
export async function rewriteSceneHeader(fs: VaultFs, project: Project, sceneId: string) {
  const found = findScene(project, sceneId);
  if (!found) return;
  const path = scenePath(found.chapter, found.scene);
  const md = await fs.readText(path);
  if (md === null) return;
  await fs.writeText(path, sceneFile(found.scene, splitFrontmatter(md).body.replace(/^\n/, "")));
}

/** Grava o texto de uma cena a partir de Markdown (usado no projeto de exemplo). */
export async function writeSceneMarkdown(
  fs: VaultFs,
  project: Project,
  sceneId: string,
  markdown: string,
) {
  const found = findScene(project, sceneId);
  if (!found) return;
  await fs.writeText(scenePath(found.chapter, found.scene), sceneFile(found.scene, markdown));
}

/** O .md da cena mudou no disco desde a última vez que o app leu ou gravou. */
export class ExternalChangeError extends Error {
  constructor(readonly diskText: string) {
    super("A cena foi alterada fora do InkFlow.");
  }
}

/**
 * Compara só o texto, sem o cabeçalho. O cabeçalho muda quando a cena é
 * renomeada e isso não é uma edição de texto.
 */
export function sameText(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return splitFrontmatter(a).body.trim() === splitFrontmatter(b).body.trim();
}

export async function readSceneFile(
  fs: VaultFs,
  project: Project,
  sceneId: string,
): Promise<string | null> {
  const found = findScene(project, sceneId);
  return found ? fs.readText(scenePath(found.chapter, found.scene)) : null;
}

export interface LoadedScene {
  doc: Y.Doc;
  /** Conteúdo do .md quando a cena foi carregada (null se não existia). */
  diskText: string | null;
  /**
   * Texto do .md quando ele foi alterado fora do app. O editor aplica esse
   * texto como uma edição, para o histórico Yjs (e o futuro sync) continuar.
   */
  external: PMNode | null;
}

export async function loadSceneDoc(
  fs: VaultFs,
  project: Project,
  sceneId: string,
): Promise<LoadedScene> {
  const found = findScene(project, sceneId);
  if (!found) throw new VaultError("Cena não encontrada.");
  const [bytes, md] = await Promise.all([
    fs.readBytes(ydocPath(sceneId)),
    fs.readText(scenePath(found.chapter, found.scene)),
  ]);

  if (bytes) {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, bytes);
    const fromDoc = toMarkdown(yDocToProsemirrorJSON(doc, YDOC_FIELD) as PMNode);
    const external = md !== null && !sameText(fromDoc, md) ? parseMarkdown(md) : null;
    return { doc, diskText: md, external };
  }
  return {
    doc: prosemirrorJSONToYDoc(textSchema, parseMarkdown(md ?? ""), YDOC_FIELD),
    diskText: md,
    external: null,
  };
}

/**
 * Grava a cena. `expected` é o conteúdo que o app sabe que está no disco; se
 * o .md tiver outro texto, alguém mudou o arquivo por fora e nada é gravado
 * (ExternalChangeError), para não apagar essa mudança.
 */
export async function saveScene(
  fs: VaultFs,
  project: Project,
  sceneId: string,
  doc: Y.Doc,
  expected: string | null,
): Promise<{ words: number; written: string }> {
  const found = findScene(project, sceneId);
  if (!found) throw new VaultError("Cena não encontrada.");
  const path = scenePath(found.chapter, found.scene);
  const current = await fs.readText(path);
  // Arquivo apagado por fora não é conflito: nenhum texto se perde ao recriá-lo.
  if (current !== null && !sameText(current, expected)) throw new ExternalChangeError(current);

  const json = yDocToProsemirrorJSON(doc, YDOC_FIELD) as PMNode;
  const written = sceneFile(found.scene, toMarkdown(json));
  await fs.writeBytes(ydocPath(sceneId), Y.encodeStateAsUpdate(doc));
  await fs.writeText(path, written);
  return { words: countWords(toPlainText(json)), written };
}

/** Conta as palavras de todas as cenas a partir dos arquivos .md. */
export async function countProjectWords(
  fs: VaultFs,
  project: Project,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  await Promise.all(
    project.chapters.flatMap((c) =>
      c.scenes.map(async (s) => {
        const md = await fs.readText(scenePath(c, s));
        counts[s.id] = md ? countWords(toPlainText(parseMarkdown(md))) : 0;
      }),
    ),
  );
  return counts;
}
