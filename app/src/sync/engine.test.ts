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
  ensureFolderTitle,
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
  renamed: [string, string][] = [];
  async renameFolder(id: string, name: string) {
    this.renamed.push([id, name]);
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
    expect(entry!.title).toBe("“Cena 1” — cópia do Drive antes de juntar as edições (confira)");
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
      "“cena-1.md” (excluído em outro computador)",
    ]);
  });

  it("duas cenas novas com o mesmo nome, uma em cada computador, ficam separadas", async () => {
    const { a, b, drive } = await twoComputers();
    let sa = "";
    let sb = "";
    await change(a, (p) => {
      const r = addScene(p, p.chapters[0]!.id, "Cena 2");
      sa = r.scene.id;
      return r;
    });
    await change(b, (p) => {
      const r = addScene(p, p.chapters[0]!.id, "Cena 2");
      sb = r.scene.id;
      return r;
    });
    await type(a, sa, "Texto de A.");
    await type(b, sb, "Texto de B.");
    await sync(a, drive);
    await sync(b, drive);
    await sync(a, drive);
    for (const fs of [a, b]) {
      const p = await loadProject(fs);
      const files = p.chapters[0]!.scenes.map((s) => s.file);
      expect(new Set(files).size).toBe(files.length);
      expect(await readSceneFile(fs, p, sa)).toContain("Texto de A.");
      expect(await readSceneFile(fs, p, sb)).toContain("Texto de B.");
    }
  });

  it("uma cena excluída lá mas editada aqui continua no projeto", async () => {
    const { a, b, drive, scene } = await twoComputers();
    await change(b, (p) => removeScene(p, scene));
    await type(a, scene, "Edição importante.");
    await sync(b, drive);
    await sync(a, drive);
    const p = await loadProject(a);
    expect(await readSceneFile(a, p, scene)).toContain("Edição importante.");
  });

  it("não sobrescreve o que foi salvo enquanto a sincronização planejava", async () => {
    const { a, b, drive, scene } = await twoComputers();
    await type(b, scene, "Edição em B.");
    await sync(b, drive);
    const state = (await readSyncState(a))!;
    const plan = await planSync(a, drive, state, await a.walk(), await loadProject(a));
    await type(a, scene, "Digitado durante a sincronização.");
    const r = await applySync(a, drive, state, plan);
    await writeSyncState(a, r.state);
    const md = (await readSceneFile(a, await loadProject(a), scene))!;
    expect(md).toContain("Digitado durante a sincronização.");
    expect(md).toContain("Edição em B.");
  });

  it("um .md editado fora do app vai para a lixeira antes de ser refeito", async () => {
    const { a, b, drive, scene } = await twoComputers();
    await type(b, scene, "Edição em B.");
    await sync(b, drive);
    const p = await loadProject(a);
    const path = p.chapters[0]!.scenes[0]!.file;
    const full = `manuscrito/${p.chapters[0]!.dir}/${path}`;
    await a.writeText(full, (await a.readText(full)) + "\nEditado no Obsidian.\n");
    const r = await sync(a, drive);
    expect(r.keptBoth).toBe(1);
    const [entry] = await listTrash(a);
    expect(await a.readText(entry!.path)).toContain("Editado no Obsidian.");
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

describe("nome da pasta no Drive", () => {
  const state: SyncState = {
    folderId: "pasta",
    base: {},
    cache: {},
    projectBase: null,
    lastSync: null,
    folderTitle: "Livro",
  };

  it("renomeia a pasta quando o projeto mudou de nome, e só uma vez", async () => {
    const drive = new FakeDrive();
    const next = await ensureFolderTitle(drive, state, "Livro novo");
    expect(drive.renamed).toEqual([["pasta", "Livro novo"]]);
    expect(next.folderTitle).toBe("Livro novo");
    expect(await ensureFolderTitle(drive, next, "Livro novo")).toBe(next);
    expect(drive.renamed).toHaveLength(1);
  });

  it("estado antigo, sem nome guardado, recebe o nome atual", async () => {
    const drive = new FakeDrive();
    const old: SyncState = { ...state, folderTitle: undefined };
    const next = await ensureFolderTitle(drive, old, "Livro");
    expect(drive.renamed).toEqual([["pasta", "Livro"]]);
    expect(next.folderTitle).toBe("Livro");
  });
});
