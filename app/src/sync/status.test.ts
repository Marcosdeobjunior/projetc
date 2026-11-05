import { describe, expect, it } from "vitest";
import { syncStatus, type SyncFacts } from "./status";

const ok: SyncFacts = {
  available: true,
  connected: true,
  folderSyncs: true,
  online: true,
  status: "idle",
  error: null,
  lastSync: null,
};

describe("syncStatus", () => {
  it("fica verde com conta, pasta ligada, internet e sem erro", () => {
    expect(syncStatus(ok)).toMatchObject({ ok: true, kind: "active" });
    expect(syncStatus({ ...ok, status: "syncing" })).toMatchObject({ ok: true, kind: "syncing" });
  });

  it("explica por que está desativada", () => {
    expect(syncStatus({ ...ok, available: false }).detail).toMatch(/app desktop/);
    expect(syncStatus({ ...ok, connected: false }).detail).toMatch(/conta Google/);
    expect(syncStatus({ ...ok, folderSyncs: false }).detail).toMatch(/este projeto/);
    expect(syncStatus({ ...ok, folderSyncs: null }).kind).toBe("disabled");
  });

  it("sem internet tem prioridade sobre um erro antigo", () => {
    const s = syncStatus({ ...ok, online: false, status: "error", error: "x" });
    expect(s).toMatchObject({ ok: false, kind: "offline" });
  });

  it("mostra o motivo real da falha", () => {
    const s = syncStatus({ ...ok, status: "error", error: "O Drive recusou o acesso." });
    expect(s).toMatchObject({ ok: false, kind: "error" });
    expect(s.detail).toContain("O Drive recusou o acesso.");
  });
});
