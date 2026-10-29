/**
 * Conteúdo de `.inkflow/project.json`. A ordem dos capítulos e das cenas vive
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

export const NOTE_KINDS = ["personagens", "lugares", "ideias"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export interface Note {
  id: string;
  title: string;
  kind: NoteKind;
  /** Nome do arquivo .md dentro de `notas/<tipo>/`. */
  file: string;
}

/** Qualquer texto do projeto que abre no editor: uma cena ou uma nota. */
export interface DocRef {
  id: string;
  title: string;
  path: string;
  type: "scene" | NoteKind;
}

/** Operação de arquivo que precisa acompanhar uma mudança na estrutura. */
export type FsOp =
  { kind: "move"; from: string; to: string } | { kind: "trash"; path: string; sceneIds: string[] };

export interface TreeChange {
  project: Project;
  ops: FsOp[];
}
