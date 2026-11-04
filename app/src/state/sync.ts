import { create } from "zustand";

/*
 * Estado da sincronização com a nuvem do usuário.
 *
 * A conexão com a internet é detectada de verdade (navigator.onLine e os
 * eventos online/offline). O motor de sincronização (Google Drive) ainda não
 * existe: quando existir, ele liga `enabled` e informa falhas com
 * `reportError`. Até lá a sincronização aparece como desativada.
 */

interface SyncState {
  /** A sincronização está ligada (há uma conta de nuvem conectada). */
  enabled: boolean;
  /** O computador tem conexão com a internet. */
  online: boolean;
  /** Motivo da última falha de sincronização, ou null se a última deu certo. */
  error: string | null;
  setEnabled(enabled: boolean): void;
  reportError(reason: string | null): void;
}

const initialOnline = typeof navigator === "undefined" ? true : navigator.onLine;

export const useSync = create<SyncState>((set) => ({
  enabled: false,
  online: initialOnline,
  error: null,
  setEnabled(enabled) {
    set({ enabled, error: null });
  },
  reportError(error) {
    set({ error });
  },
}));

if (typeof window !== "undefined") {
  window.addEventListener("online", () => useSync.setState({ online: true }));
  window.addEventListener("offline", () => useSync.setState({ online: false }));
}

export type SyncStatus =
  | { kind: "active"; ok: true; label: string; detail: string }
  | { kind: "disabled" | "offline" | "error"; ok: false; label: string; detail: string };

/** Traduz o estado em uma situação só, na ordem em que importa para o usuário. */
export function syncStatus(s: Pick<SyncState, "enabled" | "online" | "error">): SyncStatus {
  if (!s.enabled)
    return {
      kind: "disabled",
      ok: false,
      label: "Sincronização desativada",
      detail:
        "A sincronização está desativada no momento. Os projetos ficam salvos só neste computador.",
    };
  if (!s.online)
    return {
      kind: "offline",
      ok: false,
      label: "Sem internet",
      detail: "A sincronização não está disponível porque não há conexão com a internet.",
    };
  if (s.error)
    return {
      kind: "error",
      ok: false,
      label: "Falha na sincronização",
      detail: `A sincronização falhou: ${s.error}`,
    };
  return {
    kind: "active",
    ok: true,
    label: "Sincronização ativa",
    detail: "A sincronização está ativa e funcionando corretamente.",
  };
}
