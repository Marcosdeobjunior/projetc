import { describe, expect, it } from "vitest";
import {
  addChapter,
  addNote,
  addScene,
  createProject,
  moveScene,
  removeNote,
  removeScene,
  renameChapter,
  renameScene,
} from "../manuscript/tree";
import type { Project } from "../manuscript/types";
import { mergeProjects } from "./mergeProject";

const titles = (p: Project) => p.chapters.map((c) => [c.title, c.scenes.map((s) => s.title)]);

function base() {
  let p = createProject("Livro");
  const ch1 = p.chapters[0]!;
  p = addScene(p, ch1.id, "Cena 2").project;
  const ch2 = addChapter(p, "Capítulo 2");
  p = addScene(ch2.project, ch2.chapter.id, "Cena 3").project;
  p = addNote(p, "personagens", "Helena").project;
  return p;
}

describe("juntar project.json", () => {
  it("junta criações e renomeações feitas nos dois computadores", () => {
    const b = base();
    const [c1, c2] = b.chapters;
    let local = addScene(b, c1!.id, "Nova aqui").project;
    local = renameChapter(local, c2!.id, "Parte dois").project;
    let remote = addChapter(b, "Capítulo 3").project;
    remote = renameScene(remote, c1!.scenes[0]!.id, "Abertura").project;
    remote = addNote(remote, "lugares", "Vila").project;

    const m = mergeProjects(b, local, remote);
    expect(titles(m)).toEqual([
      ["Capítulo 1", ["Abertura", "Cena 2", "Nova aqui"]],
      ["Parte dois", ["Cena 3"]],
      ["Capítulo 3", []],
    ]);
    expect(m.notes.map((n) => n.title)).toEqual(["Helena", "Vila"]);
  });

  it("o que um lado excluiu sai, e uma mudança de lugar do outro lado é mantida", () => {
    const b = base();
    const [c1, c2] = b.chapters;
    const local = removeScene(b, c1!.scenes[1]!.id).project;
    let remote = moveScene(b, c2!.scenes[0]!.id, c1!.id, 0).project;
    remote = removeNote(remote, b.notes[0]!.id).project;

    const m = mergeProjects(b, local, remote);
    expect(titles(m)).toEqual([
      ["Capítulo 1", ["Cena 3", "Cena 1"]],
      ["Capítulo 2", []],
    ]);
    expect(m.notes).toEqual([]);
  });

  it("se os dois renomearam a mesma cena, fica o nome local", () => {
    const b = base();
    const id = b.chapters[0]!.scenes[0]!.id;
    const local = renameScene(b, id, "Local").project;
    const remote = renameScene(b, id, "Remoto").project;
    expect(mergeProjects(b, local, remote).chapters[0]!.scenes[0]!.title).toBe("Local");
  });

  it("sem base (primeira sincronização), junta tudo sem excluir nada", () => {
    const b = base();
    const local = addNote(b, "ideias", "Ideia A").project;
    const remote = addNote(b, "ideias", "Ideia B").project;
    const m = mergeProjects(null, local, remote);
    expect(m.notes.map((n) => n.title).sort()).toEqual(["Helena", "Ideia A", "Ideia B"]);
    expect(titles(m)).toEqual(titles(b));
  });
});
