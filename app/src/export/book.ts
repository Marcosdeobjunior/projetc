import type { VaultFs } from "../platform/types";
import type { Project } from "../manuscript/types";
import { scenePath } from "../manuscript/tree";
import { parseMarkdown } from "../markdown/parse";
import { toPlainText } from "../markdown/serialize";
import type { PMNode } from "../markdown/types";
import { countWords } from "../manuscript/wordCount";
import { attachmentKind } from "../editor/attachments";
import { folderName } from "../vault/paths";

/*
 * O livro a exportar: capítulos e cenas escolhidos, já limpos para leitura
 * ([[links]] viram texto, o marca-texto sai, anexos que não são imagem saem).
 */

export type ExportFormat = "docx" | "pdf" | "epub" | "md" | "txt";
export type PageSize = "A4" | "A5" | "14x21";

export interface ExportOptions {
  format: ExportFormat;
  title: string;
  author: string;
  /** Capítulos incluídos (na ordem do projeto). */
  chapterIds: string[];
  /** "book": pronto para ler; "manuscript": formato padrão para enviar a editoras. */
  style: "book" | "manuscript";
  titlePage: boolean;
  toc: boolean;
  /** Mostra o título de cada cena; sem isso, as cenas são separadas por "* * *". */
  sceneTitles: boolean;
  /** "Capítulo 1" acima do título do capítulo. */
  chapterNumbers: boolean;
  pageSize: PageSize;
  images: boolean;
}

export interface BookScene {
  title: string;
  blocks: PMNode[];
}

export interface BookChapter {
  number: number;
  title: string;
  scenes: BookScene[];
}

export interface BookImage {
  bytes: Uint8Array;
  mime: string;
  /** Nome de arquivo seguro, usado dentro do EPUB. */
  name: string;
}

export interface Book {
  title: string;
  author: string;
  chapters: BookChapter[];
  /** Imagens usadas, pelo caminho no vault (anexos/x.png). */
  images: Map<string, BookImage>;
  words: number;
}

const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

const WIKILINK = /\[\[([^[\]|\n]+?)(?:\|([^[\]\n]*))?\]\]/g;

/** [[Nome]] → Nome, [[Nome|texto]] → texto. */
export const unlink = (text: string) =>
  text.replace(WIKILINK, (_, target: string, alias?: string) => (alias ?? target).trim());

/** Prepara um bloco para o livro. Devolve null se ele não entra. */
export function clean(node: PMNode, images: boolean): PMNode | null {
  if (node.type === "text") {
    const marks = node.marks?.filter((m) => m.type !== "highlight");
    const out: PMNode = { type: "text", text: unlink(node.text ?? "") };
    if (marks?.length) out.marks = marks;
    return out.text ? out : null;
  }
  if (node.type === "attachment") {
    const src = String(node.attrs?.src ?? "");
    return images &&
      attachmentKind(src) === "image" &&
      IMAGE_MIME[src.split(".").pop()!.toLowerCase()]
      ? node
      : null;
  }
  if (!node.content) return node;
  // Os links podem estar quebrados em vários pedaços de texto (ex.: parte em itálico).
  const content = node.content.map((c) => clean(c, images)).filter((c): c is PMNode => c !== null);
  return { ...node, content };
}

export async function buildBook(fs: VaultFs, project: Project, opts: ExportOptions): Promise<Book> {
  const wanted = new Set(opts.chapterIds);
  const chapters: BookChapter[] = [];
  const images = new Map<string, BookImage>();
  let words = 0;
  for (const c of project.chapters) {
    if (!wanted.has(c.id)) continue;
    const scenes: BookScene[] = [];
    for (const s of c.scenes) {
      const md = (await fs.readText(scenePath(c, s))) ?? "";
      const doc = parseMarkdown(md);
      words += countWords(toPlainText(doc));
      const blocks = (doc.content ?? [])
        .map((b) => clean(b, opts.images))
        .filter((b): b is PMNode => b !== null);
      for (const b of blocks) {
        if (b.type !== "attachment") continue;
        const src = String(b.attrs!.src);
        if (images.has(src)) continue;
        const bytes = await fs.readBytes(src);
        const ext = src.split(".").pop()!.toLowerCase();
        if (bytes)
          images.set(src, { bytes, mime: IMAGE_MIME[ext]!, name: `img${images.size + 1}.${ext}` });
      }
      scenes.push({
        title: s.title,
        blocks: blocks.filter((b) => b.type !== "attachment" || images.has(String(b.attrs!.src))),
      });
    }
    chapters.push({ number: chapters.length + 1, title: c.title, scenes });
  }
  return {
    title: opts.title.trim() || project.title,
    author: opts.author.trim(),
    chapters,
    images,
    words,
  };
}

export function chapterHeading(
  c: BookChapter,
  opts: ExportOptions,
): { label: string | null; title: string } {
  return { label: opts.chapterNumbers ? `Capítulo ${c.number}` : null, title: c.title };
}

/** Nome de arquivo para salvar (sem caracteres que o Windows não aceita). */
export function fileName(title: string, format: ExportFormat) {
  return `${folderName(title)}.${format}`;
}
