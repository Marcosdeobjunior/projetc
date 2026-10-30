import type { PMNode } from "../markdown/types";
import { chapterHeading, type Book, type BookChapter, type ExportOptions } from "./book";

/*
 * O livro em (X)HTML. O mesmo texto serve para o PDF (impressão com CSS de
 * página) e para os capítulos do EPUB, por isso é XHTML bem formado.
 */

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(nodes: PMNode[] = []): string {
  return nodes
    .map((n) => {
      if (n.type === "hardBreak") return "<br/>";
      let out = esc(n.text ?? "");
      for (const m of n.marks ?? []) {
        if (m.type === "bold") out = `<strong>${out}</strong>`;
        else if (m.type === "italic") out = `<em>${out}</em>`;
        else if (m.type === "strike") out = `<s>${out}</s>`;
      }
      return out;
    })
    .join("");
}

/** Blocos de uma cena. `image` diz o endereço de cada anexo (blob: no PDF, arquivo no EPUB). */
export function blocksHtml(blocks: PMNode[], image: (src: string) => string): string {
  let first = true; // o primeiro parágrafo depois de um título ou separador fica sem recuo
  return blocks
    .map((b) => {
      const c = b.content ?? [];
      switch (b.type) {
        case "paragraph": {
          const cls = first ? ' class="first"' : "";
          first = false;
          return c.length ? `<p${cls}>${inline(c)}</p>` : "";
        }
        case "heading": {
          first = true;
          const level = Math.min(5, 2 + Number(b.attrs?.level ?? 1));
          return `<h${level}>${inline(c)}</h${level}>`;
        }
        case "blockquote":
          return `<blockquote>${blocksHtml(c, image)}</blockquote>`;
        case "bulletList":
        case "orderedList": {
          const tag = b.type === "bulletList" ? "ul" : "ol";
          const items = c.map((li) => `<li>${blocksHtml(li.content ?? [], image)}</li>`).join("");
          return `<${tag}>${items}</${tag}>`;
        }
        case "horizontalRule":
          first = true;
          return '<p class="sep">* * *</p>';
        case "attachment": {
          const alt = esc(String(b.attrs?.name ?? ""));
          return `<figure><img src="${esc(image(String(b.attrs?.src)))}" alt="${alt}"/></figure>`;
        }
        default:
          return "";
      }
    })
    .join("\n");
}

export function chapterHtml(c: BookChapter, opts: ExportOptions, image: (src: string) => string) {
  const h = chapterHeading(c, opts);
  const scenes = c.scenes
    .map((s, i) => {
      const head = opts.sceneTitles
        ? `<h3 class="scene">${esc(s.title)}</h3>`
        : i > 0
          ? '<p class="sep">* * *</p>'
          : "";
      return head + blocksHtml(s.blocks, image);
    })
    .join("\n");
  return (
    `<section class="chapter" id="cap-${c.number}">` +
    `<header>${h.label ? `<p class="ch-label">${esc(h.label)}</p>` : ""}<h2>${esc(h.title)}</h2></header>` +
    `${scenes}</section>`
  );
}

export function titlePageHtml(book: Book) {
  return (
    `<section class="title-page"><h1>${esc(book.title)}</h1>` +
    (book.author ? `<p class="author">${esc(book.author)}</p>` : "") +
    `</section>`
  );
}

export function tocHtml(book: Book, opts: ExportOptions, href: (c: BookChapter) => string) {
  const items = book.chapters
    .map((c) => {
      const h = chapterHeading(c, opts);
      return `<li><a href="${href(c)}">${h.label ? `${esc(h.label)}: ` : ""}${esc(h.title)}</a></li>`;
    })
    .join("");
  return `<section class="toc"><h2>Sumário</h2><ol>${items}</ol></section>`;
}

const PAGE: Record<ExportOptions["pageSize"], string> = {
  A4: "210mm 297mm",
  A5: "148mm 210mm",
  "14x21": "140mm 210mm",
};

/** Estilos do livro. `print` acrescenta tamanho de página, margens e números de página. */
export function bookCss(book: Book, opts: ExportOptions, print: boolean) {
  const manuscript = opts.style === "manuscript";
  const running = [book.author.split(/\s+/).pop(), book.title.toUpperCase()]
    .filter(Boolean)
    .join(" / ");
  const pageRules = print
    ? manuscript
      ? `@page { size: A4; margin: 25mm;
           @top-right { content: "${running.replace(/["\\]/g, "")} / " counter(page); font: 10pt "Times New Roman", serif; } }
         @page :first { @top-right { content: none; } }`
      : `@page { size: ${PAGE[opts.pageSize]}; margin: ${opts.pageSize === "A4" ? "25mm 22mm" : "18mm 16mm 20mm"};
           @bottom-center { content: counter(page); font: 9pt var(--serif); } }
         @page :first { @bottom-center { content: none; } }`
    : "";
  return `
:root { --serif: ${manuscript ? '"Times New Roman", Times, serif' : '"Literata Variable", Georgia, "Times New Roman", serif'}; }
${pageRules}
html { color: #111; background: #fff; }
body { margin: 0; font: ${manuscript ? "12pt/2" : "11pt/1.55"} var(--serif); text-align: ${manuscript ? "left" : "justify"}; hyphens: auto; }
p { margin: 0; text-indent: ${manuscript ? "12.7mm" : "1.5em"}; orphans: 2; widows: 2; }
p.first, p.sep, .title-page p, .ch-label { text-indent: 0; }
p.sep { text-align: center; margin: ${manuscript ? "0" : "1em 0"}; letter-spacing: .4em; }
h2, h3, h4, h5 { font-family: var(--serif); font-weight: 600; text-align: center; break-after: avoid; }
.chapter { break-before: page; }
.chapter > header { margin: ${manuscript ? "0 0 2em" : "18% 0 2.5em"}; text-align: center; }
.chapter > header h2 { margin: 0; font-size: ${manuscript ? "12pt" : "1.6em"}; ${manuscript ? "text-transform: uppercase;" : ""} }
.ch-label { margin: 0 0 .6em; font-size: ${manuscript ? "12pt" : ".85em"}; letter-spacing: .15em; text-transform: uppercase; }
h3.scene { margin: 1.6em 0 .8em; font-size: 1.05em; }
h3, h4, h5 { font-size: 1em; margin: 1.2em 0 .6em; }
blockquote { margin: .8em 2em; font-style: italic; }
ul, ol { margin: .6em 0 .6em 1.5em; padding: 0; }
figure { margin: 1.2em 0; text-align: center; break-inside: avoid; }
figure img { max-width: 100%; max-height: 70vh; }
.title-page { text-align: center; padding-top: 30%; break-after: page; }
.title-page h1 { font-size: ${manuscript ? "14pt" : "2.2em"}; margin: 0 0 1em; font-weight: 600; }
.title-page .author { font-size: 1.2em; }
.toc { break-after: page; }
.toc h2 { margin: 0 0 1.5em; }
.toc ol { list-style: none; margin: 0; padding: 0; }
.toc li { margin: .4em 0; }
.toc a { color: inherit; text-decoration: none; }
`;
}
