import { describe, expect, it } from "vitest";
import { KeyValueFs, MemoryStore } from "../platform/kvFs";
import { createSampleVault } from "../vault/sample";
import { loadProject, saveProject } from "../vault/vault";
import { mergeProjects } from "../sync/mergeProject";
import { buildGraph } from "../links/links";
import { fieldRefs, mergeFields, sanitizeFields, visibleFields } from "./fields";
import { setNoteFields } from "./tree";

async function sample() {
  const fs = new KeyValueFs(new MemoryStore(), "browser:teste");
  const p = await createSampleVault(fs);
  const by = (kind: string) => p.notes.find((n) => n.kind === kind)!;
  return { fs, p, hero: by("personagens"), place: by("lugares") };
}

describe("campos da ficha", () => {
  it("grava, lê e saneia os campos", async () => {
    const { fs, p, hero } = await sample();
    const r = setNoteFields(p, hero.id, { idade: "18", ocupacao: "  ", "mau campo": "x" });
    expect(r.project.notes.find((n) => n.id === hero.id)!.fields).toEqual({
      idade: "18",
      "mau campo": "x",
    });
    await saveProject(fs, r.project);
    const loaded = await loadProject(fs);
    // Chaves estranhas ficam de fora ao ler (o arquivo pode vir de fora).
    expect(loaded.notes.find((n) => n.id === hero.id)!.fields).toEqual({ idade: "18" });
    expect(sanitizeFields({ a: 3, b: "" })).toBeUndefined();
  });

  it("junta campo a campo no sync", () => {
    expect(
      mergeFields(
        { idade: "17", local: "a" },
        { idade: "18", local: "a" },
        { idade: "17", local: "b" },
      ),
    ).toEqual({ idade: "18", local: "b" });
    expect(mergeFields(undefined, undefined, { idade: "9" })).toEqual({ idade: "9" });
    expect(mergeFields({ idade: "9" }, {}, { idade: "9" })).toBeUndefined();
  });

  it("referências viram ligação no Elo e sobrevivem ao sync", async () => {
    const { p, hero, place } = await sample();
    const withRef = setNoteFields(p, hero.id, { local: place.id }).project;
    const h = withRef.notes.find((n) => n.id === hero.id)!;
    expect(fieldRefs(h)).toEqual([place.id]);
    const g = buildGraph(withRef, {}, { mentions: false });
    expect(
      g.edges.some(
        (e) =>
          (e.source === hero.id && e.target === place.id) ||
          (e.source === place.id && e.target === hero.id),
      ),
    ).toBe(true);
    const merged = mergeProjects(p, p, withRef);
    expect(merged.notes.find((n) => n.id === hero.id)!.fields).toEqual({ local: place.id });
  });
});

describe("visibleFields", () => {
  it("organiza a ficha de personagem em seções e esconde campos antigos vazios", () => {
    const defs = visibleFields("personagens", {});
    const sections = defs.filter((d) => d.section).map((d) => d.section!.title);
    expect(sections).toHaveLength(12);
    expect(sections[0]).toBe("1. Base");
    expect(sections[11]).toBe("12. Função");
    expect(defs.some((d) => d.key === "personalidade")).toBe(false);
  });

  it("mostra um campo antigo preenchido, levando o título da seção", () => {
    const defs = visibleFields("personagens", { background: "Cresceu na vila" });
    const bg = defs.find((d) => d.key === "background")!;
    expect(bg.section?.title).toBe("Outros");
    expect(defs.some((d) => d.key === "personalidade")).toBe(false);
  });
});
