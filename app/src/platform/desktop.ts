import { invoke } from "@tauri-apps/api/core";
import { basename, join } from "@tauri-apps/api/path";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { Platform, VaultFs, VaultRef } from "./types";
import { PlatformError } from "./types";
import { PROJECT_FILE } from "../vault/paths";

const RECENT_KEY = "inkflow.recentVaults";

function readRecent(): VaultRef[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as VaultRef[];
  } catch {
    return [];
  }
}

function writeRecent(list: VaultRef[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 12)));
  } catch {
    // sem armazenamento: a lista de recentes só não é lembrada
  }
}

/** Arquivos do vault lidos e gravados pelos comandos Rust (src-tauri/src/vault.rs). */
class TauriFs implements VaultFs {
  constructor(private root: string) {}

  readText(path: string) {
    return invoke<string | null>("vault_read_text", { root: this.root, path });
  }

  writeText(path: string, data: string) {
    return invoke<void>("vault_write_text", { root: this.root, path, data });
  }

  async readBytes(path: string) {
    const exists = await this.exists(path);
    if (!exists) return null;
    const buf = await invoke<ArrayBuffer>("vault_read_bytes", { root: this.root, path });
    return new Uint8Array(buf);
  }

  writeBytes(path: string, data: Uint8Array) {
    return invoke<void>("vault_write_bytes", data, {
      headers: {
        "x-root": encodeURIComponent(this.root),
        "x-path": encodeURIComponent(path),
      },
    });
  }

  exists(path: string) {
    return invoke<boolean>("vault_exists", { root: this.root, path });
  }

  walk() {
    return invoke<{ path: string; size: number; mtime: number }[]>("vault_walk", {
      root: this.root,
    });
  }

  list(dir: string) {
    return invoke<string[]>("vault_list", { root: this.root, path: dir });
  }

  rename(from: string, to: string) {
    return invoke<void>("vault_rename", { root: this.root, from, to });
  }

  remove(path: string) {
    return invoke<void>("vault_remove", { root: this.root, path });
  }
}

export function createDesktopPlatform(): Platform {
  return {
    kind: "desktop",

    async chooseNewVaultRoot(folderName: string) {
      const parent = await open({
        directory: true,
        title: "Escolha onde criar a pasta do projeto",
      });
      if (typeof parent !== "string") return null;
      const root = await join(parent, folderName);
      if (await new TauriFs(root).exists("")) {
        throw new PlatformError(
          `Já existe uma pasta chamada "${folderName}" nesse local. Escolha outro nome ou outro local.`,
        );
      }
      return root;
    },

    async chooseFolder() {
      const root = await open({ directory: true, title: "Abrir projeto existente" });
      if (typeof root !== "string") return null;
      return {
        root,
        name: await basename(root),
        isProject: await new TauriFs(root).exists(PROJECT_FILE),
      };
    },

    async knownVaults() {
      return readRecent();
    },

    async rememberVault(ref: VaultRef) {
      writeRecent([ref, ...readRecent().filter((r) => r.root !== ref.root)]);
    },

    async forgetVault(root: string) {
      writeRecent(readRecent().filter((r) => r.root !== root));
    },

    fs(root: string) {
      return new TauriFs(root);
    },

    async saveFile(name, data, filter) {
      const path = await save({ defaultPath: name, filters: [filter], title: "Exportar" });
      if (!path) return false;
      await invoke<void>("export_write", data, {
        headers: { "x-path": encodeURIComponent(path) },
      });
      return true;
    },

    openFile(root: string, path: string) {
      return invoke<void>("vault_open", { root, path });
    },

    onClose(beforeClose) {
      void getCurrentWindow().onCloseRequested(async (event) => {
        if (!(await beforeClose())) event.preventDefault();
      });
    },
  };
}
