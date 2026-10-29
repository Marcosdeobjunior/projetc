import { describe, expect, it } from "vitest";
import { toMarkdown, toPlainText } from "./serialize";
import { parseMarkdown, splitFrontmatter } from "./parse";
import type { PMNode } from "./types";

const p = (...content: PMNode[]): PMNode => ({ type: "paragraph", content });
const t = (text: string, ...marks: string[]): PMNode =>
  marks.length
    ? { type: "text", text, marks: marks.map((type) => ({ type })) }
    : { type: "text", text };
const doc = (...content: PMNode[]): PMNode => ({ type: "doc", content });

describe("toMarkdown", () => {
  it("escreve parágrafos separados por linha em branco", () => {
    expect(toMarkdown(doc(p(t("Primeiro.")), p(t("Segundo."))))).toBe("Primeiro.\n\nSegundo.\n");
  });

  it("põe os espaços fora das marcações", () => {
    expect(toMarkdown(doc(p(t("Ela disse "), t("não ", "italic"), t("e saiu."))))).toBe(
      "Ela disse *não* e saiu.\n",
    );
  });

  it("mantém marcações aninhadas", () => {
    expect(toMarkdown(doc(p(t("a", "bold"), t("b", "bold", "italic"), t("c", "bold"))))).toBe(
      "**a*b*c**\n",
    );
  });

  it("escapa caracteres que virariam formatação", () => {
    expect(toMarkdown(doc(p(t("2 * 3 = 6 e _x_"))))).toBe("2 \\* 3 = 6 e \\_x\\_\n");
    expect(toMarkdown(doc(p(t("# não é título"))))).toBe("\\# não é título\n");
    expect(toMarkdown(doc(p(t("- não é lista"))))).toBe("\\- não é lista\n");
    expect(toMarkdown(doc(p(t("1. não é lista"))))).toBe("1\\. não é lista\n");
  });

  it("escreve títulos, citações, listas e separador de cena", () => {
    const md = toMarkdown(
      doc(
        { type: "heading", attrs: { level: 2 }, content: [t("Parte um")] },
        { type: "blockquote", content: [p(t("Citação"))] },
        { type: "bulletList", content: [{ type: "listItem", content: [p(t("item"))] }] },
        { type: "horizontalRule" },
      ),
    );
    expect(md).toBe("## Parte um\n\n> Citação\n\n- item\n\n* * *\n");
  });

  it("documento vazio vira arquivo vazio", () => {
    expect(toMarkdown(doc())).toBe("");
    expect(toMarkdown({ type: "doc", content: [{ type: "paragraph" }] })).toBe("");
  });
});

describe("parseMarkdown", () => {
  it("ignora o cabeçalho (frontmatter)", () => {
    const md = '---\nid: sc_1\ntitle: "A carta"\n---\n\nTexto.\n';
    expect(splitFrontmatter(md).frontmatter).toEqual({ id: "sc_1", title: "A carta" });
    expect(parseMarkdown(md)).toEqual(doc(p(t("Texto."))));
  });

  it("lê itálico e negrito", () => {
    expect(parseMarkdown("um *dois* **três**")).toEqual(
      doc(p(t("um "), t("dois", "italic"), t(" "), t("três", "bold"))),
    );
  });

  it("não confunde asterisco solto com itálico", () => {
    expect(parseMarkdown("2 * 3")).toEqual(doc(p(t("2 * 3"))));
  });

  it("junta linhas do mesmo parágrafo", () => {
    expect(parseMarkdown("linha um\nlinha dois")).toEqual(doc(p(t("linha um linha dois"))));
  });
});

describe("ida e volta", () => {
  const samples: PMNode[] = [
    doc(p(t("O vento soprava frio naquela manhã."))),
    doc(p(t("Ela disse "), t("não", "italic"), t(" e "), t("saiu", "bold"), t("."))),
    doc(p(t("Fórmula: 2 * 3 e a_b, [nota] e `código`"))),
    doc(
      { type: "heading", attrs: { level: 1 }, content: [t("Capítulo")] },
      p(t("— Diálogo com travessão, disse ela.")),
      { type: "horizontalRule" },
      { type: "blockquote", content: [p(t("Uma citação."))] },
      {
        type: "orderedList",
        attrs: { start: 1 },
        content: [
          { type: "listItem", content: [p(t("um"))] },
          { type: "listItem", content: [p(t("dois"))] },
        ],
      },
    ),
    doc(p(t("primeira linha"), { type: "hardBreak" }, t("segunda linha"))),
  ];

  it.each(samples.map((s, i) => [i, s] as const))("amostra %i volta igual", (_, sample) => {
    expect(parseMarkdown(toMarkdown(sample))).toEqual(sample);
  });
});

describe("toPlainText", () => {
  it("separa blocos para a contagem de palavras", () => {
    expect(toPlainText(doc(p(t("um")), p(t("dois"))))).toBe("um\ndois");
  });
});
