import type { Book } from "../export/book";
import { FONTS, TRIM, type LayoutDesign } from "./design";
import { cssString } from "../export/html";

/*
 * CSS da diagramação do miolo para impressão: margens espelhadas (medianiz
 * do lado da costura), cabeçalhos (título nas páginas pares, autor nas
 * ímpares), número de página no canto de fora, capitular e ornamento.
 */

const q = cssString;

export function interiorCss(book: Book, l: LayoutDesign): string {
  const trim = TRIM[l.trim];
  const font = FONTS[l.font].css;
  const small = `${Math.max(7, l.size - 2.5)}pt ${font}`;
  const heads = l.runningHeads
    ? {
        // Padrão editorial brasileiro: autor na página par (esquerda), título na ímpar (direita).
        left: `@top-center { content: ${q(book.author || book.title)}; font: italic ${small}; }`,
        right: `@top-center { content: ${q(book.title)}; font: italic ${small}; }`,
      }
    : { left: "", right: "" };
  return `
@page {
  size: ${trim.w}mm ${trim.h}mm;
  margin: ${l.marginTop}mm ${l.marginOuter}mm ${l.marginBottom}mm ${l.marginInner}mm;
}
@page :left {
  margin-left: ${l.marginOuter}mm; margin-right: ${l.marginInner}mm;
  ${heads.left}
  @bottom-left { content: counter(page); font: ${small}; }
}
@page :right {
  margin-left: ${l.marginInner}mm; margin-right: ${l.marginOuter}mm;
  ${heads.right}
  @bottom-right { content: counter(page); font: ${small}; }
}
/* Páginas iniciais e aberturas de capítulo: sem cabeçalho nem número. */
@page front { @top-center { content: none; } @bottom-left { content: none; } @bottom-right { content: none; } }
@page opener:first { @top-center { content: none; } @bottom-left { content: none; } @bottom-right { content: none; } }
html { color: #111; background: #fff; }
body { margin: 0; font: ${l.size}pt/${l.leading} ${font}; text-align: justify; hyphens: auto; font-variant-numeric: oldstyle-nums; }
p { margin: 0; text-indent: 1.4em; orphans: 2; widows: 2; }
p.first, p.sep, .title-page p, .credits p, .ch-label { text-indent: 0; }
p.sep { text-align: center; margin: 1.1em 0; font-size: 0; }
p.sep::after { content: ${q(l.ornament || "* * *")}; font-size: ${l.size * 1.15}pt; letter-spacing: ${l.ornament.length > 2 ? ".4em" : "0"}; }
h2, h3, h4, h5 { font-family: ${font}; font-weight: 500; text-align: center; break-after: avoid; }
.title-page, .credits, .toc { page: front; }
.title-page { break-after: page; text-align: center; padding-top: 28%; }
.title-page h1 { font-size: 2.1em; font-weight: 500; margin: 0 0 1.2em; letter-spacing: .02em; }
.title-page .author { font-size: 1.15em; font-variant: small-caps; letter-spacing: .08em; }
.credits { break-after: page; display: flex; flex-direction: column; justify-content: flex-end; height: ${trim.h - l.marginTop - l.marginBottom - 4}mm; font-size: .78em; text-align: left; }
.credits p { margin: .3em 0; }
.toc { break-after: page; }
/* Folha de rosto, créditos e sumário ocupam 3 páginas: a em branco faz o 1º capítulo cair na página 5 (direita). */
.blank { page: front; break-after: page; height: 1px; }
.toc h2 { margin: 0 0 1.6em; font-size: 1.3em; }
.toc ol { list-style: none; margin: 0; padding: 0; }
.toc li { margin: .45em 0; }
.toc a { color: inherit; text-decoration: none; }
.chapter { page: opener; break-before: ${l.chapterOnRight ? "right" : "page"}; }
.chapter > header { margin: 22% 0 2.6em; text-align: center; }
.chapter > header h2 { margin: 0; font-size: 1.55em; font-weight: 500; }
.ch-label { margin: 0 0 .7em; font-size: .78em; letter-spacing: .25em; text-transform: uppercase; }
${
  l.dropCap
    ? `.chapter > p.first:not(.dialogue):first-of-type::first-letter { float: left; font-size: ${l.leading * 2.15}em; line-height: .82; padding: .06em .08em 0 0; font-weight: 500; }
.chapter > p.first:not(.dialogue):first-of-type::first-line { font-variant: small-caps; letter-spacing: .04em; }`
    : ""
}
h3.scene { margin: 1.6em 0 .8em; font-size: 1.05em; }
h3, h4, h5 { font-size: 1em; margin: 1.2em 0 .6em; }
blockquote { margin: .8em 1.6em; font-style: italic; }
ul, ol { margin: .6em 0 .6em 1.5em; padding: 0; }
figure { margin: 1.2em 0; text-align: center; break-inside: avoid; }
figure img { max-width: 100%; max-height: ${Math.round((trim.h - l.marginTop - l.marginBottom) * 0.8)}mm; }
`;
}
