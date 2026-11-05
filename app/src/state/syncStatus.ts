import { useEffect, useState } from "react";
import { create } from "zustand";
import type { Platform } from "../platform";
import { readSyncState } from "../sync/engine";
import { useSync } from "./sync";
import { syncStatus, type SyncStatus } from "../sync/status";

export type { SyncStatus };

/*
 * O que o ponto do topo da tela de projetos mostra: a situação real da
 * sincronização com o Google Drive para a pasta ativa. Junta a conta (de
 * useSync), se aquela pasta sincroniza (`.inkflow/sync.json`), a conexão com
 * a internet (eventos online/offline) e a última falha do motor de sync.
 */

/** Conexão com a internet, pelos eventos do sistema. */
export const useOnline = create<{ online: boolean }>(() => ({
  online: typeof navigator === "undefined" ? true : navigator.onLine,
}));
if (typeof window !== "undefined") {
  window.addEventListener("online", () => useOnline.setState({ online: true }));
  window.addEventListener("offline", () => useOnline.setState({ online: false }));
}

/** Situação da sincronização para a pasta (projeto) indicada. */
export function useFolderSyncStatus(platform: Platform | null, root: string | null): SyncStatus {
  const available = useSync((s) => s.available);
  const account = useSync((s) => s.account);
  const status = useSync((s) => s.status);
  const error = useSync((s) => s.error);
  const online = useOnline((s) => s.online);
  // Lido do disco: se a pasta tem .inkflow/sync.json e quando sincronizou.
  const [folder, setFolder] = useState<{ root: string; syncs: boolean; last: number | null }>();

  useEffect(() => {
    if (!platform || !root) return;
    let live = true;
    readSyncState(platform.fs(root))
      .then((state) => live && setFolder({ root, syncs: !!state, last: state?.lastSync ?? null }))
      .catch(() => live && setFolder({ root, syncs: false, last: null }));
    return () => {
      live = false;
    };
  }, [platform, root, status]);

  const known = folder && folder.root === root ? folder : null;
  return syncStatus({
    available,
    connected: !!account,
    folderSyncs: root ? (known?.syncs ?? false) : null,
    online,
    status,
    error,
    lastSync: known?.last ?? null,
  });
}
