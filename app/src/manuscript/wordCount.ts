const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

/** Conta palavras como um escritor espera: "guarda-chuva" e "d'água" contam uma. */
export function countWords(text: string): number {
  return text.match(WORD)?.length ?? 0;
}

export function formatCount(n: number): string {
  return n.toLocaleString("pt-BR");
}
