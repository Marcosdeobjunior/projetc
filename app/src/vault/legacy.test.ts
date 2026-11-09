import { describe, expect, it } from "vitest";
import { KeyValueFs, MemoryStore } from "../platform/kvFs";
import { createSampleVault } from "./sample";
import { loadProject } from "./vault";
import { migrateLegacyMeta } from "./legacy";
import { LEGACY_META_DIR, META_DIR, PROJECT_FILE } from "./paths";

/** Monta um projeto no formato antigo, com a pasta interna em `.inkflow/`. */
async function legacyVault() {
  const fs = new KeyValueFs(new MemoryStore(), "browser:antigo");
  await createSampleVault(fs);
  await fs.rename(META_DIR, LEGACY_META_DIR);
  return fs;
}

describe("migração da pasta .inkflow", () => {
  it("renomeia .inkflow para .talia ao abrir o projeto", async () => {
    const fs = await legacyVault();
    const before = (await fs.walk()).filter((f) => f.path.startsWith(`${LEGACY_META_DIR}/`));
    expect(before.length).toBeGreaterThan(0);

    const project = await loadProject(fs);
    expect(project.chapters.length).toBeGreaterThan(0);
    expect(await fs.exists(PROJECT_FILE)).toBe(true);
    const after = (await fs.walk()).map((f) => f.path);
    expect(after.some((p) => p.startsWith(`${LEGACY_META_DIR}/`))).toBe(false);
    expect(after.filter((p) => p.startsWith(`${META_DIR}/`)).length).toBe(before.length);
  });

  it("não mexe em projeto já no formato novo", async () => {
    const fs = new KeyValueFs(new MemoryStore(), "browser:novo");
    await createSampleVault(fs);
    expect(await migrateLegacyMeta(fs)).toBe(false);
  });

  it("aguenta duas aberturas ao mesmo tempo", async () => {
    const fs = await legacyVault();
    const [a, b] = await Promise.all([loadProject(fs), loadProject(fs)]);
    expect(a.title).toBe(b.title);
  });
});
