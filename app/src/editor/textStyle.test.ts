import { describe, expect, it } from "vitest";
import { DEFAULT_TEXT_STYLE, sanitizeTextStyle, textStyleVars } from "./textStyle";

describe("aparência do texto", () => {
  it("sem preferência guardada usa o padrão", () => {
    expect(sanitizeTextStyle(undefined)).toEqual(DEFAULT_TEXT_STYLE);
    expect(sanitizeTextStyle("lixo")).toEqual(DEFAULT_TEXT_STYLE);
  });

  it("corrige valores fora da faixa e fontes desconhecidas", () => {
    const s = sanitizeTextStyle({ font: "comic", size: 99, line: 0.5, letter: "x", word: 0.2 });
    expect(s).toEqual({ font: "literata", size: 28, line: 1.2, letter: 0, word: 0.2 });
  });

  it("gera as variáveis CSS do editor", () => {
    const v = textStyleVars({ font: "mono", size: 20, line: 2, letter: 0.05, word: 0.1 });
    expect(v).toMatchObject({
      "--prose-size": "20px",
      "--prose-line": "2",
      "--prose-letter": "0.05em",
      "--prose-word": "0.1em",
    });
    expect(String((v as Record<string, string>)["--prose-font"])).toContain("monospace");
  });
});
