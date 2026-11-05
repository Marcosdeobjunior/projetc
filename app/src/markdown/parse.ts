import type { PMNode } from "./types";

/*
 * Lê Markdown e gera o documento do editor. Usado quando o .md existe mas o
 * estado do editor (Yjs) não, por exemplo num texto criado ou editado fora do
 * app. Aceita o mesmo subconjunto que serialize.ts escreve.
 */

interface ParsedFile {
  frontmatter: Record<string, string>;
  body: string;
}

export function splitFrontmatter(text: string): ParsedFile {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { frontmatter: {}, body: text };
  const frontmatter: Record<string, string> = {};
  for (const line of m[1]!.split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) frontmatter[line.slice(0, i).trim()] = unquote(line.slice(i + 1).trim());
  }
  return { frontmatter, body: text.slice(m[0].length) };
}

function unquote(v: string) {
  if (v.startsWith('"') && v.endsWith('"')) {
    try {
      return JSON.parse(v) as string;
    } catch {
      return v.slice(1, -1);
    }
  }
  return v;
}

const INLINE_MARKS: [string, string][] = [
  ["==", "highlight"],
  ["**", "bold"],
  ["__", "bold"],
  ["~~", "strike"],
  ["*", "italic"],
  ["_", "italic"],
];

function parseInline(src: string): PMNode[] {
  const out: PMNode[] = [];
  const active: string[] = [];
  let buf = "";

  const flush = () => {
    if (!buf) return;
    const node: PMNode = { type: "text", text: buf };
    if (active.length) node.marks = [...new Set(active)].map((type) => ({ type }));
    out.push(node);
    buf = "";
  };

  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    // Barra no fim do parágrafo: era uma quebra de linha no final.
    if (ch === "\\" && i + 1 === src.length) {
      flush();
      out.push({ type: "hardBreak" });
      i++;
      continue;
    }
    if (ch === "\\" && i + 1 < src.length) {
      if (src[i + 1] === "\n") {
        flush();
        out.push({ type: "hardBreak" });
      } else buf += src[i + 1];
      i += 2;
      continue;
    }
    const mark = INLINE_MARKS.find(([s]) => src.startsWith(s, i));
    if (mark) {
      const [syntax, type] = mark;
      const idx = active.lastIndexOf(type);
      if (idx !== -1) {
        flush();
        active.splice(idx, 1);
        i += syntax.length;
        continue;
      }
      // Só abre se houver fechamento adiante e o próximo caractere não for espaço.
      const next = src[i + syntax.length];
      if (next && !/\s/.test(next) && src.indexOf(syntax, i + syntax.length + 1) !== -1) {
        flush();
        active.push(type);
        i += syntax.length;
        continue;
      }
    }
    buf += ch === "\n" ? " " : ch;
    i++;
  }
  flush();
  return out;
}

function paragraph(text: string): PMNode {
  const content = parseInline(text);
  return content.length ? { type: "paragraph", content } : { type: "paragraph" };
}

export function parseMarkdown(markdown: string): PMNode {
  const { body } = splitFrontmatter(markdown);
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  return { type: "doc", content: parseBlocks(lines) };
}

function parseBlocks(lines: string[]): PMNode[] {
  const out: PMNode[] = [];
  let i = 0;
  const isBlank = (l: string | undefined) => l === undefined || l.trim() === "";

  while (i < lines.length) {
    const line = lines[i]!;
    if (isBlank(line)) {
      i++;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      out.push({
        type: "heading",
        // O editor só tem títulos de nível 1 a 3.
        attrs: { level: Math.min(3, heading[1]!.length) },
        content: parseInline(heading[2]!.trim()),
      });
      i++;
      continue;
    }

    const embed = line.match(/^!\[((?:\\.|[^\]\\])*)\]\((<[^>]+>|[^)\s]+)\)\s*$/);
    if (embed) {
      const src = embed[2]!.replace(/^<|>$/g, "");
      out.push({
        type: "attachment",
        attrs: { src, name: embed[1]!.replace(/\\(.)/g, "$1") },
      });
      i++;
      continue;
    }

    if (/^\s*([*\-_])(\s*\1){2,}\s*$/.test(line)) {
      out.push({ type: "horizontalRule" });
      i++;
      continue;
    }

    if (line.startsWith(">")) {
      const inner: string[] = [];
      while (i < lines.length && lines[i]!.startsWith(">")) {
        inner.push(lines[i]!.replace(/^> ?/, ""));
        i++;
      }
      out.push({ type: "blockquote", content: parseBlocks(inner) });
      continue;
    }

    const listMatch = line.match(/^([-+*]|\d+[.)])\s+/);
    if (listMatch) {
      const ordered = /\d/.test(listMatch[1]!);
      const items: PMNode[] = [];
      while (i < lines.length) {
        const m = lines[i]!.match(/^([-+*]|\d+[.)])(\s+)(.*)$/);
        if (!m || /\d/.test(m[1]!) !== ordered) break;
        // Conteúdo do item: a 1ª linha e as seguintes recuadas (inclusive depois de
        // linha em branco), que podem ter outros parágrafos e listas dentro.
        const indent = m[1]!.length + m[2]!.length;
        const itemLines = [m[3]!];
        i++;
        while (i < lines.length) {
          const l = lines[i]!;
          if (isBlank(l)) {
            const next = lines[i + 1];
            if (next !== undefined && /^\s{2,}\S/.test(next)) {
              itemLines.push("");
              i++;
              continue;
            }
            break;
          }
          if (!/^\s{2,}\S/.test(l)) break;
          itemLines.push(l.replace(new RegExp(`^ {1,${Math.max(2, indent)}}`), ""));
          i++;
        }
        const inner = parseBlocks(itemLines);
        items.push({ type: "listItem", content: inner.length ? inner : [{ type: "paragraph" }] });
        while (isBlank(lines[i]) && lines[i + 1]?.match(/^([-+*]|\d+[.)])\s+/)) i++;
      }
      const node: PMNode = { type: ordered ? "orderedList" : "bulletList", content: items };
      if (ordered) node.attrs = { start: parseInt(listMatch[1]!, 10) };
      out.push(node);
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && !isBlank(lines[i])) {
      const l = lines[i]!;
      if (para.length && (/^(#{1,6})\s/.test(l) || l.startsWith(">"))) break;
      para.push(l);
      i++;
    }
    out.push(paragraph(para.join("\n")));
  }
  return out;
}
