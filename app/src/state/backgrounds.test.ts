import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { THEME_BACKGROUNDS, migrateHomeBg, themeBackgroundUrl } from "./backgrounds";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("fundos das paletas", () => {
  it("cada paleta tem um fundo padrão com arquivo de verdade", () => {
    for (const id of ["ambar", "perola", "esmeralda", "natury"] as const) {
      const bg = THEME_BACKGROUNDS[id];
      expect(existsSync(join(root, "public", "backgrounds", bg.src))).toBe(true);
      expect(themeBackgroundUrl(id).endsWith(`backgrounds/${bg.src}`)).toBe(true);
      expect(bg.dim).toBeGreaterThanOrEqual(0);
    }
    // Paletas diferentes, fundos diferentes.
    const files = Object.values(THEME_BACKGROUNDS).map((b) => b.src);
    expect(new Set(files).size).toBe(files.length);
  });

  it("o padrão antigo (fundo da paleta) passa a seguir o tema; escolhas do usuário ficam", () => {
    expect(migrateHomeBg(undefined)).toBe("tema");
    expect(migrateHomeBg("paleta")).toBe("tema");
    expect(migrateHomeBg("tema")).toBe("tema");
    expect(migrateHomeBg("liso")).toBe("liso");
    expect(migrateHomeBg("imagem")).toBe("imagem");
    expect(migrateHomeBg("qualquer")).toBe("tema");
  });
});
