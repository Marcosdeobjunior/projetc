import { describe, expect, it } from "vitest";
import { addNote, createProject } from "../manuscript/tree";
import { findAll, fold, searchProject, snippet } from "./search";

describe("busca", () => {
  it("ignora acentos e maiúsculas sem mudar as posições", () => {
    expect(fold("João AÇÃO")).toBe("joao acao");
    expect(fold("João AÇÃO")).toHaveLength("João AÇÃO".length);
    const text = "Disse João. Depois, joão saiu.";
    expect(findAll(text, "JOAO").map((h) => text.slice(h.from, h.to))).toEqual(["João", "joão"]);
  });

  it("modo exato e palavra inteira", () => {
    const text = "O mar, amar, Mar.";
    expect(findAll(text, "mar")).toHaveLength(3);
    expect(findAll(text, "mar", { wholeWord: true })).toHaveLength(2);
    expect(findAll(text, "Mar", { exact: true })).toHaveLength(1);
    expect(findAll(text, "   ")).toEqual([]);
  });

  it("monta um trecho em volta do resultado", () => {
    const text = "palavra ".repeat(20) + "ALVO" + " depois".repeat(20);
    const s = snippet(text, findAll(text, "alvo")[0]!);
    expect(s.match).toBe("ALVO");
    expect(s.before.startsWith("…")).toBe(true);
    expect(s.after.endsWith("…")).toBe(true);
    expect(s.before.length).toBeLessThan(60);
  });

  it("procura nos textos e nos títulos do projeto", () => {
    let p = createProject("Livro");
    const scene = p.chapters[0]!.scenes[0]!;
    const n = addNote(p, "personagens", "Helena");
    p = n.project;
    const r = searchProject(
      p,
      { [scene.id]: "Helena chegou. Helena saiu.", [n.note.id]: "" },
      "helena",
    );
    expect(r.map((d) => [d.doc.id, d.hits.length, d.inTitle])).toEqual([
      [scene.id, 2, false],
      [n.note.id, 0, true],
    ]);
  });
});
