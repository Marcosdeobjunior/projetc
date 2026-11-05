import type { VaultFs } from "../platform/types";
import { loadProject } from "../vault/vault";
import { buildBook, type ExportOptions } from "../export/book";
import { chapterHtml, cssString, titlePageHtml, tocHtml } from "../export/html";
import { FONTS, TRIM, loadDesign, type LayoutDesign } from "./design";

/*
 * O miolo do livro para a miniatura da tela de projetos: o mesmo texto e o
 * mesmo projeto gráfico da diagramação (fonte, corpo, entrelinha, margens,
 * capitular, ornamento), mas paginado na tela com colunas CSS em vez de
 * @page. Cada coluna é uma página; capítulos começam numa coluna nova.
 */

export interface MiniBook {
  title: string;
  author: string;
  layout: LayoutDesign;
  /** HTML do miolo (folha de rosto, sumário e capítulos). */
  html: string;
  /** CSS do miolo, restrito a `.mb-flow`. */
  css: string;
}

export async function loadMiniBook(fs: VaultFs): Promise<MiniBook> {
  const project = await loadProject(fs);
  const { layout } = await loadDesign(fs);
  const opts: ExportOptions = {
    format: "pdf",
    title: project.title,
    author: project.author ?? "",
    chapterIds: project.chapters.map((c) => c.id),
    style: "book",
    titlePage: true,
    toc: project.chapters.length > 1,
    sceneTitles: false,
    chapterNumbers: true,
    pageSize: "14x21",
    // Miniatura: sem imagens, para abrir rápido.
    images: false,
  };
  const book = await buildBook(fs, project, opts);
  const html = [
    titlePageHtml(book, true),
    opts.toc ? tocHtml(book, opts, () => "#") : "",
    ...book.chapters.map((c) => chapterHtml(c, opts, () => "")),
  ].join("\n");
  return { title: book.title, author: book.author, layout, html, css: miniCss(layout) };
}

/** Tamanho da página e da mancha (área do texto), em mm. */
export function pageBox(l: LayoutDesign) {
  const trim = TRIM[l.trim];
  return {
    w: trim.w,
    h: trim.h,
    textW: trim.w - l.marginInner - l.marginOuter,
    textH: trim.h - l.marginTop - l.marginBottom,
  };
}

function miniCss(l: LayoutDesign): string {
  const font = FONTS[l.font].css;
  const box = pageBox(l);
  const s = ".mb-flow";
  return `
${s} { color: #1a1714; font: ${l.size}pt/${l.leading} ${font}; text-align: justify; hyphens: auto; font-variant-numeric: oldstyle-nums; }
${s} p { margin: 0; text-indent: 1.4em; orphans: 2; widows: 2; }
${s} p.first, ${s} p.sep, ${s} .title-page p, ${s} .credits p, ${s} .ch-label { text-indent: 0; }
${s} p.sep { text-align: center; margin: 1.1em 0; font-size: 0; }
${s} p.sep::after { content: ${cssString(l.ornament || "* * *")}; font-size: ${l.size * 1.15}pt; letter-spacing: ${l.ornament.length > 2 ? ".4em" : "0"}; }
${s} h2, ${s} h3, ${s} h4, ${s} h5 { font-family: ${font}; font-weight: 500; text-align: center; break-after: avoid; }
${s} .title-page { text-align: center; padding-top: 28%; break-after: column; }
${s} .title-page h1 { font-size: 2.1em; font-weight: 500; margin: 0 0 1.2em; letter-spacing: .02em; line-height: 1.2; }
${s} .title-page .author { font-size: 1.15em; font-variant: small-caps; letter-spacing: .08em; }
${s} .credits { break-before: column; break-after: column; display: flex; flex-direction: column; justify-content: flex-end; height: ${box.textH - 4}mm; font-size: .78em; text-align: left; }
${s} .credits p { margin: .3em 0; }
${s} .toc { break-before: column; }
${s} .toc h2 { margin: 0 0 1.6em; font-size: 1.3em; }
${s} .toc ol { list-style: none; margin: 0; padding: 0; }
${s} .toc li { margin: .45em 0; }
${s} .toc a { color: inherit; text-decoration: none; pointer-events: none; }
${s} .chapter { break-before: column; }
${s} .chapter > header { margin: 0 0 2.6em; padding-top: 22%; text-align: center; }
${s} .chapter > header h2 { margin: 0; font-size: 1.55em; font-weight: 500; }
${s} .ch-label { margin: 0 0 .7em; font-size: .78em; letter-spacing: .25em; text-transform: uppercase; }
${
  l.dropCap
    ? `${s} .chapter > p.first:not(.dialogue):first-of-type::first-letter { float: left; font-size: ${l.leading * 2.15}em; line-height: .82; padding: .06em .08em 0 0; font-weight: 500; }
${s} .chapter > p.first:not(.dialogue):first-of-type::first-line { font-variant: small-caps; letter-spacing: .04em; }`
    : ""
}
${s} h3.scene { margin: 1.6em 0 .8em; font-size: 1.05em; }
${s} h3, ${s} h4, ${s} h5 { font-size: 1em; margin: 1.2em 0 .6em; }
${s} blockquote { margin: .8em 1.6em; font-style: italic; }
${s} ul, ${s} ol { margin: .6em 0 .6em 1.5em; padding: 0; }
`;
}
