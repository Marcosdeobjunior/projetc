import { IdbStore } from "./idbStore";
import { KeyValueFs, MemoryStore, vaultRootsIn, type KeyValueStore } from "./kvFs";
import type { Platform, VaultRef } from "./types";
import { LEGACY_PROJECT_FILE, PROJECT_FILE } from "../vault/paths";
import { migrateLegacyMeta } from "../vault/legacy";

/**
 * Modo navegador: os projetos ficam no IndexedDB deste navegador.
 * Se o IndexedDB não estiver disponível (ex.: janela anônima), usa a memória.
 */
export async function createBrowserPlatform(): Promise<Platform & { persistent: boolean }> {
  let store: KeyValueStore;
  let persistent = true;
  try {
    store = await IdbStore.open();
  } catch {
    store = new MemoryStore();
    persistent = false;
  }

  return {
    kind: "browser",
    persistent,

    async chooseNewVaultRoot() {
      return `browser:${crypto.randomUUID()}`;
    },

    async knownVaults() {
      const keys = await store.keys("");
      const roots = new Set([
        ...vaultRootsIn(keys, PROJECT_FILE),
        ...vaultRootsIn(keys, LEGACY_PROJECT_FILE),
      ]);
      const refs: VaultRef[] = [];
      for (const root of roots) {
        const fs = new KeyValueFs(store, root);
        await migrateLegacyMeta(fs);
        const raw = await fs.readText(PROJECT_FILE);
        try {
          const p = JSON.parse(raw ?? "{}") as { title?: string; updatedAt?: number };
          refs.push({
            root,
            title: p.title ?? "Sem título",
            location: "Salvo neste navegador",
            openedAt: p.updatedAt,
          });
        } catch {
          // project.json corrompido: não lista
        }
      }
      return refs.sort((a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0));
    },

    async rememberVault() {
      // No navegador a lista vem dos próprios arquivos.
    },

    async forgetVault(root: string) {
      await store.delete(await store.keys(root + "\u0000"));
    },

    fs(root: string) {
      return new KeyValueFs(store, root);
    },

    async saveFile(name, data) {
      const url = URL.createObjectURL(new Blob([data as Uint8Array<ArrayBuffer>]));
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      return true;
    },

    async openFile(root: string, path: string) {
      const bytes = await new KeyValueFs(store, root).readBytes(path);
      if (!bytes) return;
      const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>]));
      const a = document.createElement("a");
      a.href = url;
      a.download = path.split("/").pop()!;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },
  };
}
