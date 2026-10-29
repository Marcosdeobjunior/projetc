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

export async function createVault(fs: VaultFs, title: string): Promise<Project> {
  const project = createProject(title);
  for (const chapter of project.chapters) {
    for (const scene of chapter.scenes) {
      await fs.writeText(scenePath(chapter, scene), sceneFile(scene, ""));
    }
  }
  await fs.writeText(
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

/**
 * Carrega o documento Yjs de uma cena. Se o .md foi alterado fora do app
 * (ou o estado Yjs não existe), o texto do .md prevalece.
 */
export async function loadSceneDoc(fs: VaultFs, project: Project, sceneId: string): Promise<Y.Doc> {
  const found = findScene(project, sceneId);
  if (!found) throw new VaultError("Cena não encontrada.");
  const [bytes, md] = await Promise.all([
    fs.readBytes(ydocPath(sceneId)),
    fs.readText(scenePath(found.chapter, found.scene)),
  ]);

  if (bytes) {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, bytes);
    if (md === null) return doc;
    const fromDoc = toMarkdown(yDocToProsemirrorJSON(doc, YDOC_FIELD) as PMNode).trim();
    if (fromDoc === splitFrontmatter(md).body.trim()) return doc;
    doc.destroy();
  }
  // TODO(sync): ao reconstruir a partir do .md o histórico Yjs recomeça; quando
  // o sync existir, aplicar a diferença como uma edição em vez de trocar o doc.
  return prosemirrorJSONToYDoc(textSchema, parseMarkdown(md ?? ""), YDOC_FIELD);
}

export async function saveScene(
  fs: VaultFs,
  project: Project,
  sceneId: string,
  doc: Y.Doc,
): Promise<{ words: number }> {
  const found = findScene(project, sceneId);
  if (!found) throw new VaultError("Cena não encontrada.");
  const json = yDocToProsemirrorJSON(doc, YDOC_FIELD) as PMNode;
  await fs.writeBytes(ydocPath(sceneId), Y.encodeStateAsUpdate(doc));
  await fs.writeText(
    scenePath(found.chapter, found.scene),
    sceneFile(found.scene, toMarkdown(json)),
  );
  return { words: countWords(toPlainText(json)) };
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
