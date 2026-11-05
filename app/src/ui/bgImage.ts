import { invoke } from "@tauri-apps/api/core";

/*
 * Imagem de fundo da tela de projetos: vem de um arquivo, de um endereço da
 * internet, da área de transferência (Ctrl+V) ou de arrastar e soltar. Em
 * todos os casos o app guarda uma cópia reduzida (JPEG), para o fundo não
 * depender do site original nem pesar no armazenamento.
 */

/** Lado maior da imagem guardada: nítida em telas grandes, leve no armazenamento. */
const MAX_SIDE = 2400;

export class BgImageError extends Error {}

/** Reduz uma imagem (arquivo ou bytes baixados) para um JPEG leve, em data URL. */
export async function shrinkImage(blob: Blob): Promise<string> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      throw new BgImageError("Não foi possível abrir essa imagem. Use JPG, PNG, WebP ou GIF.");
    }
    const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * k));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * k));
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Texto que parece um endereço de imagem que dá para baixar. */
export function looksLikeImageUrl(text: string): boolean {
  const t = text.trim();
  return /^https?:\/\/\S+$/i.test(t) || /^data:image\/[a-z+.-]+[;,]/i.test(t);
}

const isDesktop = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Baixa a imagem de um endereço e devolve a cópia reduzida. */
export async function imageFromUrl(address: string): Promise<string> {
  const url = address.trim();
  if (!looksLikeImageUrl(url))
    throw new BgImageError("Cole um endereço que comece com http:// ou https://.");
  let blob: Blob;
  if (url.startsWith("data:")) {
    blob = dataUrlToBlob(url);
  } else if (isDesktop()) {
    // No app desktop o download é feito pelo Rust: a janela não acessa outros sites.
    try {
      blob = new Blob([await invoke<ArrayBuffer>("fetch_image", { url })]);
    } catch (err) {
      throw new BgImageError(typeof err === "string" ? err : "Não foi possível baixar a imagem.");
    }
  } else {
    // Prévia no navegador: só funciona se o site permitir (CORS).
    try {
      const res = await fetch(url);
      if (!res.ok) throw new BgImageError(`O site não entregou a imagem (erro ${res.status}).`);
      blob = await res.blob();
    } catch (err) {
      if (err instanceof BgImageError) throw err;
      throw new BgImageError(
        "Este site não deixa o navegador copiar a imagem. Baixe a imagem e escolha o arquivo, ou use o app desktop.",
      );
    }
    if (blob.type && !blob.type.startsWith("image/"))
      throw new BgImageError("Esse endereço não aponta para uma imagem.");
  }
  return shrinkImage(blob);
}

/** Converte um data URL em bytes sem fetch (a CSP do app desktop não deixa). */
function dataUrlToBlob(url: string): Blob {
  const comma = url.indexOf(",");
  const head = url.slice(5, comma);
  const body = url.slice(comma + 1);
  const type = head.split(";")[0] || "image/png";
  if (!head.includes(";base64")) return new Blob([decodeURIComponent(body)], { type });
  try {
    const bin = atob(body);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type });
  } catch {
    throw new BgImageError("Essa imagem colada está incompleta.");
  }
}

/**
 * Procura uma imagem no que foi colado ou solto: primeiro um arquivo de
 * imagem, depois um endereço em texto. Devolve null se não houver nada útil.
 */
export function imageSource(data: DataTransfer | null): { file: File } | { url: string } | null {
  if (!data) return null;
  for (const f of Array.from(data.files)) if (f.type.startsWith("image/")) return { file: f };
  for (const item of Array.from(data.items)) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const f = item.getAsFile();
      if (f) return { file: f };
    }
  }
  const text = (data.getData("text/uri-list") || data.getData("text/plain")).split("\n")[0] ?? "";
  return looksLikeImageUrl(text) ? { url: text.trim() } : null;
}

/** url("…") para CSS, com aspas, barras e quebras de linha escapadas. */
export function cssUrl(src: string): string {
  return `url("${src.replace(/["\\\n\r]/g, (c) => encodeURIComponent(c))}")`;
}
