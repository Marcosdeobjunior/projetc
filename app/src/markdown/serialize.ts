import type { PMNode } from "./types";

/*
 * Converte o documento do editor em Markdown legível. Cobre o que o editor
 * oferece: parágrafos, títulos, citações, listas, separador de cena,
 * quebra de linha, negrito, itálico, tachado e destaque (==texto==, como no Obsidian).
 */

const MARK_ORDER = ["highlight", "bold", "italic", "strike"] as const;
const MARK_SYNTAX: Record<string, string> = {
  highlight: "==",
  bold: "**",
  italic: "*",
  strike: "~~",
};

// Colchetes ficam sem escape para os links [[Nome]] continuarem legíveis no .md.
// Um "=" sozinho fica como está; só "==" (e "=" no fim, que pode encostar num destaque) é escapado.
function escapeText(text: string): string {
  return text.replace(/([\\*_`~])/g, "\\$1").replace(/=(?==|$)/g, "\\=");
}

/** Escapa o que só tem sentido especial no começo da linha. */
function escapeLineStart(line: string): string {
  return line
    .replace(/^(\s*)(#{1,6}\s|>|[-+*]\s|\d+[.)]\s)/, (_, sp: string, m: string) => {
      if (/^\d/.test(m)) return sp + m.replace(/([.)])/, "\\$1");
      return sp + "\\" + m;
    })
    .replace(/^(\s*)(-{3,}|\*{3,}|_{3,})\s*$/, "$1\\$2");
}

function inline(nodes: PMNode[] = []): string {
  let out = "";
  const open: string[] = [];
  const closeTo = (keep: number) => {
    while (open.length > keep) out += MARK_SYNTAX[open.pop()!];
  };

  for (const node of nodes) {
    if (node.type === "hardBreak") {
      closeTo(0);
      out += "\\\n";
      continue;
    }
    if (node.type !== "text" || !node.text) continue;

    const marks = MARK_ORDER.filter((m) => node.marks?.some((x) => x.type === m));
    const text = node.text;

    // Texto só com espaços não abre nem fecha marcação.
    if (!text.trim()) {
      out += text;
      continue;
    }

    // Marcações não podem começar nem terminar com espaço: os espaços ficam de fora.
    const lead = text.match(/^\s*/)![0];
    const trail = text.match(/\s*$/)![0];
    const core = text.slice(lead.length, text.length - trail.length);

    let common = 0;
    while (common < open.length && open[common] === marks[common]) common++;
    closeTo(common);
    out += lead;
    for (const m of marks.slice(common)) {
      out += MARK_SYNTAX[m];
      open.push(m);
    }
    out += escapeText(core);
    if (trail) {
      closeTo(0);
      out += trail;
    }
  }
  closeTo(0);
  return out;
}

function block(node: PMNode, prefix = ""): string[] {
  const c = node.content ?? [];
  switch (node.type) {
    case "paragraph": {
      const text = inline(c);
      return [
        text
          .split("\n")
          .map((l, i) => (i === 0 ? escapeLineStart(l) : l))
          .join("\n" + prefix),
      ];
    }
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 1)));
      return ["#".repeat(level) + " " + inline(c)];
    }
    case "blockquote":
      return [
        blocks(c)
          .split("\n")
          .map((l) => (l ? "> " + l : ">"))
          .join("\n"),
      ];
    case "bulletList":
    case "orderedList": {
      const ordered = node.type === "orderedList";
      const start = Number(node.attrs?.start ?? 1);
      return [
        c
          .map((item, i) => {
            const marker = ordered ? `${start + i}. ` : "- ";
            const body = blocks(item.content ?? [])
              .split("\n")
              .map((l, j) => (j === 0 ? marker + l : l ? " ".repeat(marker.length) + l : l))
              .join("\n");
            return body;
          })
          .join("\n"),
      ];
    }
    case "horizontalRule":
      return ["* * *"];
    default:
      return c.length ? [blocks(c)] : [];
  }
}

function blocks(nodes: PMNode[]): string {
  return nodes.flatMap((n) => block(n)).join("\n\n");
}

export function toMarkdown(doc: PMNode): string {
  const body = blocks(doc.content ?? []);
  return body ? body + "\n" : "";
}

/** Texto puro (para contar palavras) a partir do documento do editor. */
export function toPlainText(doc: PMNode): string {
  if (doc.type === "text") return doc.text ?? "";
  if (doc.type === "hardBreak") return "\n";
  const inner = (doc.content ?? []).map(toPlainText);
  return inner.join(doc.type === "doc" || doc.type.endsWith("List") ? "\n" : " ");
}
