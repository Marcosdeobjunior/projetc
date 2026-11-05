import type { ReactNode } from "react";
import { parseMarkdown } from "../markdown/parse";
import type { PMNode } from "../markdown/types";

/** Mostra um texto em Markdown (só leitura), com a mesma aparência do editor. */
export function DocPreview({ markdown }: { markdown: string }) {
  const doc = parseMarkdown(markdown);
  if (!doc.content?.length) return <p className="muted">Este texto estava vazio.</p>;
  return <div className="prose preview">{render(doc.content)}</div>;
}

function render(nodes: PMNode[] = []): ReactNode[] {
  return nodes.map((n, i) => node(n, i));
}

function node(n: PMNode, key: number): ReactNode {
  switch (n.type) {
    case "paragraph":
      return <p key={key}>{render(n.content)}</p>;
    case "heading": {
      const level = Math.min(3, Number(n.attrs?.level ?? 1));
      const H = `h${level}` as "h1" | "h2" | "h3";
      return <H key={key}>{render(n.content)}</H>;
    }
    case "blockquote":
      return <blockquote key={key}>{render(n.content)}</blockquote>;
    case "bulletList":
      return <ul key={key}>{render(n.content)}</ul>;
    case "orderedList":
      return (
        <ol key={key} start={Number(n.attrs?.start ?? 1)}>
          {render(n.content)}
        </ol>
      );
    case "listItem":
      return <li key={key}>{render(n.content)}</li>;
    case "horizontalRule":
      return <hr key={key} />;
    case "hardBreak":
      return <br key={key} />;
    case "attachment":
      return (
        <p key={key} className="preview-attachment">
          📎 {String(n.attrs?.name || n.attrs?.src)}
        </p>
      );
    case "text": {
      let out: ReactNode = n.text;
      for (const m of n.marks ?? []) {
        if (m.type === "bold") out = <strong>{out}</strong>;
        else if (m.type === "italic") out = <em>{out}</em>;
        else if (m.type === "strike") out = <s>{out}</s>;
        else if (m.type === "highlight") out = <mark>{out}</mark>;
      }
      return <span key={key}>{out}</span>;
    }
    default:
      return <div key={key}>{render(n.content)}</div>;
  }
}
