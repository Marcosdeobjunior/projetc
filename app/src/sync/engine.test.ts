import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { KeyValueFs, MemoryStore } from "../platform/kvFs";
import { addNote, addScene, removeScene } from "../manuscript/tree";
import type { Project, TreeChange } from "../manuscript/types";
import {
  applyOps,
  createVault,
  loadProject,
  loadSceneDoc,
  readSceneFile,
  saveProject,
  saveScene,
} from "../vault/vault";
import { listVersions, saveVersion } from "../vault/history";
import { listTrash } from "../vault/trash";
import { YDOC_FIELD } from "../editor/extensions";
import { md5 } from "./md5";
import type { Drive, RemoteFile, RemoteProject } from "./drive";
import {
  applySync,
  decide,
  planSync,
  readSyncState,
  writeSyncState,
  type SyncState,
} from "./engine";

/** Google Drive falso, em memória. */
class FakeDrive implements Drive {
  files = new Map<string, { path: string; data: Uint8Array; folder: string }>();
  private next = 1;
  async email() {
    return "ana@example.com";
  }
  async projectFolder() {
    return "pasta";
  }
  async listProjects(): Promise<RemoteProject[]> {
    return [];
  }
  async list(folder: string) {
    const out = new Map<string, RemoteFile>();
    for (const [id, f] of this.files)
      if (f.folder === folder) out.set(f.path, { id, path: f.path, md5: md5(f.data) });
    return out;
  }
  async download(id: string) {
    return this.files.get(id)!.data.slice();
  }
  async upload(folder: string, path: string, data: Uint8Array, id?: string) {
    const fileId = id ?? `f${this.next++}`;
    this.files.set(fileId, { path, data: data.slice(), folder });
    return { id: fileId, path, md5: md5(data) };
  }
  async remove(id: string) {
    this.files.delete(id);
  }
}

async function sync(fs: KeyValueFs, drive: Drive) {
  const state: SyncState = (await readSyncState(fs)) ?? {
    folderId: "pasta",
    base: {},
    cache: {},
    projectBase: null,
    lastSync: null,
  };
  const project = (await fs.exists(".inkflow/project.json")) ? await loadProject(fs) : null;
  const plan = await planSync(
    fs,
    drive,
    state,
    await fs.walk(),
    project ?? ({ chapters: [], notes: [] } as unknown as Project),
  );
  const result = await applySync(fs, drive, state, plan);
  await writeSyncState(fs, result.state);
  return result;
}

/** Escreve numa cena como o editor faz: muda o Y.Doc e salva .yjs + .md. */
async function type(fs: KeyValueFs, sceneId: string, text: string, at: "start" | "end" = "end") {
  const project = await loadProject(fs);
  const loaded = await loadSceneDoc(fs, project, sceneId);
  const frag = loaded.doc.getXmlFragment(YDOC_FIELD);
  const p = new Y.XmlElement("paragraph");
  p.insert(0, [new Y.XmlText(text)]);
  frag.insert(at === "start" ? 0 : frag.length, [p]);
  await saveScene(fs, project, sceneId, loaded.doc, loaded.diskText);
}

async function change(fs: KeyValueFs, edit: (p: Project) => TreeChange) {
  const r = edit(await loadProject(fs));
  await applyOps(fs, r.ops);
  await saveProject(fs, r.project);
  return r.project;
}

async function twoComputers() {
  const drive = new FakeDrive();
  const a = new KeyValueFs(new MemoryStore(), "a");
  const b = new KeyValueFs(new MemoryStore(), "b");
  const project = await createVault(a, "Livro");
  const scene = project.chapters[0]!.scenes[0]!.id;
  await type(a, scene, "Primeira frase.");
  await sync(a, drive);
  await sync(b, drive); // o outro computador baixa o projeto
  return { drive, a, b, scene };
}

describe("sincronização", () => {
  it("envia o projeto e outro computador baixa igual", async () => {
    const { a, b, scene } = await twoComputers();
    expect(await readSceneFile(b, await loadProject(b), scene)).toContain("Primeira frase.");
    const files = async (fs: KeyValueFs) =>
      (await fs.walk()).map((f) => f.path).filter((p) => !p.startsWith(".inkflow/sync"));
    expect(await files(b)).toEqual(await files(a));
  });

  it("nada a fazer quando nada mudou", async () => {
    const { a, drive } = await twoComputers();
    const r = await sync(a, drive);
    expect([r.uploaded, r.downloaded, r.changed]).toEqual([0, 0, false]);
  });

  it("mescla edições no mesmo texto feitas nos dois computadores", async () => {
    const { a, b, drive, scene } = await twoComputers();
    await type(a, scene, "Escrito no notebook.");
    await type(b, scene, "Escrito no PC.", "start");
    await sync(a, drive);
    const r = await sync(b, drive);
    expect(r.merged).toBeGreaterThan(0);
    await sync(a, drive);
    for (const fs of [a, b]) {
      const md = (await readSceneFile(fs, await loadProject(fs), scene))!;
      expect(md).toContain("Primeira frase.");
      expect(md).toContain("Escrito no notebook.");
      expect(md).toContain("Escrito no PC.");
    }
    expect(await listTrash(b)).toEqual([]); // nada ficou de fora
  });

  it("se a mescla deixar um parágrafo de fora, guarda aquela versão na lixeira", async () => {
    const { a, b, drive, scene } = await twoComputers();
    // B acrescenta texto dentro do parágrafo; A apaga e reescreve o parágrafo inteiro.
    {
      const project = await loadProject(b);
      const loaded = await loadSceneDoc(b, project, scene);
      const text = loaded.doc.getXmlFragment(YDOC_FIELD).get(0) as Y.XmlElement;
      (text.get(0) as Y.XmlText).insert("Primeira frase.".length, " Acréscimo do PC.");
      await saveScene(b, project, scene, loaded.doc, loaded.diskText);
    }
    {
      const project = await loadProject(a);
      const loaded = await loadSceneDoc(a, project, scene);
      const frag = loaded.doc.getXmlFragment(YDOC_FIELD);
      frag.delete(0, 1);
      const p = new Y.XmlElement("paragraph");
      p.insert(0, [new Y.XmlText("Reescrito no notebook.")]);
      frag.insert(0, [p]);
      await saveScene(a, project, scene, loaded.doc, loaded.diskText);
    }
    await sync(b, drive);
    const r = await sync(a, drive);
    expect(r.keptBoth).toBe(1);
    const [entry] = await listTrash(a);
    expect(entry!.title).toBe('"Cena 1" — versão do Drive antes de mesclar (conferir)');
    expect(await a.readText(entry!.path)).toContain("Acréscimo do PC.");
  });

  it("junta mudanças na estrutura e leva exclusões para a lixeira do outro lado", async () => {
    const { a, b, drive, scene } = await twoComputers();
    await change(a, (p) => addScene(p, p.chapters[0]!.id, "Nova no notebook"));
    await change(b, (p) => addNote(p, "personagens", "Helena"));
    await sync(a, drive);
    await sync(b, drive);
    await sync(a, drive);
    const pa = await loadProject(a);
    const pb = await loadProject(b);
    for (const p of [pa, pb]) {
      expect(p.chapters[0]!.scenes.map((s) => s.title)).toEqual(["Cena 1", "Nova no notebook"]);
      expect(p.notes.map((n) => n.title)).toEqual(["Helena"]);
    }

    await change(a, (p) => removeScene(p, scene));
    await sync(a, drive);
    await sync(b, drive);
    expect((await loadProject(b)).chapters[0]!.scenes.map((s) => s.title)).toEqual([
      "Nova no notebook",
    ]);
    expect((await listTrash(b)).map((e) => e.title)).toEqual([
      "manuscrito/capitulo-1/cena-1.md (excluído em outro computador)",
    ]);
  });

  it("o histórico de versões vai junto", async () => {
    const { a, b, drive } = await twoComputers();
    await saveVersion(a, await loadProject(a), { label: "Rascunho do notebook", auto: false });
    await sync(a, drive);
    await sync(b, drive);
    expect((await listVersions(b)).map((v) => v.label)).toEqual(["Rascunho do notebook"]);
  });

  it("decide pelo lado que mudou desde a última sincronização", () => {
    const r = (md5: string): RemoteFile => ({ id: "x", path: "p", md5 });
    const kinds = (l: string | null, rm: string | null, b: string | null) =>
      decide(
        new Map(l ? [["p", l]] : []),
        new Map(rm ? [["p", r(rm)]] : []),
        b ? { p: b } : {},
      ).map((a) => a.kind);
    expect(kinds("1", "1", null)).toEqual(["same"]);
    expect(kinds("1", "2", "1")).toEqual(["download"]);
    expect(kinds("2", "1", "1")).toEqual(["upload"]);
    expect(kinds("2", "3", "1")).toEqual(["merge"]);
    expect(kinds(null, "1", "1")).toEqual(["deleteRemote"]);
    expect(kinds("1", null, "1")).toEqual(["deleteLocal"]);
    expect(kinds(null, "2", "1")).toEqual(["download"]);
    expect(kinds("2", null, "1")).toEqual(["upload"]);
    expect(kinds("1", null, null)).toEqual(["upload"]);
  });
});
