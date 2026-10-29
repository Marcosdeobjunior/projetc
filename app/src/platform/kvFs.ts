import type { VaultFs } from "./types";

/** Armazenamento chave-valor mínimo usado pelo vault do navegador. */
export interface KeyValueStore {
  get(key: string): Promise<string | Uint8Array | undefined>;
  set(key: string, value: string | Uint8Array): Promise<void>;
  delete(keys: string[]): Promise<void>;
  keys(prefix: string): Promise<string[]>;
}

export class MemoryStore implements KeyValueStore {
  private map = new Map<string, string | Uint8Array>();
  async get(key: string) {
    return this.map.get(key);
  }
  async set(key: string, value: string | Uint8Array) {
    this.map.set(key, value);
  }
  async delete(keys: string[]) {
    for (const k of keys) this.map.delete(k);
  }
  async keys(prefix: string) {
    return [...this.map.keys()].filter((k) => k.startsWith(prefix));
  }
}

const SEP = "\u0000";

function normalizePath(path: string): string {
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") throw new Error(`Caminho inválido: ${path}`);
    parts.push(part);
  }
  return parts.join("/");
}

/**
 * Sistema de arquivos simulado sobre um armazenamento chave-valor.
 * As pastas são implícitas: existem enquanto houver arquivos dentro delas.
 */
export class KeyValueFs implements VaultFs {
  constructor(
    private store: KeyValueStore,
    private root: string,
  ) {}

  private key(path: string) {
    return this.root + SEP + normalizePath(path);
  }

  private async filesUnder(path: string): Promise<string[]> {
    const p = normalizePath(path);
    const prefix = this.root + SEP + (p ? p + "/" : "");
    return this.store.keys(prefix);
  }

  async readText(path: string) {
    const v = await this.store.get(this.key(path));
    if (v === undefined) return null;
    return typeof v === "string" ? v : new TextDecoder().decode(v);
  }

  async writeText(path: string, data: string) {
    await this.store.set(this.key(path), data);
  }

  async readBytes(path: string) {
    const v = await this.store.get(this.key(path));
    if (v === undefined) return null;
    return typeof v === "string" ? new TextEncoder().encode(v) : v;
  }

  async writeBytes(path: string, data: Uint8Array) {
    await this.store.set(this.key(path), data.slice());
  }

  async exists(path: string) {
    if ((await this.store.get(this.key(path))) !== undefined) return true;
    return (await this.filesUnder(path)).length > 0;
  }

  async rename(from: string, to: string) {
    const src = this.key(from);
    const dst = this.key(to);
    const single = await this.store.get(src);
    if (single !== undefined) {
      await this.store.set(dst, single);
      await this.store.delete([src]);
      return;
    }
    const keys = await this.filesUnder(from);
    for (const k of keys) {
      const v = await this.store.get(k);
      if (v !== undefined) await this.store.set(dst + k.slice(src.length), v);
    }
    await this.store.delete(keys);
  }

  async remove(path: string) {
    const keys = await this.filesUnder(path);
    await this.store.delete([this.key(path), ...keys]);
  }
}

export function vaultRootsIn(keys: string[], marker: string): string[] {
  const roots = new Set<string>();
  for (const k of keys) {
    const i = k.indexOf(SEP);
    if (i > 0 && k.slice(i + 1) === marker) roots.add(k.slice(0, i));
  }
  return [...roots];
}
