/**
 * Conteúdo de `.talia/project.json`. A ordem dos capítulos e das cenas vive
 * aqui; os textos ficam em `manuscrito/<pasta do capítulo>/<arquivo da cena>.md`
 * e as notas em `notas/<tipo>/<arquivo>.md`.
 */
export interface Project {
  format: 1;
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  chapters: Chapter[];
  /** Personagens, lugares e ideias. Projetos antigos não têm (lido como []). */
  notes: Note[];
  /** Nome do autor, usado na exportação. */
  author?: string;
}

export interface Chapter {
  id: string;
  title: string;
  /** Nome da pasta dentro de `manuscrito/`. */
  dir: string;
  scenes: Scene[];
}

export interface Scene {
  id: string;
  title: string;
  /** Nome do arquivo .md dentro da pasta do capítulo. */
  file: string;
}

export const NOTE_KINDS = [
  "personagens",
  "lugares",
  "ideias",
  "calendarios",
  "idiomas",
  "organizacoes",
] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export interface Note {
  id: string;
  title: string;
  kind: NoteKind;
  /** Nome do arquivo .md dentro de `notas/<tipo>/`. */
  file: string;
  /** Imagem da ficha (retrato, foto do lugar): `anexos/<arquivo>`. Opcional. */
  image?: string;
  /** Campos da ficha (veja manuscript/fields.ts). Opcional. */
  fields?: Record<string, string>;
}

/** Qualquer texto do projeto que abre no editor: uma cena ou uma nota. */
export interface DocRef {
  id: string;
  title: string;
  path: string;
  type: "scene" | NoteKind;
}

/** O que foi excluído, com o necessário para pôr de volta (veja vault/trash.ts). */
export type TrashItem =
  | { kind: "scene"; scene: Scene; chapter: { id: string; title: string }; index: number }
  | { kind: "chapter"; chapter: Chapter; index: number }
  | { kind: "note"; note: Note }
  | { kind: "attachment"; name: string }
  /**
   * Cópia de segurança (pastas guardadas antes de voltar para uma versão, cópias do
   * sync). Restaurar devolve os textos e anexos como itens novos (vault/backup.ts).
   */
  | { kind: "backup"; label: string };

/** Operação de arquivo que precisa acompanhar uma mudança na estrutura. */
export type FsOp =
  | { kind: "move"; from: string; to: string }
  | { kind: "trash"; path: string; sceneIds: string[]; item: TrashItem };

export interface TreeChange {
  project: Project;
  ops: FsOp[];
}
