import { describe, expect, it } from "vitest";
import {
  addChapter,
  addScene,
  createProject,
  moveChapter,
  moveScene,
  removeChapter,
  removeScene,
  renameChapter,
  renameScene,
  addNote,
  findDoc,
  removeNote,
  renameNote,
} from "./tree";
import { countWords } from "./wordCount";
import { folderName, slugify } from "../vault/paths";

const titles = (p: ReturnType<typeof createProject>) =>
  p.chapters.map((c) => [c.title, c.scenes.map((s) => s.title)]);

describe("estrutura do manuscrito", () => {
  it("projeto novo começa com um capítulo e uma cena", () => {
    const p = createProject("A Casa das Marés");
    expect(titles(p)).toEqual([["Capítulo 1", ["Cena 1"]]]);
    expect(p.chapters[0]!.dir).toBe("capitulo-1");
    expect(p.chapters[0]!.scenes[0]!.file).toBe("cena-1.md");
  });

  it("nomes de arquivo repetidos ganham sufixo", () => {
    let p = createProject("x");
    const ch = p.chapters[0]!.id;
    p = addScene(p, ch, "Cena 1").project;
    p = addChapter(p, "Capítulo 1").project;
    expect(p.chapters[0]!.scenes.map((s) => s.file)).toEqual(["cena-1.md", "cena-1-2.md"]);
    expect(p.chapters.map((c) => c.dir)).toEqual(["capitulo-1", "capitulo-1-2"]);
  });

  it("renomear move o arquivo junto", () => {
    const p = createProject("x");
    const ch = p.chapters[0]!;
    const r1 = renameScene(p, ch.scenes[0]!.id, "A carta");
    expect(r1.ops).toEqual([
      {
        kind: "move",
        from: "manuscrito/capitulo-1/cena-1.md",
        to: "manuscrito/capitulo-1/a-carta.md",
      },
    ]);
    const r2 = renameChapter(r1.project, ch.id, "O começo");
    expect(r2.ops).toEqual([
      { kind: "move", from: "manuscrito/capitulo-1", to: "manuscrito/o-comeco" },
    ]);
  });

  it("move cenas dentro do capítulo e entre capítulos", () => {
    let p = createProject("x");
    const ch1 = p.chapters[0]!.id;
    p = addScene(p, ch1, "Cena 2").project;
    const ch2 = addChapter(p, "Capítulo 2");
    p = ch2.project;
    const [s1, s2] = p.chapters[0]!.scenes;

    p = moveScene(p, s2!.id, ch1, 0).project;
    expect(titles(p)[0]).toEqual(["Capítulo 1", ["Cena 2", "Cena 1"]]);

    const r = moveScene(p, s1!.id, ch2.chapter.id, 0);
    expect(titles(r.project)).toEqual([
      ["Capítulo 1", ["Cena 2"]],
      ["Capítulo 2", ["Cena 1"]],
    ]);
    expect(r.ops).toEqual([
      {
        kind: "move",
        from: "manuscrito/capitulo-1/cena-1.md",
        to: "manuscrito/capitulo-2/cena-1.md",
      },
    ]);
  });

  it("reordena capítulos", () => {
    let p = createProject("x");
    p = addChapter(p, "B").project;
    p = addChapter(p, "C").project;
    p = moveChapter(p, p.chapters[2]!.id, 0).project;
    expect(p.chapters.map((c) => c.title)).toEqual(["C", "Capítulo 1", "B"]);
  });

  it("excluir manda os arquivos para a lixeira", () => {
    const p = createProject("x");
    const ch = p.chapters[0]!;
    const sc = ch.scenes[0]!;
    expect(removeScene(p, sc.id).ops).toEqual([
      {
        kind: "trash",
        path: "manuscrito/capitulo-1/cena-1.md",
        sceneIds: [sc.id],
        item: { kind: "scene", scene: sc, chapter: { id: ch.id, title: ch.title }, index: 0 },
      },
    ]);
    const r = removeChapter(p, ch.id);
    expect(r.project.chapters).toEqual([]);
    expect(r.ops).toEqual([
      {
        kind: "trash",
        path: "manuscrito/capitulo-1",
        sceneIds: [sc.id],
        item: { kind: "chapter", chapter: ch, index: 0 },
      },
    ]);
  });
});

describe("slugify", () => {
  it("gera nomes seguros", () => {
    expect(slugify("O Começo: Parte 1/2?")).toBe("o-comeco-parte-1-2");
    expect(slugify("???")).toBe("sem-titulo");
  });

  it("nome da pasta do projeto continua legível", () => {
    expect(folderName("A Casa das Marés")).toBe("A Casa das Marés");
    expect(folderName('Parte 1: "O fim"?')).toBe("Parte 1 O fim");
    expect(folderName("con")).toBe("Meu livro");
    expect(folderName("...")).toBe("Meu livro");
  });
});

describe("countWords", () => {
  it("conta como um escritor espera", () => {
    expect(countWords("— Você vai mesmo? — perguntou.")).toBe(4);
    expect(countWords("guarda-chuva e copo d'água")).toBe(4);
    expect(countWords("   ")).toBe(0);
  });
});

describe("notas", () => {
  it("cria, renomeia e exclui notas com os arquivos certos", () => {
    let p = createProject("x");
    const r = addNote(p, "personagens", "Helena");
    p = r.project;
    expect(findDoc(p, r.note.id)).toEqual({
      id: r.note.id,
      title: "Helena",
      path: "notas/personagens/helena.md",
      type: "personagens",
    });
    const renamed = renameNote(p, r.note.id, "Helena Prado");
    expect(renamed.ops).toEqual([
      {
        kind: "move",
        from: "notas/personagens/helena.md",
        to: "notas/personagens/helena-prado.md",
      },
    ]);
    expect(removeNote(renamed.project, r.note.id).ops).toEqual([
      expect.objectContaining({
        kind: "trash",
        path: "notas/personagens/helena-prado.md",
        sceneIds: [r.note.id],
        item: { kind: "note", note: expect.objectContaining({ id: r.note.id }) },
      }),
    ]);
  });
});
