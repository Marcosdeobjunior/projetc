import { strToU8, zipSync, type Zippable } from "fflate";
import type { Book, ExportOptions } from "./book";
import { bookCss, chapterHtml, esc, titlePageHtml, tocHtml } from "./html";

/*
 * EPUB 3 (com o sumário antigo toc.ncx para leitores mais velhos). O
 * arquivo "mimetype" precisa ser o primeiro do zip e sem compressão.
 */

const xhtml = (title: string, body: string) =>
  `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="pt-BR" xml:lang="pt-BR">
<head><meta charset="utf-8"/><title>${esc(title)}</title><link rel="stylesheet" href="style.css"/></head>
<body>${body}</body>
</html>`;

export function epub(book: Book, opts: ExportOptions, id: string, now = new Date()): Uint8Array {
  const image = (src: string) => `images/${book.images.get(src)?.name ?? ""}`;
  const pages: { id: string; file: string; title: string; html: string }[] = [];
  if (opts.titlePage) {
    pages.push({
      id: "titulo",
      file: "titulo.xhtml",
      title: book.title,
      html: titlePageHtml(book),
    });
  }
  for (const c of book.chapters) {
    pages.push({
      id: `cap${c.number}`,
      file: `cap${c.number}.xhtml`,
      title: c.title,
      html: chapterHtml(c, opts, image),
    });
  }

  const nav = xhtml(
    "Sumário",
    `<nav epub:type="toc" id="toc">${tocHtml(book, opts, (c) => `cap${c.number}.xhtml`)
      .replace('<section class="toc">', "")
      .replace("</section>", "")}</nav>`,
  );
  const ncx = `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="${esc(id)}"/></head>
<docTitle><text>${esc(book.title)}</text></docTitle>
<navMap>${book.chapters
    .map(
      (c, i) =>
        `<navPoint id="n${c.number}" playOrder="${i + 1}"><navLabel><text>${esc(c.title)}</text></navLabel><content src="cap${c.number}.xhtml"/></navPoint>`,
    )
    .join("")}</navMap>
</ncx>`;

  const images = [...book.images.values()];
  const manifest = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
    '<item id="css" href="style.css" media-type="text/css"/>',
    ...pages.map((p) => `<item id="${p.id}" href="${p.file}" media-type="application/xhtml+xml"/>`),
    ...images.map(
      (img, i) => `<item id="img${i + 1}" href="images/${img.name}" media-type="${img.mime}"/>`,
    ),
  ];
  const spine = [
    ...(opts.titlePage ? ['<itemref idref="titulo"/>'] : []),
    ...(opts.toc ? ['<itemref idref="nav"/>'] : []),
    ...book.chapters.map((c) => `<itemref idref="cap${c.number}"/>`),
  ];
  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="pt-BR">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="uid">urn:inkflow:${esc(id)}</dc:identifier>
<dc:title>${esc(book.title)}</dc:title>
${book.author ? `<dc:creator>${esc(book.author)}</dc:creator>` : ""}
<dc:language>pt-BR</dc:language>
<meta property="dcterms:modified">${now.toISOString().replace(/\.\d+Z$/, "Z")}</meta>
</metadata>
<manifest>
${manifest.join("\n")}
</manifest>
<spine toc="ncx">
${spine.join("\n")}
</spine>
</package>`;

  const files: Zippable = {
    mimetype: [strToU8("application/epub+zip"), { level: 0 }],
    "META-INF/container.xml": strToU8(`<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`),
    "OEBPS/content.opf": strToU8(opf),
    "OEBPS/nav.xhtml": strToU8(nav),
    "OEBPS/toc.ncx": strToU8(ncx),
    "OEBPS/style.css": strToU8(bookCss(book, { ...opts, style: "book" }, false)),
  };
  for (const p of pages) files[`OEBPS/${p.file}`] = strToU8(xhtml(p.title, p.html));
  for (const img of images) files[`OEBPS/images/${img.name}`] = [img.bytes, { level: 0 }];
  return zipSync(files, { level: 6 });
}
