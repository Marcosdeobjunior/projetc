/**
 * Fundo da tela inicial. "liso" é só a cor da paleta (o padrão) e "imagem" é
 * a imagem do usuário. A escolha fica nas preferências e vale em qualquer
 * paleta: trocar a paleta não a desfaz.
 */
export type HomeBg = "liso" | "imagem";

/**
 * Lê o fundo guardado. Os antigos "tema" e "paleta" (fundos ilustrados de
 * cada paleta, que deixaram de existir) viram o fundo liso.
 */
export function migrateHomeBg(saved: unknown): HomeBg {
  return saved === "imagem" ? "imagem" : "liso";
}
