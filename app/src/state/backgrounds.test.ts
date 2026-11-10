import { describe, expect, it } from "vitest";
import { migrateHomeBg } from "./backgrounds";

describe("fundo da tela inicial", () => {
  it("o padrão é o fundo liso; a imagem do usuário fica", () => {
    expect(migrateHomeBg(undefined)).toBe("liso");
    expect(migrateHomeBg("paleta")).toBe("liso");
    expect(migrateHomeBg("tema")).toBe("liso");
    expect(migrateHomeBg("liso")).toBe("liso");
    expect(migrateHomeBg("imagem")).toBe("imagem");
    expect(migrateHomeBg("qualquer")).toBe("liso");
  });
});
