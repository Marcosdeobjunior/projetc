import { describe, expect, it } from "vitest";
import { addChapter, addNote, addScene, createProject } from "../manuscript/tree";
import { buildGraph, findMentions, findWikiLinks } from "./links";

function sample() {
  let p = createProject("x");
  const scene = p.chapters[0]!.scenes[0]!;
  const helena = addNote(p, "personagens", "Helena");
  p = helena.project;
  const vila = addNote(p, "lugares", "Vila Serena");
  p = vila.project;
  const ch2 = addChapter(p, "Capítulo 2");
  const s2 = addScene(ch2.project, ch2.chapter.id, "Chegada");
  p = s2.project;
  return { p, scene, helena: helena.note, vila: vila.note, chegada: s2.scene };
}

describe("links", () => {
  it("encontra [[links]], com e sem texto alternativo", () => {
    expect(findWikiLinks("ver [[Helena]] e [[Vila Serena|a vila]].").map((l) => l.target)).toEqual([
      "Helena",
      "Vila Serena",
    ]);
  });

  it("encontra menções só de palavras inteiras e com a mesma maiúscula", () => {
    const { p, helena } = sample();
    const found = findMentions(p, "Helena chegou. Helenas não. helena não. (Helena) sim.");
    expect(found.map((m) => m.noteId)).toEqual([helena.id, helena.id]);
    expect(found[1]!.from).toBe("Helena chegou. Helenas não. helena não. (".length);
  });

  it("monta o grafo com links e menções, sem repetir ligações", () => {
    const { p, scene, helena, vila, chegada } = sample();
    const g = buildGraph(p, {
      [scene.id]: "Helena esperava. Depois, [[helena]] saiu.",
      [chegada.id]: "A estação de [[Vila Serena]] cheirava a chuva.",
      [helena.id]: "Nasceu em Vila Serena.",
    });
    const pairs = g.edges.map((e) => [e.source, e.target, e.kind]);
    expect(pairs).toEqual(
      expect.arrayContaining([
        [scene.id, helena.id, "link"],
        [chegada.id, vila.id, "link"],
        [helena.id, vila.id, "mention"],
      ]),
    );
    expect(g.edges).toHaveLength(3);
    expect(g.nodes.find((n) => n.id === helena.id)!.degree).toBe(2);
  });

  it("sem menções automáticas, só os links escritos contam", () => {
    const { p, helena, vila } = sample();
    const g = buildGraph(p, { [helena.id]: "Nasceu em Vila Serena." }, { mentions: false });
    expect(g.edges).toEqual([]);
    expect(vila.title).toBe("Vila Serena");
  });
});

describe("sugestões de [[", () => {
  it("mostra notas antes de cenas, ignora acentos e oferece criar", async () => {
    const { suggestLinks } = await import("./context");
    const { p } = sample();
    const hel = suggestLinks(p, "hel");
    expect(hel[0]!.title).toBe("Helena");
    // Depois dos resultados, as opções para criar uma nota com o que foi digitado.
    expect(hel.slice(1).every((x) => x.create)).toBe(true);
    expect(suggestLinks(p, "helena").map((x) => x.title)).toEqual(["Helena"]);
    expect(suggestLinks(p, "vila serena")[0]!.hint).toBe("Lugar");
    expect(suggestLinks(p, "cheg")[0]!.hint).toBe("Cena · Capítulo 2");
    const created = suggestLinks(p, "Estação");
    expect(created.map((s) => s.create)).toEqual(["personagens", "lugares", "ideias"]);
  });
});

describe("renomear links", () => {
  it("troca [[Antigo]] e [[antigo|texto]], mantendo o texto alternativo", async () => {
    const { renameLinksInText, linkEdits } = await import("./links");
    const r = renameLinksInText(
      "Ver [[Helena]], [[helena|a amiga]] e [[Helenas]]. Helena sem link fica.",
      "Helena",
      "Helena Prado $1",
    );
    expect(r.text).toBe(
      "Ver [[Helena Prado $1]], [[Helena Prado $1|a amiga]] e [[Helenas]]. Helena sem link fica.",
    );
    expect(r.count).toBe(2);
    const text = "a [[ Helena ]] b [[Helena]]";
    expect(linkEdits(text, "helena").map((e) => text.slice(e.from, e.to))).toEqual([
      "Helena",
      "Helena",
    ]);
  });
});
