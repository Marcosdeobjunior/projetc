import { Node, mergeAttributes, type Editor } from "@tiptap/core";
import type { VaultFs } from "../platform/types";
import { slugify, uniqueName } from "../vault/paths";

/*
 * Anexos: imagens, vídeos, áudios e outros arquivos copiados para a pasta
 * `anexos/` do projeto. No texto ficam como um bloco que, no .md, vira
 * `![nome](anexos/arquivo.ext)`.
 */

export const ATTACHMENTS_DIR = "anexos";

export type AttachmentKind = "image" | "video" | "audio" | "file";

const TYPES: Record<string, [AttachmentKind, string]> = {
  png: ["image", "image/png"],
  jpg: ["image", "image/jpeg"],
  jpeg: ["image", "image/jpeg"],
  gif: ["image", "image/gif"],
  webp: ["image", "image/webp"],
  avif: ["image", "image/avif"],
  bmp: ["image", "image/bmp"],
  svg: ["image", "image/svg+xml"],
  mp4: ["video", "video/mp4"],
  m4v: ["video", "video/mp4"],
  webm: ["video", "video/webm"],
  mov: ["video", "video/quicktime"],
  ogv: ["video", "video/ogg"],
  mp3: ["audio", "audio/mpeg"],
  wav: ["audio", "audio/wav"],
  ogg: ["audio", "audio/ogg"],
  oga: ["audio", "audio/ogg"],
  opus: ["audio", "audio/ogg"],
  m4a: ["audio", "audio/mp4"],
  aac: ["audio", "audio/aac"],
  flac: ["audio", "audio/flac"],
};

const ext = (name: string) => name.split(".").pop()!.toLowerCase();

export function attachmentKind(name: string): AttachmentKind {
  return TYPES[ext(name)]?.[0] ?? "file";
}

export const KIND_ICON: Record<AttachmentKind, string> = {
  image: "image",
  video: "video",
  audio: "audio",
  file: "file",
};

/** Nome seguro e único dentro de `anexos/`, mantendo a extensão. */
export function attachmentName(original: string, taken: Set<string>): string {
  const dot = original.lastIndexOf(".");
  const base = slugify(dot > 0 ? original.slice(0, dot) : original);
  const extension = dot > 0 ? "." + slugify(original.slice(dot + 1)).slice(0, 10) : "";
  return uniqueName(base, taken, extension);
}

/** Copia arquivos para `anexos/`. Devolve os atributos dos blocos a inserir no texto. */
export async function importFiles(fs: VaultFs, files: File[]) {
  const taken = new Set(await fs.list(ATTACHMENTS_DIR));
  const out: { src: string; name: string }[] = [];
  for (const file of files) {
    const name = attachmentName(file.name || "colado.png", taken);
    taken.add(name);
    const src = `${ATTACHMENTS_DIR}/${name}`;
    await fs.writeBytes(src, new Uint8Array(await file.arrayBuffer()));
    out.push({ src, name: file.name || name });
  }
  return out;
}

export function insertAttachments(
  editor: Editor,
  items: { src: string; name: string }[],
  at?: number,
) {
  const content = items.map((attrs) => ({ type: "attachment", attrs }));
  const chain = editor.chain().focus();
  (at === undefined ? chain.insertContent(content) : chain.insertContentAt(at, content)).run();
}

/* ---------- Arquivos para mostrar no editor ---------- */

interface Source {
  fs: VaultFs;
  /** Abre o arquivo no programa padrão do computador (ou baixa, no navegador). */
  open(path: string): void;
}

let source: Source | null = null;
const urls = new Map<string, Promise<string | null>>();

/** Define de onde os anexos são lidos (o projeto aberto). */
export function setAttachmentSource(next: Source | null) {
  for (const p of urls.values()) void p.then((u) => u && URL.revokeObjectURL(u));
  urls.clear();
  source = next;
}

/** Esquece um arquivo lido antes (ele foi trocado ou apagado). */
export function forgetAttachment(src: string) {
  void urls.get(src)?.then((u) => u && URL.revokeObjectURL(u));
  urls.delete(src);
}

/** Endereço `blob:` com o conteúdo do anexo, ou null se o arquivo não existe. */
export function attachmentUrl(src: string): Promise<string | null> {
  let p = urls.get(src);
  if (!p) {
    const fs = source?.fs;
    p = fs
      ? fs.readBytes(src).then((bytes) =>
          bytes
            ? URL.createObjectURL(
                new Blob([bytes as Uint8Array<ArrayBuffer>], {
                  type: TYPES[ext(src)]?.[1] ?? "",
                }),
              )
            : null,
        )
      : Promise.resolve(null);
    urls.set(src, p);
  }
  return p;
}

export const openAttachment = (src: string) => source?.open(src);

/* ---------- Bloco do editor ---------- */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

export const Attachment = Node.create({
  name: "attachment",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return { src: { default: "" }, name: { default: "" } };
  },

  parseHTML() {
    return [
      {
        tag: "figure[data-attachment]",
        getAttrs: (dom) => ({
          src: dom.getAttribute("data-src") ?? "",
          name: dom.getAttribute("data-name") ?? "",
        }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "figure",
      mergeAttributes(HTMLAttributes, {
        "data-attachment": "",
        "data-src": node.attrs.src,
        "data-name": node.attrs.name,
      }),
    ];
  },

  addNodeView() {
    return ({ node }) => {
      const src = String(node.attrs.src);
      const name = String(node.attrs.name || src.split("/").pop());
      const kind = attachmentKind(src);
      const dom = el("figure", `attachment kind-${kind}`);
      dom.contentEditable = "false";
      dom.title = `${name} · clique duas vezes para abrir`;

      let media: HTMLImageElement | HTMLVideoElement | HTMLAudioElement | null = null;
      if (kind === "image") {
        const img = el("img");
        img.alt = name;
        img.draggable = false;
        media = img;
      } else if (kind === "video" || kind === "audio") {
        const m = el(kind);
        m.controls = true;
        m.preload = "metadata";
        media = m;
      } else {
        const card = el("div", "attachment-file");
        card.innerHTML =
          '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h8l4 4v14H6zM14 3v4h4"/></svg>';
        const label = el("span");
        label.textContent = name;
        const ext = el("small");
        ext.textContent = src.split(".").pop()!.toUpperCase();
        card.append(label, ext);
        dom.append(card);
      }
      if (media) dom.append(media);

      const caption = el("figcaption");
      caption.textContent = name;
      if (kind !== "file") dom.append(caption);

      void attachmentUrl(src).then((url) => {
        if (!url) {
          dom.classList.add("missing");
          caption.textContent = `Arquivo não encontrado: ${src}`;
          if (kind === "file") dom.append(caption);
        } else if (media) {
          media.src = url;
        }
      });
      dom.addEventListener("dblclick", () => openAttachment(src));

      return {
        dom,
        // Os players tratam os próprios cliques (play, volume).
        stopEvent: (e) => e.target instanceof HTMLMediaElement,
        ignoreMutation: () => true,
      };
    };
  },
});
