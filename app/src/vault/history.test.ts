import { describe, expect, it } from "vitest";
import { KeyValueFs, MemoryStore } from "../platform/kvFs";
import { addScene, removeScene } from "../manuscript/tree";
import { createVault, loadProject, readSceneFile, writeSceneMarkdown } from "./vault";
import {
  compareVersion,
  listVersions,
  readBodies,
  readVersion,
  restoreProjectFiles,
  saveVersion,
  versionsToPrune,
  type VersionInfo,
} from "./history";

async function setup() {
  const fs = new KeyValueFs(new MemoryStore(), "v");
  const project = await createVault(fs, "Livro");
  const scene = project.chapters[0]!.scenes[0]!;
  await writeSceneMarkdown(fs, project, scene.id, "Era uma vez.\n");
  return { fs, project, scene };
}

describe("histórico de versões", () => {
  it("guarda versões e não repete uma automática igual à última", async () => {
    const { fs, project } = await setup();
    const first = await saveVersion(fs, project, { label: "", auto: true, now: 1000 });
    expect(first?.words).toBe(3);
    expect(await saveVersion(fs, project, { label: "", auto: true, now: 2000 })).toBeNull();
    // Uma versão com nome é guardada mesmo sem mudanças.
    expect(
      await saveVersion(fs, project, { label: "Primeiro rascunho", auto: false, now: 3000 }),
    ).not.toBeNull();
    const list = await listVersions(fs);
    expect(list.map((v) => v.label)).toEqual(["Primeiro rascunho", "Automática"]);
    const v = await readVersion(fs, list[1]!.id);
    expect(Object.values(v!.texts)).toEqual(["Era uma vez.\n"]);
  });

  it("compara uma versão com o projeto atual", async () => {
    const { fs, project, scene } = await setup();
    const info = await saveVersion(fs, project, { label: "a", auto: false });
    const added = addScene(project, project.chapters[0]!.id, "Nova");
    let p = added.project;
    p = removeScene(p, scene.id).project;
    const v = (await readVersion(fs, info!.id))!;
    const rows = compareVersion(v, p, { [added.scene.id]: "Oi." });
    expect(rows.map((r) => [r.title, r.status])).toEqual([
      [scene.title, "removed"],
      ["Nova", "added"],
    ]);
  });

  it("restaura o projeto inteiro, mandando o atual para a lixeira", async () => {
    const { fs, project, scene } = await setup();
    const info = await saveVersion(fs, project, { label: "a", auto: false });
    await writeSceneMarkdown(fs, project, scene.id, "Texto novo.\n");
    const restored = await restoreProjectFiles(fs, (await readVersion(fs, info!.id))!);
    expect(await readSceneFile(fs, restored, scene.id)).toContain("Era uma vez.");
    expect((await loadProject(fs)).chapters).toEqual(project.chapters);
    expect((await readBodies(fs, restored))[scene.id]).toBe("Era uma vez.\n");
    expect(await fs.list(".inkflow/lixeira")).toEqual([]);
    expect(await fs.exists(".inkflow/lixeira")).toBe(true);
  });

  it("das versões automáticas antigas fica uma por dia", () => {
    const day = 24 * 3600 * 1000;
    const v = (i: number, at: number, auto = true): VersionInfo => ({
      id: `v${i}`,
      createdAt: at,
      label: "",
      auto,
      words: 0,
      hash: "",
    });
    const recent = Array.from({ length: 20 }, (_, i) => v(i, 100 * day - i * 1000));
    const old = [
      v(100, 10 * day + 5),
      v(101, 10 * day + 1),
      v(102, 9 * day),
      v(103, 9 * day - 5, false),
    ];
    expect(versionsToPrune([...recent, ...old])).toEqual(["v101"]);
  });
});
