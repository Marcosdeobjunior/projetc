import { describe, expect, it } from "vitest";
import { syncStatus } from "./sync";

describe("syncStatus", () => {
  it("fica verde quando ligada, online e sem erro", () => {
    const s = syncStatus({ enabled: true, online: true, error: null });
    expect(s.ok).toBe(true);
    expect(s.kind).toBe("active");
  });

  it("desativada vem antes de qualquer outro problema", () => {
    const s = syncStatus({ enabled: false, online: false, error: "x" });
    expect(s).toMatchObject({ ok: false, kind: "disabled" });
  });

  it("sem internet tem prioridade sobre um erro antigo", () => {
    const s = syncStatus({ enabled: true, online: false, error: "Cota cheia" });
    expect(s).toMatchObject({ ok: false, kind: "offline" });
    expect(s.detail).toMatch(/internet/);
  });

  it("mostra o motivo real da falha", () => {
    const s = syncStatus({ enabled: true, online: true, error: "Token do Google Drive expirou." });
    expect(s).toMatchObject({ ok: false, kind: "error" });
    expect(s.detail).toContain("Token do Google Drive expirou.");
  });
});
