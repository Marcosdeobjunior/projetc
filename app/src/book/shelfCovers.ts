import type { VaultFs } from "../platform/types";
import { loadProject } from "../vault/vault";
import { renderPart } from "./cover";
import { DESIGN_FILE, TRIM, loadDesign, pageCount, spineWidth } from "./design";

/*
 * Capa, quarta capa e lombada de cada projeto, para a estante e o livro 3D da
 * tela inicial. Usa o projeto gráfico do livro: a arte pronta enviada, se
 * houver, ou o desenho do InkFlow (o padrão do app, para quem nunca mexeu na
 * capa). Cada livro é desenhado uma vez por versão e fica guardado.
 */

export interface ShelfCovers {
  front: string;
  back: string;
  spine: string;
  /**
   * Lombada da estante: no desenho do app, um pouco mais larga que a real
   * (o título cabe em pé); na arte pronta, a própria arte na proporção dela.
   */
  shelfSpine: string;
  shelfSpineMm: number;
  /** Medidas reais (mm): a lombada sai da contagem de páginas e do papel. */
  widthMm: number;
  heightMm: number;
  /** Lombada como aparece na tela: livros finos ganham um mínimo para o título caber. */
  spineMm: number;
  /** Lombada real, pela contagem de páginas e pelo papel. */
  realSpineMm: number;
}

/** Lombada mínima na tela (mm): um livro de 20 páginas ainda mostra o título. */
const MIN_SPINE_MM = 14;
/** Lombada mínima na estante (mm), no desenho do app. */
const MIN_SHELF_SPINE_MM = 34;

const CACHE_MAX = 24;
/** Por projeto: a assinatura do que foi desenhado (projeto gráfico + tamanho) e o resultado. */
const cache = new Map<string, { sig: string; promise: Promise<ShelfCovers | null> }>();
const ready = new Map<string, ShelfCovers>();

/** As últimas capas desenhadas deste projeto, se houver (podem ser trocadas logo depois). */
export function peekCovers(root: string): ShelfCovers | null {
  return ready.get(root) ?? null;
}

const toUrl = (canvas: HTMLCanvasElement) =>
  new Promise<string>((resolve) =>
    canvas.toBlob(
      (b) => resolve(b ? URL.createObjectURL(b) : canvas.toDataURL()),
      "image/webp",
      0.9,
    ),
  );

const revoke = (c: ShelfCovers | undefined) => {
  if (c)
    for (const u of [c.front, c.back, c.spine, c.shelfSpine])
      if (u.startsWith("blob:")) URL.revokeObjectURL(u);
};

/**
 * Desenha as três partes, ou devolve as já desenhadas se nada mudou. Antes de
 * desenhar lê só o projeto gráfico (um arquivo pequeno): trocar a capa no
 * editor, enviar uma arte pronta ou escrever muito (a lombada engrossa) faz o
 * livro ser desenhado de novo.
 */
export async function getCovers(
  root: string,
  fs: VaultFs,
  stats: { words: number; chapters: number },
): Promise<ShelfCovers | null> {
  const designText = (await fs.readText(DESIGN_FILE).catch(() => null)) ?? "";
  const sig = `${designText}|${Math.round(stats.words / 2000)}|${stats.chapters}`;
  const hit = cache.get(root);
  if (hit && hit.sig === sig) return hit.promise;
  const promise = (async () => {
    const [project, design] = await Promise.all([loadProject(fs), loadDesign(fs)]);
    const info = { title: project.title, author: project.author ?? "" };
    const trim = TRIM[design.layout.trim];
    const realSpineMm = spineWidth(
      design.layout,
      pageCount(design.layout, stats.words, stats.chapters || project.chapters.length),
    );
    const spineMm = Math.max(MIN_SPINE_MM, realSpineMm);
    // Resolução de tela nítida para o tamanho em que aparecem (até ~360px de altura, em 2x).
    const dpi = (720 / trim.h) * 25.4;
    const shelfSpineMm = design.cover.spineArt
      ? spineMm
      : Math.max(MIN_SHELF_SPINE_MM, realSpineMm);
    const [front, back, spine, shelfSpine] = await Promise.all([
      renderPart("front", design, info, dpi, spineMm, fs),
      renderPart("back", design, info, dpi, spineMm, fs),
      renderPart("spine", design, info, dpi, spineMm, fs),
      renderPart("spine", design, info, dpi * 0.7, shelfSpineMm, fs),
    ]);
    const out: ShelfCovers = {
      front: await toUrl(front),
      back: await toUrl(back),
      spine: await toUrl(spine),
      shelfSpine: await toUrl(shelfSpine),
      shelfSpineMm,
      widthMm: trim.w,
      heightMm: trim.h,
      spineMm,
      realSpineMm,
    };
    revoke(ready.get(root));
    ready.set(root, out);
    return out;
  })().catch((err: unknown) => {
    console.error(err);
    cache.delete(root);
    return null;
  });
  cache.set(root, { sig, promise });
  while (cache.size > CACHE_MAX) {
    const old = cache.keys().next().value!;
    cache.delete(old);
    revoke(ready.get(old));
    ready.delete(old);
  }
  return promise;
}
