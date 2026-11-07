import { describe, expect, it } from "vitest";
import { KeyValueFs, MemoryStore } from "../platform/kvFs";
import { addChapter, addNote, addScene, allDocs, findDoc } from "../manuscript/tree";
import type { Project } from "../manuscript/types";
import { splitFrontmatter } from "../markdown/parse";
import { applyOps, createVault, readSceneFile, sceneFile, writeSceneMarkdown } from "./vault";
import { listTrash, moveToTrash, saveToTrash, type TrashEntry } from "./trash";
import { readVersion, restoreProjectFiles, saveVersion } from "./history";
import { RECOVERED_CHAPTER, backupRestorePlan, readBackup, restorable } from "./backup";

const enc = (s: string) => new TextEncoder().encode(s);

async function setup() {
  const fs = new KeyValueFs(new MemoryStore(), "v");
  let p = await createVault(fs, "Livro");
  const ch = addChapter(p, "Parte dois");
  const s = addScene(ch.project, ch.chapter.id, "Chegada");
  const n = addNote(s.project, "personagens", "Helena");
  p = n.project;
  for (const d of allDocs(p)) await writeSceneMarkdown(fs, p, d.id, `Texto de ${d.title}.\n`);
  return { fs, p, scene: s.scene, chapter: ch.chapter, note: n.note };
}

/** Aplica o plano como o app faz: estrutura, arquivos novos e anexos. */
async function restore(fs: KeyValueFs, p: Project, entry: TrashEntry) {
  const contents = await readBackup(fs, entry);
  const plan = backupRestorePlan(p, contents, await fs.list("anexos"));
  await applyOps(
    fs,
    plan.moves.map((m) => ({ kind: "move", ...m })),
  );
  for (const t of plan.texts) await writeSceneMarkdown(fs, plan.project, t.id, t.body);
  return { contents, plan, project: plan.project };
}

const titlesIn = (p: Project, chapterTitle: string) =>
  p.chapters.find((c) => c.title === chapterTitle)?.scenes.map((s) => s.title);

describe("cópias de segurança da lixeira", () => {
  it("texto editado fora do app volta como cena nova logo abaixo da original", async () => {
    const { fs, p, scene, chapter } = await setup();
    const doc = findDoc(p, scene.id)!;
    await saveToTrash(
      fs,
      doc.path,
      enc(sceneFile(doc, "Versão de fora.\n")),
      `"Chegada" — editado fora do app antes de sincronizar`,
    );
    const [entry] = await listTrash(fs);
    const { project, plan } = await restore(fs, p, entry!);
    expect(titlesIn(project, chapter.title)).toEqual(["Chegada", "Chegada (cópia de segurança)"]);
    const body = async (id: string) =>
      splitFrontmatter((await readSceneFile(fs, project, id)) ?? "").body;
    expect(await body(plan.openId!)).toBe("\nVersão de fora.\n");
    // O original não muda.
    expect(await body(scene.id)).toBe("\nTexto de Chegada.\n");
  });

  it("cópia de um lado do conflito (sem cabeçalho) acha o original pelo título", async () => {
    const { fs, p, chapter } = await setup();
    await saveToTrash(
      fs,
      "chegada.md",
      enc("Lado do Drive.\n"),
      "“Chegada” — cópia do Drive antes de juntar as edições (confira)",
    );
    const [entry] = await listTrash(fs);
    const { project } = await restore(fs, p, entry!);
    expect(titlesIn(project, chapter.title)).toEqual(["Chegada", "Chegada (cópia de segurança)"]);
  });

  it("cópia de uma nota volta como nota nova do mesmo tipo", async () => {
    const { fs, p, note } = await setup();
    const doc = findDoc(p, note.id)!;
    await saveToTrash(fs, doc.path, enc(sceneFile(doc, "Outra Helena.\n")), "nota");
    const [entry] = await listTrash(fs);
    const { project } = await restore(fs, p, entry!);
    expect(project.notes.map((n) => [n.kind, n.title])).toEqual([
      ["personagens", "Helena"],
      ["personagens", "Helena (cópia de segurança)"],
    ]);
  });

  it("texto que não existe mais no projeto vai para o capítulo de recuperados", async () => {
    const { fs, p } = await setup();
    const gone = { id: "sc_sumiu", title: "Epílogo" };
    await fs.writeText("manuscrito/parte-dois/epilogo.md", sceneFile(gone, "Fim.\n"));
    await moveToTrash(fs, "manuscrito/parte-dois/epilogo.md", {
      kind: "backup",
      label: "“epilogo.md” (excluído em outro computador)",
    });
    const [entry] = await listTrash(fs);
    const { project } = await restore(fs, p, entry!);
    expect(titlesIn(project, RECOVERED_CHAPTER)).toEqual(["Epílogo (cópia de segurança)"]);
  });

  it("pastas de antes de voltar para uma versão viram capítulos e notas recuperados", async () => {
    const { fs, p, chapter } = await setup();
    const info = await saveVersion(fs, p, { label: "Começo", auto: false });
    const restoredProject = await restoreProjectFiles(fs, (await readVersion(fs, info!.id))!);
    const entries = await listTrash(fs);
    const manuscript = entries.find((e) => e.title.startsWith("Manuscrito"))!;
    const notes = entries.find((e) => e.title.startsWith("Notas"))!;

    const m = await restore(fs, restoredProject, manuscript);
    expect(titlesIn(m.project, `${chapter.title} (recuperado)`)).toEqual(["Chegada"]);
    expect(m.project.chapters).toHaveLength(restoredProject.chapters.length + 2);

    const n = await restore(fs, m.project, notes);
    // Já existe uma Helena (a da versão): a recuperada ganha o sufixo.
    expect(n.project.notes.map((x) => x.title)).toEqual(["Helena", "Helena (recuperado)"]);
  });

  it("anexos voltam para anexos/ e arquivos técnicos ficam de fora", async () => {
    const { fs, p } = await setup();
    await fs.writeBytes("anexos/mapa.png", new Uint8Array([1]));
    await saveToTrash(fs, "anexos/mapa.png", new Uint8Array([2]), "mapa do Drive");
    await saveToTrash(
      fs,
      ".inkflow/project.json",
      enc("{"),
      "project.json do Drive (com problema)",
    );
    const [technical, image] = await listTrash(fs);

    const t = await readBackup(fs, technical!);
    expect(restorable(t)).toBe(false);
    expect(t.other).toHaveLength(1);

    const { plan } = await restore(fs, p, image!);
    expect(plan.moves.map((x) => x.to)).toEqual(["anexos/mapa-2.png"]);
    expect(await fs.readBytes("anexos/mapa-2.png")).toEqual(new Uint8Array([2]));
    expect(await fs.readBytes("anexos/mapa.png")).toEqual(new Uint8Array([1]));
  });
});
