import { describe, expect, it } from "vitest";
import { KeyValueFs, MemoryStore } from "../platform/kvFs";
import {
  addChapter,
  addNote,
  addScene,
  removeChapter,
  removeNote,
  removeScene,
} from "../manuscript/tree";
import type { Project, TreeChange } from "../manuscript/types";
import { applyOps, createVault, readSceneFile, writeSceneMarkdown } from "./vault";
import { deleteFromTrash, emptyTrash, listTrash, moveToTrash, restorePlan } from "./trash";
import { ydocPath } from "./paths";

async function setup() {
  const fs = new KeyValueFs(new MemoryStore(), "v");
  let p = await createVault(fs, "Livro");
  const ch2 = addChapter(p, "Parte dois");
  const s2 = addScene(ch2.project, ch2.chapter.id, "Chegada");
  const n = addNote(s2.project, "personagens", "Helena");
  p = n.project;
  for (const id of [p.chapters[0]!.scenes[0]!.id, s2.scene.id, n.note.id]) {
    await writeSceneMarkdown(fs, p, id, `Texto de ${id}.\n`);
    await fs.writeBytes(ydocPath(id), new Uint8Array([1, 2, 3]));
  }
  return { fs, p, scene: s2.scene, chapter: ch2.chapter, note: n.note };
}

async function apply(fs: KeyValueFs, change: TreeChange): Promise<Project> {
  await applyOps(fs, change.ops);
  return change.project;
}

describe("lixeira", () => {
  it("exclui e restaura uma cena no mesmo lugar, com o estado do editor", async () => {
    const { fs, p, scene } = await setup();
    const after = await apply(fs, removeScene(p, scene.id));
    const [entry] = await listTrash(fs);
    expect(entry!.title).toBe("Chegada");
    expect(await fs.exists(ydocPath(scene.id))).toBe(false);

    const plan = restorePlan(after, entry!)!;
    await applyOps(fs, plan.ops);
    expect(plan.openId).toBe(scene.id);
    expect(plan.project.chapters[1]!.scenes.map((s) => s.title)).toEqual(["Chegada"]);
    expect(await readSceneFile(fs, plan.project, scene.id)).toContain(`Texto de ${scene.id}.`);
    expect(await fs.exists(ydocPath(scene.id))).toBe(true);
  });

  it("uma cena cujo capítulo sumiu volta num capítulo com o mesmo nome", async () => {
    const { fs, p, scene, chapter } = await setup();
    let now = await apply(fs, removeScene(p, scene.id));
    const [sceneEntry] = await listTrash(fs);
    now = await apply(fs, removeChapter(now, chapter.id));
    const plan = restorePlan(now, sceneEntry!)!;
    await applyOps(fs, plan.ops);
    expect(plan.project.chapters.map((c) => c.title)).toEqual(["Capítulo 1", "Parte dois"]);
    expect(await readSceneFile(fs, plan.project, scene.id)).toContain("Texto de");
  });

  it("restaura capítulos e notas, e apaga de vez", async () => {
    const { fs, p, chapter, note } = await setup();
    let now = await apply(fs, removeChapter(p, chapter.id));
    now = await apply(fs, removeNote(now, note.id));
    const [noteEntry, chapterEntry] = await listTrash(fs);
    expect([noteEntry!.item.kind, chapterEntry!.item.kind]).toEqual(["note", "chapter"]);

    const plan = restorePlan(now, chapterEntry!)!;
    await applyOps(fs, plan.ops);
    expect(plan.project.chapters[1]!.title).toBe("Parte dois");
    expect(await readSceneFile(fs, plan.project, chapter.scenes[0]?.id ?? plan.openId!)).toContain(
      "Texto de",
    );

    await deleteFromTrash(fs, noteEntry!.id);
    expect(await fs.exists(noteEntry!.path)).toBe(false);
    expect((await listTrash(fs)).map((e) => e.id)).toEqual([chapterEntry!.id]);
    await emptyTrash(fs);
    expect(await listTrash(fs)).toEqual([]);
  });

  it("anexo volta com outro nome se já existe um igual", async () => {
    const fs = new KeyValueFs(new MemoryStore(), "v");
    const p = await createVault(fs, "Livro");
    await fs.writeBytes("anexos/mapa.png", new Uint8Array([1]));
    const entry = (await moveToTrash(fs, "anexos/mapa.png", {
      kind: "attachment",
      name: "mapa.png",
    }))!;
    await fs.writeBytes("anexos/mapa.png", new Uint8Array([2]));
    const plan = restorePlan(p, entry, await fs.list("anexos"))!;
    await applyOps(fs, plan.ops);
    expect(await fs.list("anexos")).toEqual(["mapa-2.png", "mapa.png"]);
  });
});
