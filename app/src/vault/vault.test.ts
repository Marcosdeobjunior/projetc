import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { prosemirrorJSONToYDoc } from "@tiptap/y-tiptap";
import { KeyValueFs, MemoryStore } from "../platform/kvFs";
import { applyOps, createVault, loadProject, loadSceneDoc, saveScene } from "./vault";
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

  it("grava a cena em .md e em Yjs, e reabre igual", async () => {
    const fs = fsFor();
    const p = await createVault(fs, "x");
    const sc = p.chapters[0]!.scenes[0]!;
    const doc = prosemirrorJSONToYDoc(
      textSchema,
      {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Era uma vez." }] }],
      },
      YDOC_FIELD,
    );
    const { words } = await saveScene(fs, p, sc.id, doc);
    expect(words).toBe(3);
    expect(await fs.readText(scenePath(p.chapters[0]!, sc))).toBe(
      `---\nid: ${sc.id}\ntitle: "Cena 1"\n---\n\nEra uma vez.\n`,
    );
    const again = await loadSceneDoc(fs, p, sc.id);
    expect(Y.encodeStateAsUpdate(again)).toEqual(Y.encodeStateAsUpdate(doc));
  });

  it("se o .md foi editado fora do app, o .md prevalece", async () => {
    const fs = fsFor();
    const p = await createVault(fs, "x");
    const ch = p.chapters[0]!;
    const sc = ch.scenes[0]!;
    await saveScene(
      fs,
      p,
      sc.id,
      prosemirrorJSONToYDoc(
        textSchema,
        {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "antigo" }] }],
        },
        YDOC_FIELD,
      ),
    );
    await fs.writeText(scenePath(ch, sc), "---\nid: x\n---\n\nnovo *texto*\n");
    const doc = await loadSceneDoc(fs, p, sc.id);
    expect(doc.getXmlFragment(YDOC_FIELD).toString()).toContain("novo");
    expect(doc.getXmlFragment(YDOC_FIELD).toString()).not.toContain("antigo");
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
        const doc = await loadSceneDoc(fs, p, s.id);
        expect(doc.getXmlFragment(YDOC_FIELD).length).toBeGreaterThan(0);
      }
    }
  });
});
