import { beforeEach, describe, expect, it, vi } from "vitest";
import { KeyValueFs, MemoryStore } from "../platform/kvFs";
import type { ChosenFolder, Platform } from "../platform/types";
import { createVault } from "../vault/vault";
import { listVersions } from "../vault/history";

const CLOSE = "Ao fechar o projeto";

let store: MemoryStore;
let onClose: (() => Promise<boolean>) | null;
let chosen: ChosenFolder | null;
let roots: number;

const platform: Platform = {
  kind: "browser",
  chooseNewVaultRoot: async () => `vault-${++roots}`,
  chooseFolder: async () => chosen,
  knownVaults: async () => [],
  rememberVault: async () => {},
  forgetVault: async () => {},
  fs: (root) => new KeyValueFs(store, root),
  saveFile: async () => true,
  openFile: async () => {},
  onClose: (fn) => {
    onClose = fn;
  },
};

vi.mock("../platform", () => ({ createPlatform: async () => platform }));

async function freshStore() {
  vi.resetModules();
  const { useApp } = await import("./store");
  await useApp.getState().init();
  return useApp;
}

/** Abre um projeto novo e muda o título, para a versão de fechamento ter o que guardar. */
async function openEdited(useApp: Awaited<ReturnType<typeof freshStore>>) {
  const result = await useApp.getState().createVault("Livro");
  if (!result.ok) throw new Error("não criou o projeto");
  await useApp.getState().change((p) => ({ project: { ...p, title: "Livro novo" }, ops: [] }));
  return result.root;
}

async function labels(root: string) {
  return (await listVersions(platform.fs(root))).map((v) => v.label);
}

describe("sair do projeto", () => {
  beforeEach(() => {
    store = new MemoryStore();
    onClose = null;
    chosen = null;
    roots = 0;
  });

  it("fechar a janela guarda a versão de fechamento", async () => {
    const useApp = await freshStore();
    const root = await openEdited(useApp);
    expect(await onClose!()).toBe(true);
    expect((await labels(root))[0]).toBe(CLOSE);
  });

  it("abrir uma pasta que não é projeto guarda a versão antes de sair", async () => {
    const useApp = await freshStore();
    const root = await openEdited(useApp);
    chosen = { root: "pasta-comum", name: "Pasta comum", isProject: false };
    await useApp.getState().openExistingFolder();
    expect(useApp.getState().session).toBeNull();
    expect(useApp.getState().folderToConvert).toEqual(chosen);
    expect((await labels(root))[0]).toBe(CLOSE);
  });

  it("abrir outro projeto pelo menu guarda a versão do atual", async () => {
    const useApp = await freshStore();
    await createVault(platform.fs("outro"), "Outro");
    const root = await openEdited(useApp);
    chosen = { root: "outro", name: "Outro", isProject: true };
    await useApp.getState().openExistingFolder();
    expect(useApp.getState().session?.root).toBe("outro");
    expect((await labels(root))[0]).toBe(CLOSE);
  });

  it("escolher a pasta do próprio projeto aberto não fecha nada", async () => {
    const useApp = await freshStore();
    const root = await openEdited(useApp);
    chosen = { root, name: "Livro", isProject: true };
    await useApp.getState().openExistingFolder();
    expect(useApp.getState().session?.root).toBe(root);
    expect(await labels(root)).not.toContain(CLOSE);
  });
});
