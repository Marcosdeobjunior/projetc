/*
 * Regras do ponto de sincronização do topo: transforma os fatos (conta,
 * pasta ligada ao Drive, internet, estado do motor) em uma situação só.
 * Sem dependências do app, para poder ser testado sozinho.
 */

export interface SyncFacts {
  /** A sincronização só existe no app desktop. */
  available: boolean;
  /** Há uma conta Google conectada. */
  connected: boolean;
  /** A pasta ativa está ligada ao Drive (null = nenhuma pasta selecionada). */
  folderSyncs: boolean | null;
  online: boolean;
  /** Estado do motor de sincronização. */
  status: "off" | "idle" | "syncing" | "error";
  /** Mensagem do último erro do motor. */
  error: string | null;
  /** Hora da última sincronização da pasta ativa. */
  lastSync: number | null;
}

export type SyncStatus = {
  kind: "active" | "syncing" | "disabled" | "offline" | "error";
  ok: boolean;
  label: string;
  detail: string;
};

const timeFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** Traduz os fatos em uma situação só, na ordem em que importa para o usuário. */
export function syncStatus(f: SyncFacts): SyncStatus {
  const off = (detail: string): SyncStatus => ({
    kind: "disabled",
    ok: false,
    label: "Sincronização desativada",
    detail,
  });
  if (!f.available) return off("A sincronização com o Google Drive só funciona no app desktop.");
  if (!f.connected)
    return off("Nenhuma conta Google conectada. Conecte uma em Configurações → Sincronização.");
  if (f.folderSyncs === null) return off("Nenhum projeto selecionado.");
  if (!f.folderSyncs)
    return off(
      "A sincronização está desativada para este projeto. Ligue em Configurações → Sincronização com o projeto aberto.",
    );
  if (!f.online)
    return {
      kind: "offline",
      ok: false,
      label: "Sem internet",
      detail: "A sincronização não está disponível porque não há conexão com a internet.",
    };
  if (f.status === "error")
    return {
      kind: "error",
      ok: false,
      label: "Falha na sincronização",
      detail: `A sincronização falhou: ${f.error ?? "motivo desconhecido."}`,
    };
  if (f.status === "syncing")
    return {
      kind: "syncing",
      ok: true,
      label: "Sincronizando",
      detail: "Enviando e recebendo as mudanças do Google Drive agora.",
    };
  return {
    kind: "active",
    ok: true,
    label: "Sincronização ativa",
    detail:
      "A sincronização está ativa e funcionando corretamente." +
      (f.lastSync ? ` Última sincronização: ${timeFmt.format(f.lastSync)}.` : ""),
  };
}
