/**
 * Acesso a arquivos dentro de um vault. Todos os caminhos são relativos à
 * raiz do vault e usam "/" como separador, em qualquer sistema.
 */
export interface VaultFs {
  readText(path: string): Promise<string | null>;
  writeText(path: string, data: string): Promise<void>;
  readBytes(path: string): Promise<Uint8Array | null>;
  writeBytes(path: string, data: Uint8Array): Promise<void>;
  exists(path: string): Promise<boolean>;
  /** Move um arquivo ou pasta. Cria as pastas de destino se preciso. */
  rename(from: string, to: string): Promise<void>;
  /** Remove um arquivo ou uma pasta inteira. */
  remove(path: string): Promise<void>;
}

export interface VaultRef {
  /** Caminho da pasta no desktop, ou identificador interno no navegador. */
  root: string;
  title: string;
  /** Texto curto mostrado abaixo do título (ex.: caminho da pasta). */
  location: string;
  openedAt?: number;
}

export interface Platform {
  kind: "desktop" | "browser";
  /** Onde criar um novo vault. Devolve a raiz escolhida ou null se cancelado. */
  chooseNewVaultRoot(folderName: string): Promise<string | null>;
  /**
   * Escolhe uma pasta no computador. Só existe no desktop. `isProject` diz se
   * ela já é um projeto do InkFlow (tem `.inkflow/project.json`).
   */
  chooseFolder?(): Promise<ChosenFolder | null>;
  knownVaults(): Promise<VaultRef[]>;
  rememberVault(ref: VaultRef): Promise<void>;
  /** Tira o vault da lista. No navegador também apaga os arquivos. */
  forgetVault(root: string): Promise<void>;
  fs(root: string): VaultFs;
  /**
   * Chama `beforeClose` quando o usuário fecha a janela do app. Se devolver
   * false, a janela continua aberta. Só existe no desktop; no navegador o
   * editor grava ao esconder a página.
   */
  onClose?(beforeClose: () => Promise<boolean>): void;
}

export interface ChosenFolder {
  root: string;
  /** Nome da pasta, para sugerir como título do projeto. */
  name: string;
  isProject: boolean;
}

export class PlatformError extends Error {}
