import { describe, expect, it } from "vitest";
import { KeyValueFs, MemoryStore } from "../platform/kvFs";
import { countWords } from "../manuscript/wordCount";
import { loadProject, readProjectTexts } from "./vault";
import { createTestBook, TEST_BOOK_TITLE } from "./testBook";

describe("livro de teste", () => {
  it("gera um projeto grande e válido, que abre normalmente", async () => {
    const fs = new KeyValueFs(new MemoryStore(), "browser:volume");
    await createTestBook(fs);
    const p = await loadProject(fs);
    expect(p.title).toBe(TEST_BOOK_TITLE);
    expect(p.chapters).toHaveLength(14);
    const scenes = p.chapters.flatMap((c) => c.scenes);
    expect(scenes.length).toBeGreaterThanOrEqual(14 * 3);
    expect(p.notes.filter((n) => n.kind === "personagens")).toHaveLength(20);
    expect(p.notes.filter((n) => n.kind === "lugares")).toHaveLength(8);
    expect(p.notes.filter((n) => n.kind === "ideias")).toHaveLength(6);

    const { texts } = await readProjectTexts(fs, p);
    const words = scenes.reduce((n, s) => n + countWords(texts[s.id] ?? ""), 0);
    expect(words).toBeGreaterThan(15000);
    expect(scenes.every((s) => (texts[s.id] ?? "").length > 0)).toBe(true);
    // Sem sobras do "Capítulo 1 / Cena 1" criado antes de renomear.
    expect(await fs.exists("manuscrito/capitulo-1")).toBe(false);
  });
});
