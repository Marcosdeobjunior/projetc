import {
  AlignmentType,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  LineRuleType,
  Packer,
  PageNumber,
  Paragraph,
  TableOfContents,
  TextRun,
  type IParagraphOptions,
  type ParagraphChild,
} from "docx";
import type { PMNode } from "../markdown/types";
import { chapterHeading, type Book, type BookImage, type ExportOptions } from "./book";

/*
 * Word (.docx). Estilo "livro": serifa, recuo na primeira linha, capítulos em
 * página nova. Estilo "manuscrito": Times 12, espaço duplo, margens de 2,5 cm
 * e cabeçalho "Sobrenome / TÍTULO / página", o formato que editoras pedem.
 */

const MM = 56.7; // twips por milímetro
const PAGE: Record<ExportOptions["pageSize"], { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A5: { w: 148, h: 210 },
  "14x21": { w: 140, h: 210 },
};

/** Tamanho de uma imagem para caber na largura do texto (em pixels a 96 dpi). */
export interface SizedImage {
  data: Uint8Array;
  type: "png" | "jpg" | "gif";
  width: number;
  height: number;
}

/** Lê o tamanho da imagem e converte para PNG o que o Word não aceita (webp, svg). */
export async function prepareImage(img: BookImage): Promise<SizedImage | null> {
  try {
    const blob = new Blob([img.bytes as Uint8Array<ArrayBuffer>], { type: img.mime });
    const bitmap = await createImageBitmap(blob);
    const { width, height } = bitmap;
    const native = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif" } as const;
    const type = native[img.mime as keyof typeof native];
    if (type) {
      bitmap.close();
      return { data: img.bytes, type, width, height };
    }
    const canvas = new OffscreenCanvas(width, height);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    bitmap.close();
    const png = await canvas.convertToBlob({ type: "image/png" });
    return { data: new Uint8Array(await png.arrayBuffer()), type: "png", width, height };
  } catch {
    return null;
  }
}

export async function docx(
  book: Book,
  opts: ExportOptions,
  images: Map<string, SizedImage | null>,
): Promise<Uint8Array> {
  const manuscript = opts.style === "manuscript";
  const page = manuscript ? PAGE.A4 : PAGE[opts.pageSize];
  const margin = manuscript || opts.pageSize === "A4" ? 25 : 18;
  const textWidthPx = ((page.w - 2 * margin) / 25.4) * 96;
  const font = manuscript ? "Times New Roman" : "Georgia";
  const size = manuscript ? 24 : 22; // meio-pontos
  const line = manuscript
    ? { line: 480, lineRule: LineRuleType.AUTO }
    : { line: 360, lineRule: LineRuleType.AUTO };

  const runs = (nodes: PMNode[] = [], extra: { italics?: boolean } = {}): ParagraphChild[] =>
    nodes.map((n) =>
      n.type === "hardBreak"
        ? new TextRun({ break: 1 })
        : new TextRun({
            text: n.text ?? "",
            bold: n.marks?.some((m) => m.type === "bold"),
            italics: extra.italics || n.marks?.some((m) => m.type === "italic"),
            strike: n.marks?.some((m) => m.type === "strike"),
          }),
    );

  const separator = () =>
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: manuscript ? undefined : { before: 240, after: 240 },
      children: [new TextRun("*   *   *")],
    });

  const blocks = (nodes: PMNode[], quote = false): Paragraph[] => {
    const out: Paragraph[] = [];
    let first = true;
    const para = (o: IParagraphOptions) => out.push(new Paragraph(o));
    for (const b of nodes) {
      const c = b.content ?? [];
      switch (b.type) {
        case "paragraph":
          if (!c.length) break;
          para({
            children: runs(c, { italics: quote }),
            indent: quote
              ? { left: 10 * MM, right: 10 * MM }
              : first
                ? undefined
                : { firstLine: manuscript ? 12.7 * MM : 6 * MM },
          });
          first = false;
          break;
        case "heading":
          para({
            children: runs(c),
            heading: HeadingLevel.HEADING_3,
            alignment: AlignmentType.CENTER,
          });
          first = true;
          break;
        case "blockquote":
          out.push(...blocks(c, true));
          break;
        case "bulletList":
        case "orderedList":
          c.forEach((li, i) => {
            const text = (li.content ?? []).flatMap((p) => p.content ?? []);
            const prefix = b.type === "orderedList" ? `${Number(b.attrs?.start ?? 1) + i}. ` : "• ";
            para({
              children: [new TextRun(prefix), ...runs(text)],
              indent: { left: 8 * MM, hanging: 5 * MM },
            });
          });
          break;
        case "horizontalRule":
          out.push(separator());
          first = true;
          break;
        case "attachment": {
          const img = images.get(String(b.attrs?.src));
          if (!img) break;
          const scale = Math.min(1, textWidthPx / img.width);
          para({
            alignment: AlignmentType.CENTER,
            spacing: { before: 200, after: 200 },
            children: [
              new ImageRun({
                type: img.type,
                data: img.data,
                transformation: {
                  width: Math.round(img.width * scale),
                  height: Math.round(img.height * scale),
                },
              }),
            ],
          });
          break;
        }
      }
    }
    return out;
  };

  const body: (Paragraph | TableOfContents)[] = [];
  if (opts.titlePage) {
    body.push(
      new Paragraph({ spacing: { before: 3600 }, children: [] }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: book.title, bold: true, size: manuscript ? 28 : 48 })],
      }),
    );
    if (book.author) {
      body.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 480 },
          children: [new TextRun({ text: book.author, size: manuscript ? 24 : 28 })],
        }),
      );
    }
  }
  if (opts.toc) {
    body.push(
      new Paragraph({
        pageBreakBefore: opts.titlePage,
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "Sumário", bold: true })],
      }),
      new TableOfContents("Sumário", { hyperlink: true, headingStyleRange: "1-1" }),
    );
  }
  book.chapters.forEach((c, ci) => {
    const h = chapterHeading(c, opts);
    const breakBefore = ci > 0 || opts.titlePage || opts.toc;
    if (h.label) {
      body.push(
        new Paragraph({
          pageBreakBefore: breakBefore,
          alignment: AlignmentType.CENTER,
          spacing: { before: manuscript ? 0 : 2400, after: 120 },
          children: [new TextRun({ text: h.label.toUpperCase(), size: manuscript ? 24 : 18 })],
        }),
      );
    }
    body.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: breakBefore && !h.label,
        alignment: AlignmentType.CENTER,
        spacing: { before: h.label || manuscript ? 0 : 2400, after: manuscript ? 480 : 720 },
        children: [new TextRun({ text: manuscript ? h.title.toUpperCase() : h.title })],
      }),
    );
    c.scenes.forEach((s, i) => {
      if (opts.sceneTitles) {
        body.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            alignment: AlignmentType.CENTER,
            spacing: { before: 360, after: 240 },
            children: [new TextRun(s.title)],
          }),
        );
      } else if (i > 0) body.push(separator());
      body.push(...blocks(s.blocks));
    });
  });

  const running = [book.author.split(/\s+/).pop(), book.title.toUpperCase()]
    .filter(Boolean)
    .join(" / ");
  const doc = new Document({
    creator: book.author || "InkFlow",
    title: book.title,
    features: opts.toc ? { updateFields: true } : undefined,
    styles: {
      default: {
        document: {
          run: { font, size },
          paragraph: {
            spacing: { ...line, before: 0, after: 0 },
            alignment: manuscript ? AlignmentType.LEFT : AlignmentType.JUSTIFIED,
          },
        },
        heading1: {
          run: { font, size: manuscript ? 24 : 36, bold: !manuscript, color: "000000" },
          paragraph: { alignment: AlignmentType.CENTER },
        },
        heading2: { run: { font, size: size + 2, bold: true, color: "000000" } },
        heading3: { run: { font, size, bold: true, color: "000000" } },
      },
    },
    sections: [
      {
        properties: {
          titlePage: true,
          page: {
            size: { width: page.w * MM, height: page.h * MM },
            margin: {
              top: margin * MM,
              bottom: margin * MM,
              left: margin * MM,
              right: margin * MM,
            },
          },
        },
        headers: manuscript
          ? {
              default: new Header({
                children: [
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [
                      new TextRun(`${running} / `),
                      new TextRun({ children: [PageNumber.CURRENT] }),
                    ],
                  }),
                ],
              }),
            }
          : undefined,
        footers: manuscript
          ? undefined
          : {
              default: new Footer({
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ children: [PageNumber.CURRENT], size: 18 })],
                  }),
                ],
              }),
            },
        children: body,
      },
    ],
  });
  return new Uint8Array(await (await Packer.toBlob(doc)).arrayBuffer());
}
