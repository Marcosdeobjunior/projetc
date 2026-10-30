import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { useApp } from "./store";
import { flushAll, registerBeforeClose, serial } from "./writes";
import { DriveError, GoogleDrive, type Drive, type RemoteProject } from "../sync/drive";
import { applySync, planSync, readSyncState, writeSyncState, type SyncState } from "../sync/engine";
import { folderName } from "../vault/paths";

/*
 * Conta Google e sincronização do projeto aberto com o Google Drive.
 * A conta vale para o app todo (fica neste computador); ligar ou não a
 * sincronização é escolha de cada projeto (`.inkflow/sync.json`).
 */

const ACCOUNT_KEY = "inkflow.google";
const CLIENT_KEY = "inkflow.googleClient";

interface Account {
  email: string;
  refreshToken: string;
}

interface Client {
  id: string;
  secret: string;
}

type Status = "off" | "idle" | "syncing" | "error";

interface SyncStore {
  /** A sincronização só existe no app desktop. */
  available: boolean;
  client: Client | null;
  account: Account | null;
  /** O projeto aberto está ligado ao Drive. */
  enabled: boolean;
  status: Status;
  error: string | null;
  lastSync: number | null;
  busy: boolean;

  setClient(client: Client | null): void;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** Lê se o projeto aberto sincroniza (ao abrir um projeto). */
  attach(): Promise<void>;
  enable(): Promise<void>;
  disable(): Promise<void>;
  syncNow(): Promise<void>;
  listRemote(): Promise<RemoteProject[]>;
  /** Baixa um projeto do Drive para uma pasta nova deste computador e abre. */
  download(remote: RemoteProject): Promise<void>;
}

function read<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") as T | null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // sem armazenamento: só não fica lembrado
  }
}

/** Credenciais do app no Google: definidas na compilação ou nas Configurações. */
function initialClient(): Client | null {
  const id = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  const secret = import.meta.env.VITE_GOOGLE_CLIENT_SECRET as string | undefined;
  if (id && secret) return { id, secret };
  return read<Client>(CLIENT_KEY);
}

interface Tokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

let access: { token: string; until: number } | null = null;

function message(err: unknown) {
  if (err instanceof DriveError) return err.message;
  if (typeof err === "string") return err;
  console.error(err);
  return "Algo deu errado ao sincronizar. Tente de novo.";
}

export const useSync = create<SyncStore>((set, get) => {
  const desktop = "__TAURI_INTERNALS__" in window;

  async function token(renew = false): Promise<string> {
    const { client, account } = get();
    if (!client || !account) throw new DriveError("Conecte uma conta Google nas Configurações.");
    if (!renew && access && access.until > Date.now() + 60_000) return access.token;
    const t = await invoke<Tokens>("google_refresh", {
      clientId: client.id,
      clientSecret: client.secret,
      refreshToken: account.refreshToken,
    });
    access = { token: t.access_token, until: Date.now() + t.expires_in * 1000 };
    return t.access_token;
  }

  const drive = (): Drive => new GoogleDrive(token);

  /** Sincroniza um vault (sem mexer no editor; usado também para baixar um projeto). */
  async function run(
    fs: Parameters<typeof planSync>[0],
    state: SyncState,
    onTouch?: (ids: Set<string>) => Promise<void>,
  ) {
    const d = drive();
    const project = useApp.getState().session?.project;
    const plan = await planSync(
      fs,
      d,
      state,
      await fs.walk(),
      project ?? ({ chapters: [], notes: [] } as never),
    );
    await onTouch?.(plan.touchedDocs);
    const result = await serial(async () => {
      const r = await applySync(fs, d, state, plan);
      await writeSyncState(fs, r.state);
      return r;
    });
    return result;
  }

  let running: Promise<void> | null = null;

  return {
    available: desktop,
    client: initialClient(),
    account: read<Account>(ACCOUNT_KEY),
    enabled: false,
    status: "off",
    error: null,
    lastSync: null,
    busy: false,

    setClient(client) {
      write(CLIENT_KEY, client);
      set({ client });
    },

    async connect() {
      const { client } = get();
      if (!client) return;
      set({ busy: true, error: null });
      try {
        const t = await invoke<Tokens>("google_sign_in", {
          clientId: client.id,
          clientSecret: client.secret,
        });
        if (!t.refresh_token)
          throw "O Google não devolveu a autorização permanente. Tente de novo.";
        access = { token: t.access_token, until: Date.now() + t.expires_in * 1000 };
        const account = { email: "", refreshToken: t.refresh_token };
        set({ account });
        account.email = await drive().email();
        write(ACCOUNT_KEY, account);
        set({ account: { ...account } });
        await get().attach();
      } catch (err) {
        set({ account: read<Account>(ACCOUNT_KEY), error: message(err) });
      } finally {
        set({ busy: false });
      }
    },

    async disconnect() {
      const { account } = get();
      write(ACCOUNT_KEY, null);
      access = null;
      set({ account: null, status: "off", enabled: false, error: null });
      if (account)
        await invoke("google_revoke", { token: account.refreshToken }).catch(() => undefined);
    },

    async attach() {
      const session = useApp.getState().session;
      if (!session || !desktop) return set({ enabled: false, status: "off", lastSync: null });
      const state = await serial(() => readSyncState(session.fs));
      set({
        enabled: !!state,
        lastSync: state?.lastSync ?? null,
        status: state && get().account ? "idle" : "off",
        error: null,
      });
      if (state && get().account) await get().syncNow();
    },

    async enable() {
      const session = useApp.getState().session;
      if (!session || !get().account) return;
      set({ busy: true, error: null });
      try {
        const folderId = await drive().projectFolder(session.project.id, session.project.title);
        await serial(() =>
          writeSyncState(session.fs, {
            folderId,
            base: {},
            cache: {},
            projectBase: null,
            lastSync: null,
          }),
        );
        set({ enabled: true, status: "idle" });
        await get().syncNow();
      } catch (err) {
        set({ error: message(err), status: "error" });
      } finally {
        set({ busy: false });
      }
    },

    async disable() {
      const session = useApp.getState().session;
      if (session) await serial(() => writeSyncState(session.fs, null));
      set({ enabled: false, status: "off", lastSync: null });
    },

    syncNow() {
      // Uma sincronização de cada vez.
      running ??= (async () => {
        const app = useApp.getState();
        const session = app.session;
        if (!session || !get().account) return;
        const state = await serial(() => readSyncState(session.fs));
        if (!state) return;
        set({ status: "syncing", error: null });
        let reopen: string | null = null;
        try {
          await flushAll();
          const result = await run(session.fs, state, async (ids) => {
            // O texto aberto vai mudar: fecha (gravando) e abre de novo depois.
            const active = useApp.getState().session?.activeDocId;
            if (active && ids.has(active)) {
              reopen = active;
              await useApp.getState().closeEditor();
            }
          });
          if (result.changed || reopen) await useApp.getState().reloadFromDisk(reopen);
          set({ status: "idle", lastSync: result.state.lastSync });
          if (result.keptBoth > 0) {
            app.showMessage(
              `${result.keptBoth} ${result.keptBoth === 1 ? "arquivo foi alterado" : "arquivos foram alterados"} aqui e em outro computador. Ficou a versão deste computador; a do Drive está na Lixeira.`,
              "info",
            );
          }
        } catch (err) {
          if (reopen) await useApp.getState().reloadFromDisk(reopen);
          set({ status: "error", error: message(err) });
        }
      })().finally(() => {
        running = null;
      });
      return running;
    },

    async listRemote() {
      return drive().listProjects();
    },

    async download(remote) {
      const app = useApp.getState();
      const platform = app.platform;
      if (!platform) return;
      set({ busy: true, error: null });
      try {
        const root = await platform.chooseNewVaultRoot(folderName(remote.title));
        if (!root) return;
        const fs = platform.fs(root);
        const state: SyncState = {
          folderId: remote.folderId,
          base: {},
          cache: {},
          projectBase: null,
          lastSync: null,
        };
        await run(fs, state);
        await app.openVault(root);
      } catch (err) {
        set({ error: message(err) });
      } finally {
        set({ busy: false });
      }
    },
  };
});

// Antes de fechar o projeto ou o app, manda o que mudou para o Drive.
registerBeforeClose(async () => {
  const { enabled, account, syncNow } = useSync.getState();
  if (enabled && account) await syncNow();
});
