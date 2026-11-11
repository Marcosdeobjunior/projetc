import { describe, expect, it } from "vitest";
import { KeyValueFs, MemoryStore } from "../platform/kvFs";
import { createSampleVault } from "../vault/sample";
import { loadProject, saveProject, validNoteImage } from "../vault/vault";
import { mergeProjects } from "../sync/mergeProject";
import { addNoteImages, noteImages, removeNoteImage, setMainNoteImage, setNoteImage } from "./tree";

describe("imagem da ficha das notas", () => {
  it("troca e tira a imagem sem mexer em arquivos", async () => {
    const fs = new KeyValueFs(new MemoryStore(), "browser:teste");
    const p = await createSampleVault(fs);
    const id = p.notes[0]!.id;
    const a = setNoteImage(p, id, "anexos/helena.png");
    expect(a.ops).toEqual([]);
    expect(a.project.notes[0]!.image).toBe("anexos/helena.png");
    const b = setNoteImage(a.project, id, null);
    expect("image" in b.project.notes[0]!).toBe(false);
  });

  it("só aceita arquivos de anexos/", async () => {
    expect(validNoteImage("anexos/foto.jpg")).toBe(true);
    expect(validNoteImage("anexos/../segredo.txt")).toBe(false);
    expect(validNoteImage("anexos/a/b.png")).toBe(false);
    expect(validNoteImage("/etc/passwd")).toBe(false);
    const fs = new KeyValueFs(new MemoryStore(), "browser:teste");
    const p = await createSampleVault(fs);
    p.notes[0] = { ...p.notes[0]!, image: "../fora.png" };
    p.notes[1] = { ...p.notes[1]!, image: "anexos/ok.png" };
    await saveProject(fs, p);
    const loaded = await loadProject(fs);
    expect("image" in loaded.notes[0]!).toBe(false);
    expect(loaded.notes[1]!.image).toBe("anexos/ok.png");
  });

  it("no sync, a imagem trocada de um lado vale", async () => {
    const fs = new KeyValueFs(new MemoryStore(), "browser:teste");
    const base = await createSampleVault(fs);
    const id = base.notes[0]!.id;
    const remote = setNoteImage(base, id, "anexos/nova.png").project;
    const merged = mergeProjects(base, base, remote);
    expect(merged.notes.find((n) => n.id === id)!.image).toBe("anexos/nova.png");
  });
});

describe("galeria de imagens da ficha", () => {
  it("acrescenta, troca a principal e tira, sem mexer em arquivos", async () => {
    const fs = new KeyValueFs(new MemoryStore(), "browser:teste");
    const p = await createSampleVault(fs);
    const id = p.notes[0]!.id;
    const a = addNoteImages(p, id, ["anexos/a.png", "anexos/b.png", "anexos/a.png"]);
    expect(a.ops).toEqual([]);
    let n = a.project.notes[0]!;
    expect(n.image).toBe("anexos/a.png");
    expect(n.images).toEqual(["anexos/b.png"]);
    n = setMainNoteImage(a.project, id, "anexos/b.png").project.notes[0]!;
    expect(noteImages(n)).toEqual(["anexos/b.png", "anexos/a.png"]);
    const c = removeNoteImage(a.project, id, "anexos/a.png").project.notes[0]!;
    expect(c.image).toBe("anexos/b.png");
    expect("images" in c).toBe(false);
  });

  it("ao abrir, descarta imagens inválidas ou repetidas da galeria", async () => {
    const fs = new KeyValueFs(new MemoryStore(), "browser:teste");
    const p = await createSampleVault(fs);
    p.notes[0] = {
      ...p.notes[0]!,
      image: "anexos/a.png",
      images: ["anexos/a.png", "../fora.png", "anexos/b.png", "anexos/b.png"],
    };
    await saveProject(fs, p);
    const loaded = await loadProject(fs);
    expect(loaded.notes[0]!.images).toEqual(["anexos/b.png"]);
  });

  it("no sync, a galeria mudada de um lado vale", async () => {
    const fs = new KeyValueFs(new MemoryStore(), "browser:teste");
    const base = await createSampleVault(fs);
    const id = base.notes[0]!.id;
    const local = addNoteImages(base, id, ["anexos/a.png"]).project;
    const remote = addNoteImages(local, id, ["anexos/b.png"]).project;
    const merged = mergeProjects(local, local, remote);
    expect(noteImages(merged.notes.find((n) => n.id === id)!)).toEqual([
      "anexos/a.png",
      "anexos/b.png",
    ]);
  });
});
