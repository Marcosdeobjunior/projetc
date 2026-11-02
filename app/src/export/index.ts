import { strToU8 } from "fflate";
import type { Platform, VaultFs } from "../platform/types";
import type { Project } from "../manuscript/types";
import { buildBook, fileName, type ExportFormat, type ExportOptions } from "./book";
import { docx, prepareImage } from "./docx";
import { epub } from "./epub";
import { printPdf } from "./pdf";
import { textExport } from "./text";
import { DESIGN_FILE, loadDesign, TRIM } from "../book/design";
import { renderPart, toPng } from "../book/cover";

export type { ExportFormat, ExportOptions } from "./book";

const FILTERS: Record<Exclude<ExportFormat, "pdf">, { name: string; extensions: string[] }> = {
  docx: { name: "Documento do Word", extensions: ["docx"] },
  epub: { name: "Livro digital (EPUB)", extensions: ["epub"] },
  md: { name: "Markdown", extensions: ["md"] },
  txt: { name: "Texto", extensions: ["txt"] },
};

/** Exporta o livro. Devolve false se a pessoa cancelou a escolha do arquivo. */
export async function exportBook(
  platform: Platform,
  fs: VaultFs,
  project: Project,
  opts: ExportOptions,
): Promise<boolean> {
  const book = await buildBook(fs, project, opts);
  // Projeto gráfico (aba Diagramação), se já foi feito.
  const design = (await fs.exists(DESIGN_FILE)) ? await loadDesign(fs) : null;
  if (opts.format === "pdf") {
    await printPdf(book, opts, design?.layout);
    return true;
  }
  let data: Uint8Array;
  if (opts.format === "docx") {
    const images = new Map(
      await Promise.all(
        [...book.images].map(async ([src, img]) => [src, await prepareImage(img)] as const),
      ),
    );
    data = await docx(book, opts, images);
  } else if (opts.format === "epub") {
    let cover: Uint8Array | undefined;
    if (design) {
      const trim = TRIM[design.layout.trim];
      // 1600 px de largura, o tamanho que as lojas de e-book pedem.
      const canvas = await renderPart("front", design, book, (1600 / trim.w) * 25.4);
      cover = await toPng(canvas);
    }
    data = epub(book, opts, project.id, cover);
  } else {
    data = strToU8(textExport(book, opts, opts.format === "md"));
  }
  return platform.saveFile(fileName(book.title, opts.format), data, FILTERS[opts.format]);
}
