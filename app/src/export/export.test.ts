import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { KeyValueFs, MemoryStore } from "../platform/kvFs";
import { addChapter, addScene } from "../manuscript/tree";
import { createVault, saveProject, writeSceneMarkdown } from "../vault/vault";
import { buildBook, clean, unlink, type ExportOptions } from "./book";
import { epub } from "./epub";
import { textExport } from "./text";
import { bookHtml } from "./pdf";

const options = (o: Partial<ExportOptions> = {}): ExportOptions => ({
  format: "epub",
  title: "",
  author: "Ana Souza",
  chapterIds: [],
  style: "book",
  titlePage: true,
  toc: true,
  sceneTitles: false,
  chapterNumbers: true,
  pageSize: "14x21",
  images: true,
  ...o,
});

async function sample() {
  const fs = new KeyValueFs(new MemoryStore(), "v");
  let p = await createVault(fs, "A Casa das Marés");
  const c1 = p.chapters[0]!;
  const s2 = addScene(p, c1.id, "Na padaria");
  const c2 = addChapter(s2.project, "A cidade");
  const s3 = addScene(c2.project, c2.chapter.id, "Chegada");
  p = s3.project;
  await saveProject(fs, p);
  await writeSceneMarkdown(
    fs,
    p,
    c1.scenes[0]!.id,
    "O vento soprava. [[Lucas|Ele]] saiu.\n\n![mapa](anexos/mapa.png)\n\n![som](anexos/tema.mp3)\n",
  );
  await writeSceneMarkdown(fs, p, s2.scene.id, "Na esquina, ==Helena== esperava.\n");
  await writeSceneMarkdown(fs, p, s3.scene.id, "A estação de [[Vila Serena]].\n");
  await fs.writeBytes("anexos/mapa.png", new Uint8Array([137, 80, 78, 71]));
  return { fs, p, chapters: [c1.id, c2.chapter.id] };
}

describe("exportação", () => {
  it("tira os colchetes dos links e o marca-texto", () => {
    expect(unlink("ver [[Helena]] e [[Vila Serena|a vila]]")).toBe("ver Helena e a vila");
    expect(
      clean({ type: "text", text: "x", marks: [{ type: "highlight" }, { type: "italic" }] }, true),
    ).toEqual({ type: "text", text: "x", marks: [{ type: "italic" }] });
  });

  it("monta o livro só com os capítulos escolhidos e só com imagens", async () => {
    const { fs, p, chapters } = await sample();
    const book = await buildBook(fs, p, options({ chapterIds: [chapters[0]!] }));
    expect(book.title).toBe("A Casa das Marés");
    expect(book.chapters.map((c) => c.title)).toEqual(["Capítulo 1"]);
    expect(book.chapters[0]!.scenes.map((s) => s.blocks.map((b) => b.type))).toEqual([
      ["paragraph", "attachment"],
      ["paragraph"],
    ]);
    expect([...book.images.keys()]).toEqual(["anexos/mapa.png"]);
  });

  it("gera um EPUB válido", async () => {
    const { fs, p, chapters } = await sample();
    const opts = options({ chapterIds: chapters });
    const zip = epub(await buildBook(fs, p, opts), opts, p.id);
    // "mimetype" tem que ser o primeiro arquivo e sem compressão.
    expect(strFromU8(zip.subarray(30, 38))).toBe("mimetype");
    expect(zip[8]).toBe(0);
    const files = unzipSync(zip);
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        "META-INF/container.xml",
        "OEBPS/content.opf",
        "OEBPS/nav.xhtml",
        "OEBPS/titulo.xhtml",
        "OEBPS/cap1.xhtml",
        "OEBPS/cap2.xhtml",
        "OEBPS/images/img1.png",
      ]),
    );
    const cap1 = strFromU8(files["OEBPS/cap1.xhtml"]!);
    expect(cap1).toContain('<p class="first">O vento soprava. Ele saiu.</p>');
    expect(cap1).toContain('<p class="sep">* * *</p>');
    expect(cap1).toContain('src="images/img1.png"');
    const opf = strFromU8(files["OEBPS/content.opf"]!);
    expect(opf).toContain("<dc:creator>Ana Souza</dc:creator>");
  });

  it("gera Markdown, texto e o HTML de impressão", async () => {
    const { fs, p, chapters } = await sample();
    const opts = options({ chapterIds: chapters, sceneTitles: true });
    const book = await buildBook(fs, p, opts);
    const md = textExport(book, opts, true);
    expect(md).toContain("# A Casa das Marés");
    expect(md).toContain("## Capítulo 1: Capítulo 1");
    expect(md).toContain("### Na padaria");
    expect(md).toContain("Na esquina, Helena esperava.");
    const txt = textExport(book, opts, false);
    expect(txt).not.toContain("![");
    expect(txt).toContain("A estação de Vila Serena.");
    const html = bookHtml(book, { ...opts, style: "manuscript" }, () => "blob:x");
    expect(html).toContain("Souza / A CASA DAS MARÉS / ");
    expect(html).toContain('<h3 class="scene">Na padaria</h3>');
  });
});
