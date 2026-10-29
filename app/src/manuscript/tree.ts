import { MANUSCRIPT_DIR, slugify, uniqueName } from "../vault/paths";
import type { Chapter, FsOp, Project, Scene, TreeChange } from "./types";

/*
 * Operações na estrutura do manuscrito. São funções puras: devolvem o projeto
 * novo e a lista de operações de arquivo (mover, mandar para a lixeira) que
 * precisam ser aplicadas no vault para os arquivos acompanharem.
 */

export const newId = (prefix: string) =>
  `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

export const chapterDirPath = (c: Chapter) => `${MANUSCRIPT_DIR}/${c.dir}`;
export const scenePath = (c: Chapter, s: Scene) => `${MANUSCRIPT_DIR}/${c.dir}/${s.file}`;

export function findScene(p: Project, sceneId: string) {
  for (const chapter of p.chapters) {
    const index = chapter.scenes.findIndex((s) => s.id === sceneId);
    if (index !== -1) return { chapter, scene: chapter.scenes[index]!, index };
  }
  return null;
}

const touch = (p: Project, chapters: Chapter[]): Project => ({
  ...p,
  chapters,
  updatedAt: Date.now(),
});

function chapterDirName(p: Project, title: string, except?: string) {
  const taken = new Set(p.chapters.filter((c) => c.id !== except).map((c) => c.dir));
  return uniqueName(slugify(title), taken);
}

function sceneFileName(c: Chapter, title: string, except?: string) {
  const taken = new Set(c.scenes.filter((s) => s.id !== except).map((s) => s.file));
  return uniqueName(slugify(title), taken, ".md");
}

export function createProject(title: string): Project {
  const now = Date.now();
  const project: Project = {
    format: 1,
    id: newId("prj"),
    title: title.trim() || "Meu livro",
    createdAt: now,
    updatedAt: now,
    chapters: [],
  };
  const withChapter = addChapter(project, "Capítulo 1");
  return addScene(withChapter.project, withChapter.chapter.id, "Cena 1").project;
}

export function addChapter(p: Project, title: string): TreeChange & { chapter: Chapter } {
  const chapter: Chapter = {
    id: newId("ch"),
    title,
    dir: chapterDirName(p, title),
    scenes: [],
  };
  return { project: touch(p, [...p.chapters, chapter]), ops: [], chapter };
}

export function addScene(
  p: Project,
  chapterId: string,
  title: string,
): TreeChange & { scene: Scene } {
  let scene: Scene | undefined;
  const chapters = p.chapters.map((c) => {
    if (c.id !== chapterId) return c;
    scene = { id: newId("sc"), title, file: sceneFileName(c, title) };
    return { ...c, scenes: [...c.scenes, scene] };
  });
  if (!scene) throw new Error("Capítulo não encontrado");
  return { project: touch(p, chapters), ops: [], scene };
}

export function renameChapter(p: Project, chapterId: string, title: string): TreeChange {
  const ops: FsOp[] = [];
  const chapters = p.chapters.map((c) => {
    if (c.id !== chapterId) return c;
    const dir = chapterDirName(p, title, c.id);
    if (dir !== c.dir) {
      ops.push({
        kind: "move",
        from: `${MANUSCRIPT_DIR}/${c.dir}`,
        to: `${MANUSCRIPT_DIR}/${dir}`,
      });
    }
    return { ...c, title, dir };
  });
  return { project: touch(p, chapters), ops };
}

export function renameScene(p: Project, sceneId: string, title: string): TreeChange {
  const ops: FsOp[] = [];
  const chapters = p.chapters.map((c) => {
    if (!c.scenes.some((s) => s.id === sceneId)) return c;
    return {
      ...c,
      scenes: c.scenes.map((s) => {
        if (s.id !== sceneId) return s;
        const file = sceneFileName(c, title, s.id);
        if (file !== s.file) {
          ops.push({ kind: "move", from: scenePath(c, s), to: scenePath(c, { ...s, file }) });
        }
        return { ...s, title, file };
      }),
    };
  });
  return { project: touch(p, chapters), ops };
}

export function moveChapter(p: Project, chapterId: string, toIndex: number): TreeChange {
  const from = p.chapters.findIndex((c) => c.id === chapterId);
  if (from === -1) return { project: p, ops: [] };
  const chapters = [...p.chapters];
  const [moved] = chapters.splice(from, 1);
  chapters.splice(clamp(toIndex, 0, chapters.length), 0, moved!);
  return { project: touch(p, chapters), ops: [] };
}

/** Move uma cena para outra posição, no mesmo capítulo ou em outro. */
export function moveScene(
  p: Project,
  sceneId: string,
  toChapterId: string,
  toIndex: number,
): TreeChange {
  const found = findScene(p, sceneId);
  const target = p.chapters.find((c) => c.id === toChapterId);
  if (!found || !target) return { project: p, ops: [] };

  const ops: FsOp[] = [];
  let scene = found.scene;
  if (found.chapter.id !== target.id) {
    const file = sceneFileName(target, scene.title);
    ops.push({
      kind: "move",
      from: scenePath(found.chapter, scene),
      to: scenePath(target, { ...scene, file }),
    });
    scene = { ...scene, file };
  }

  const chapters = p.chapters.map((c) => {
    let scenes = c.scenes.filter((s) => s.id !== sceneId);
    if (c.id === target.id) {
      scenes = [...scenes];
      scenes.splice(clamp(toIndex, 0, scenes.length), 0, scene);
    }
    return scenes === c.scenes ? c : { ...c, scenes };
  });
  return { project: touch(p, chapters), ops };
}

export function removeScene(p: Project, sceneId: string): TreeChange {
  const found = findScene(p, sceneId);
  if (!found) return { project: p, ops: [] };
  const chapters = p.chapters.map((c) =>
    c.id === found.chapter.id ? { ...c, scenes: c.scenes.filter((s) => s.id !== sceneId) } : c,
  );
  return {
    project: touch(p, chapters),
    ops: [{ kind: "trash", path: scenePath(found.chapter, found.scene), sceneIds: [sceneId] }],
  };
}

export function removeChapter(p: Project, chapterId: string): TreeChange {
  const chapter = p.chapters.find((c) => c.id === chapterId);
  if (!chapter) return { project: p, ops: [] };
  return {
    project: touch(
      p,
      p.chapters.filter((c) => c.id !== chapterId),
    ),
    ops: [
      {
        kind: "trash",
        path: chapterDirPath(chapter),
        sceneIds: chapter.scenes.map((s) => s.id),
      },
    ],
  };
}

export function renameProject(p: Project, title: string): Project {
  return { ...p, title, updatedAt: Date.now() };
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
