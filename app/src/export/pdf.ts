import type { Book, ExportOptions } from "./book";
import { bookCss, chapterHtml, esc, titlePageHtml, tocHtml } from "./html";

/*
 * PDF pela impressão do sistema: o livro é montado numa página escondida
 * com CSS de página (tamanho, margens, números) e abre a janela de
 * impressão, onde se escolhe "Salvar como PDF".
 */

/** As fontes do app (@font-face), para o livro usar as mesmas. */
function fontFaces(): string {
  const out: string[] = [];
  if (typeof document === "undefined") return "";
  for (const sheet of [...document.styleSheets]) {
    try {
      for (const rule of [...sheet.cssRules])
        if (rule instanceof CSSFontFaceRule) out.push(rule.cssText);
    } catch {
      // folha de outro domínio: ignora
    }
  }
  return out.join("\n");
}

export function bookHtml(book: Book, opts: ExportOptions, image: (src: string) => string) {
  const parts = [
    opts.titlePage ? titlePageHtml(book) : "",
    opts.toc ? tocHtml(book, opts, (c) => `#cap-${c.number}`) : "",
    ...book.chapters.map((c) => chapterHtml(c, opts, image)),
  ];
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(book.title)}</title>
<style>${fontFaces()}\n${bookCss(book, opts, true)}
.chapter:first-of-type { break-before: ${opts.titlePage || opts.toc ? "page" : "auto"}; }</style>
</head><body>${parts.join("\n")}</body></html>`;
}

export async function printPdf(book: Book, opts: ExportOptions) {
  const urls = new Map<string, string>();
  for (const [src, img] of book.images) {
    urls.set(
      src,
      URL.createObjectURL(new Blob([img.bytes as Uint8Array<ArrayBuffer>], { type: img.mime })),
    );
  }
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  frame.srcdoc = bookHtml(book, opts, (src) => urls.get(src) ?? "");
  document.body.append(frame);
  try {
    await new Promise<void>((r) => frame.addEventListener("load", () => r(), { once: true }));
    const win = frame.contentWindow!;
    await win.document.fonts.ready;
    await Promise.all(
      [...win.document.images].map((img) => (img.complete ? null : img.decode().catch(() => null))),
    );
    win.focus();
    win.print();
  } finally {
    // A janela de impressão trava a página até fechar; depois dela, limpa.
    setTimeout(() => {
      frame.remove();
      for (const u of urls.values()) URL.revokeObjectURL(u);
    }, 1000);
  }
}
