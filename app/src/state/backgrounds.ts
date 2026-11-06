import type { PaletteId } from "./settings";

/*
 * Fundos da tela inicial. Cada paleta tem um fundo padrão (o "do tema"); o
 * usuário pode trocar por um fundo liso ou por uma imagem sua. São duas
 * coisas separadas: o fundo do tema vem da paleta, a escolha do usuário fica
 * nas preferências e vale em qualquer paleta.
 */

/**
 * Fundo da tela inicial. "tema" segue a paleta: cada uma tem o seu (veja
 * THEME_BACKGROUNDS) e ele troca junto com a paleta. "liso" é só a cor da
 * paleta e "imagem" é a imagem do usuário. As duas últimas são escolhas do
 * usuário e valem em qualquer paleta: trocar a paleta não as desfaz.
 */
export type HomeBg = "tema" | "liso" | "imagem";

/** Fundo padrão de cada paleta (arquivos em public/backgrounds). */
export const THEME_BACKGROUNDS: Record<PaletteId, { src: string; label: string; dim: number }> = {
  // Véu leve: as superfícies são opacas, então o texto já fica legível e o
  // fundo pode aparecer mais.
  ambar: { src: "ambar.svg", label: "Noite dourada", dim: 6 },
  perola: { src: "perola.svg", label: "Seda de pérola", dim: 4 },
  esmeralda: { src: "esmeralda.svg", label: "Aurora no lago", dim: 5 },
  natury: { src: "natury.svg", label: "Manhã no campo", dim: 3 },
};

/** Endereço do fundo padrão da paleta, relativo à raiz do app. */
export function themeBackgroundUrl(id: PaletteId): string {
  return `${import.meta.env.BASE_URL}backgrounds/${THEME_BACKGROUNDS[id].src}`;
}

/** Lê o fundo guardado. O antigo "paleta" era o padrão: vira o fundo do tema. */
export function migrateHomeBg(saved: unknown): HomeBg {
  return saved === "imagem" || saved === "liso" ? saved : "tema";
}
