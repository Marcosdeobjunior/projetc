import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { prosemirrorJSONToYDoc } from "@tiptap/y-tiptap";
import { KeyValueFs, MemoryStore } from "../platform/kvFs";
import {
  applyOps,
  createVault,
  ExternalChangeError,
  loadProject,
  loadSceneDoc,
  rewriteSceneHeader,
  saveScene,
} from "./vault";
import { createSampleVault } from "./sample";
import { removeScene, renameScene, scenePath } from "../manuscript/tree";
import { textSchema, YDOC_FIELD } from "../editor/extensions";
import { ydocPath } from "./paths";

const fsFor = () => new KeyValueFs(new MemoryStore(), "browser:teste");

describe("KeyValueFs", () => {
  it("move e remove pastas implícitas", async () => {
    const fs = fsFor();
    await fs.writeText("a/b/c.md", "oi");
    await fs.writeText("a/d.md", "olá");
    expect(await fs.exists("a/b")).toBe(true);
    await fs.rename("a/b", "x/y");
    expect(await fs.readText("x/y/c.md")).toBe("oi");
    expect(await fs.exists("a/b")).toBe(false);
    await fs.remove("x");
    expect(await fs.exists("x/y/c.md")).toBe(false);
  });

  it("recusa caminhos que saem do vault", async () => {
    await expect(fsFor().readText("../fora.md")).rejects.toThrow();
  });
});

describe("vault", () => {
  it("cria e reabre um projeto", async () => {
    const fs = fsFor();
    const p = await createVault(fs, "A Casa das Marés");
    const loaded = await loadProject(fs);
    expect(loaded).toEqual(p);
    expect(await fs.exists("manuscrito/capitulo-1/cena-1.md")).toBe(true);
    expect(await fs.exists("LEIA-ME.md")).toBe(true);
  });

  const docWith = (text: string) =>
    prosemirrorJSONToYDoc(
      textSchema,
      { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] },
      YDOC_FIELD,
    );

  it("transformar uma pasta com arquivos em projeto não apaga nada", async () => {
    const fs = fsFor();
    await fs.writeText("LEIA-ME.md", "minhas anotações");
    await fs.writeText("rascunho antigo.md", "texto antigo");
    await createVault(fs, "Pasta Antiga");
    expect(await fs.readText("LEIA-ME.md")).toBe("minhas anotações");
    expect(await fs.readText("rascunho antigo.md")).toBe("texto antigo");
    expect((await loadProject(fs)).title).toBe("Pasta Antiga");
    await expect(createVault(fs, "de novo")).rejects.toThrow("já é um projeto");
  });

  it("grava a cena em .md e em Yjs, e reabre igual", async () => {
    const fs = fsFor();
    const p = await createVault(fs, "x");
    const sc = p.chapters[0]!.scenes[0]!;
    const before = await loadSceneDoc(fs, p, sc.id);
    const doc = docWith("Era uma vez.");
    const { words, written } = await saveScene(fs, p, sc.id, doc, before.diskText);
    expect(words).toBe(3);
    expect(written).toBe(`---\nid: ${sc.id}\ntitle: "Cena 1"\n---\n\nEra uma vez.\n`);
    expect(await fs.readText(scenePath(p.chapters[0]!, sc))).toBe(written);
    const again = await loadSceneDoc(fs, p, sc.id);
    expect(again.external).toBeNull();
    expect(Y.encodeStateAsUpdate(again.doc)).toEqual(Y.encodeStateAsUpdate(doc));
  });

  it("ao abrir, uma edição feita fora do app vem como texto externo", async () => {
    const fs = fsFor();
    const p = await createVault(fs, "x");
    const ch = p.chapters[0]!;
    const sc = ch.scenes[0]!;
    const { written } = await saveScene(
      fs,
      p,
      sc.id,
      docWith("antigo"),
      (await loadSceneDoc(fs, p, sc.id)).diskText,
    );
    await fs.writeText(scenePath(ch, sc), written.replace("antigo", "novo *texto*"));
    const loaded = await loadSceneDoc(fs, p, sc.id);
    // O doc Yjs continua o mesmo (histórico preservado); o texto novo é aplicado pelo editor.
    expect(loaded.doc.getXmlFragment(YDOC_FIELD).toString()).toContain("antigo");
    expect(JSON.stringify(loaded.external)).toContain("novo");
  });

  it("não grava por cima de uma edição feita fora do app", async () => {
    const fs = fsFor();
    const p = await createVault(fs, "x");
    const ch = p.chapters[0]!;
    const sc = ch.scenes[0]!;
    const loaded = await loadSceneDoc(fs, p, sc.id);
    const { written } = await saveScene(fs, p, sc.id, docWith("do app"), loaded.diskText);
    const outside = written.replace("do app", "escrito em outro editor");
    await fs.writeText(scenePath(ch, sc), outside);

    const err = await saveScene(fs, p, sc.id, docWith("do app, mais"), written).catch((e) => e);
    expect(err).toBeInstanceOf(ExternalChangeError);
    expect((err as ExternalChangeError).diskText).toBe(outside);
    expect(await fs.readText(scenePath(ch, sc))).toBe(outside);
  });

  it("renomear a cena (só o cabeçalho muda) não conta como edição externa", async () => {
    const fs = fsFor();
    const p = await createVault(fs, "x");
    const sc = p.chapters[0]!.scenes[0]!;
    const { written } = await saveScene(
      fs,
      p,
      sc.id,
      docWith("texto"),
      (await loadSceneDoc(fs, p, sc.id)).diskText,
    );
    const renamed = renameScene(p, sc.id, "A carta");
    await applyOps(fs, renamed.ops);
    await rewriteSceneHeader(fs, renamed.project, sc.id);
    await expect(
      saveScene(fs, renamed.project, sc.id, docWith("texto 2"), written),
    ).resolves.toBeTruthy();
  });

  it("arquivo apagado por fora é recriado sem conflito", async () => {
    const fs = fsFor();
    const p = await createVault(fs, "x");
    const ch = p.chapters[0]!;
    const sc = ch.scenes[0]!;
    const { written } = await saveScene(
      fs,
      p,
      sc.id,
      docWith("texto"),
      (await loadSceneDoc(fs, p, sc.id)).diskText,
    );
    await fs.remove(scenePath(ch, sc));
    await saveScene(fs, p, sc.id, docWith("texto"), written);
    expect(await fs.readText(scenePath(ch, sc))).toBe(written);
  });

  it("renomear e excluir movem os arquivos", async () => {
    const store = new MemoryStore();
    const fs = new KeyValueFs(store, "browser:teste");
    const p = await createVault(fs, "x");
    const sc = p.chapters[0]!.scenes[0]!;
    await fs.writeBytes(ydocPath(sc.id), new Uint8Array([1, 2, 3]));
    const renamed = renameScene(p, sc.id, "A carta");
    await applyOps(fs, renamed.ops);
    expect(await fs.exists("manuscrito/capitulo-1/a-carta.md")).toBe(true);
    const removed = removeScene(renamed.project, sc.id);
    await applyOps(fs, removed.ops);
    expect(await fs.exists("manuscrito/capitulo-1/a-carta.md")).toBe(false);
    const trash = await store.keys("browser:teste\u0000.inkflow/lixeira/");
    expect(trash.map((k) => k.replace(/^.*?Z-/, ""))).toEqual(
      expect.arrayContaining(["a-carta.md", `${sc.id}.yjs`]),
    );
  });

  it("projeto de exemplo abre com texto em todas as cenas", async () => {
    const fs = fsFor();
    const p = await createSampleVault(fs);
    expect(p.chapters.map((c) => c.title)).toEqual(["O começo", "A cidade"]);
    expect(await fs.exists("manuscrito/capitulo-1")).toBe(false);
    for (const c of p.chapters) {
      for (const s of c.scenes) {
        const { doc } = await loadSceneDoc(fs, p, s.id);
        expect(doc.getXmlFragment(YDOC_FIELD).length).toBeGreaterThan(0);
      }
    }
  });
});
