/**
 * Conteúdo de `.inkflow/project.json`. A ordem dos capítulos e das cenas vive
 * aqui; os textos ficam em `manuscrito/<pasta do capítulo>/<arquivo da cena>.md`.
 */
export interface Project {
  format: 1;
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  chapters: Chapter[];
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

/** Operação de arquivo que precisa acompanhar uma mudança na estrutura. */
export type FsOp =
  { kind: "move"; from: string; to: string } | { kind: "trash"; path: string; sceneIds: string[] };

export interface TreeChange {
  project: Project;
  ops: FsOp[];
}
