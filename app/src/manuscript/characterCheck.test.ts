import { describe, expect, it } from "vitest";
import { characterTips } from "./characterCheck";

const keys = (f: Record<string, string>) => characterTips(f).map((t) => t.key);

describe("characterTips", () => {
  it("começa pelo papel e pelo desejo numa ficha vazia", () => {
    const k = keys({});
    expect(k[0]).toBe("papel");
    expect(k).toContain("objetivo");
    expect(k).not.toContain("fantasma");
  });

  it("segue a cadeia desejo → mentira → fantasma e necessidade", () => {
    expect(keys({ objetivo: "x", desejoCena: "y" })).toContain("mentira");
    const k = keys({ objetivo: "x", desejoCena: "y", mentira: "z" });
    expect(k).toContain("fantasma");
    expect(k).toContain("necessidade");
  });

  it("pede o oponente quando já há fraqueza", () => {
    expect(keys({ fraquezaMoral: "x" })).toContain("oponente");
    expect(keys({})).not.toContain("oponente");
  });

  it("para coadjuvantes pergunta a função, não a cadeia da mentira", () => {
    const k = keys({ papel: "Coadjuvante", objetivo: "x" });
    expect(k).toContain("funcaoQuer");
    expect(k).not.toContain("mentira");
  });
});
