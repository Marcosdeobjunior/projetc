/** Pasta interna do app dentro de cada vault. */
const META_DIR = ".inkflow";
export const PROJECT_FILE = `${META_DIR}/project.json`;
/** Estado Yjs de cada cena (usado para mesclar edições no sync). */
const YDOC_DIR = `${META_DIR}/ydoc`;
/** Cenas e capítulos excluídos vão para cá em vez de sumir. */
export const TRASH_DIR = `${META_DIR}/lixeira`;
/** Textos legíveis do livro. */
export const MANUSCRIPT_DIR = "manuscrito";

export const ydocPath = (sceneId: string) => `${YDOC_DIR}/${sceneId}.yjs`;

/** Converte um título em nome de arquivo seguro em Windows, macOS e Linux. */
export function slugify(title: string): string {
  const s = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return s || "sem-titulo";
}

/** Devolve `base`, ou `base-2`, `base-3`... o primeiro que não estiver em uso. */
export function uniqueName(base: string, taken: Set<string>, ext = ""): string {
  let name = base + ext;
  for (let n = 2; taken.has(name); n++) name = `${base}-${n}${ext}`;
  return name;
}

/**
 * Nome de pasta legível para o projeto no desktop: mantém acentos e espaços,
 * tira só o que Windows, macOS e Linux não aceitam.
 */
export function folderName(title: string): string {
  const s = title
    // eslint-disable-next-line no-control-regex -- caracteres de controle são proibidos em nomes de arquivo
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "")
    .slice(0, 80)
    .trim();
  return /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s) || !s ? "Meu livro" : s;
}
