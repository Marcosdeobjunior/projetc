import { strToU8 } from "fflate";
import type { Platform, VaultFs } from "../platform/types";
import type { Project } from "../manuscript/types";
import { buildBook, fileName, type ExportFormat, type ExportOptions } from "./book";
import { docx, prepareImage } from "./docx";
import { epub } from "./epub";
import { printPdf } from "./pdf";
import { textExport } from "./text";

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
  if (opts.format === "pdf") {
    await printPdf(book, opts);
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
    data = epub(book, opts, project.id);
  } else {
    data = strToU8(textExport(book, opts, opts.format === "md"));
  }
  return platform.saveFile(fileName(book.title, opts.format), data, FILTERS[opts.format]);
}
