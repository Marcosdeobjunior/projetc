import { toMarkdown, toPlainText } from "../markdown/serialize";
import { chapterHeading, type Book, type ExportOptions } from "./book";

/** O livro num arquivo só, em Markdown ou texto puro (sem imagens). */
export function textExport(book: Book, opts: ExportOptions, markdown: boolean): string {
  const out: string[] = [];
  const doc = (blocks: Book["chapters"][number]["scenes"][number]["blocks"]) => {
    const content = blocks.filter((b) => markdown || b.type !== "attachment");
    return markdown
      ? toMarkdown({ type: "doc", content }).trim()
      : toPlainText({ type: "doc", content }).replace(/\n/g, "\n\n").trim();
  };
  if (opts.titlePage) {
    out.push(markdown ? `# ${book.title}` : book.title.toUpperCase());
    if (book.author) out.push(markdown ? `*${book.author}*` : book.author);
  }
  for (const c of book.chapters) {
    const h = chapterHeading(c, opts);
    const title = h.label ? `${h.label}: ${h.title}` : h.title;
    out.push(markdown ? `## ${title}` : `\n${title.toUpperCase()}`);
    c.scenes.forEach((s, i) => {
      if (opts.sceneTitles) out.push(markdown ? `### ${s.title}` : s.title);
      else if (i > 0) out.push("* * *");
      const text = doc(s.blocks);
      if (text) out.push(text);
    });
  }
  return out.join("\n\n") + "\n";
}
