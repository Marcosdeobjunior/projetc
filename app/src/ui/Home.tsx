import { useState } from "react";
import { useApp } from "../state/store";
import { Icon, Quill } from "./Icon";
import { Settings } from "./Settings";
import { useSync } from "../state/sync";
import type { RemoteProject } from "../sync/drive";

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function Home() {
  const platform = useApp((s) => s.platform);
  const vaults = useApp((s) => s.vaults);
  const busy = useApp((s) => s.busy);
  const createVault = useApp((s) => s.createVault);
  const openVault = useApp((s) => s.openVault);
  const openExistingFolder = useApp((s) => s.openExistingFolder);
  const folderToConvert = useApp((s) => s.folderToConvert);
  const createVaultInFolder = useApp((s) => s.createVaultInFolder);
  const cancelFolderToConvert = useApp((s) => s.cancelFolderToConvert);
  const forgetVault = useApp((s) => s.forgetVault);
  const [title, setTitle] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const desktop = platform?.kind === "desktop";

  if (settings) {
    return (
      <div className="home">
        <div className="home-inner">
          <header className="home-brand">
            <button
              type="button"
              className="icon-btn"
              aria-label="Voltar"
              onClick={() => setSettings(false)}
            >
              <Icon name="back" />
            </button>
            <h1 className="brand-text">Configurações</h1>
          </header>
          <Settings />
        </div>
      </div>
    );
  }

  return (
    <div className="home">
      <div className="home-inner">
        <header className="home-brand">
          <Quill size={40} />
          <div className="brand-text">
            <h1>InkFlow</h1>
            <p>Seus projetos de escrita, guardados no seu computador.</p>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="Configurações"
            title="Configurações"
            onClick={() => setSettings(true)}
          >
            <Icon name="settings" />
          </button>
        </header>

        {!desktop && (
          <p className="notice">
            {platform?.persistent === false
              ? "Prévia no navegador: este navegador não permite guardar dados, então os projetos somem ao fechar a página."
              : "Prévia no navegador: os projetos ficam guardados só neste navegador. No app desktop, cada projeto é uma pasta no seu computador."}
          </p>
        )}

        <section className="card new-project" aria-labelledby="new-title">
          <h2 id="new-title">Novo projeto</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void createVault(title).then(() => setTitle(""));
            }}
          >
            <label htmlFor="project-title">Nome do livro</label>
            <div className="field-row">
              <input
                id="project-title"
                autoFocus
                value={title}
                placeholder="Ex.: A Casa das Marés"
                maxLength={120}
                onChange={(e) => setTitle(e.target.value)}
              />
              <button type="submit" className="btn primary" disabled={busy}>
                Criar projeto
              </button>
            </div>
            {desktop && (
              <p className="hint">
                Em seguida você escolhe em qual pasta do computador ele será salvo.
              </p>
            )}
          </form>
          {desktop && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => void openExistingFolder()}
              disabled={busy}
            >
              <Icon name="folder" /> Abrir projeto existente
            </button>
          )}
          {folderToConvert && (
            <div className="convert" role="alertdialog" aria-labelledby="convert-title">
              <p id="convert-title">
                A pasta <b>{folderToConvert.name}</b> ainda não é um projeto do InkFlow.
              </p>
              <p className="muted">
                Você pode transformá-la em um projeto: o InkFlow cria dentro dela as pastas{" "}
                <code>manuscrito</code> e <code>.inkflow</code>. Os arquivos que já estão lá não são
                alterados.
              </p>
              <div className="convert-actions">
                <button
                  type="button"
                  className="btn primary sm"
                  disabled={busy}
                  onClick={() => void createVaultInFolder(folderToConvert)}
                >
                  Criar projeto nesta pasta
                </button>
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => void openExistingFolder()}
                >
                  Escolher outra pasta
                </button>
                <button type="button" className="btn ghost sm" onClick={cancelFolderToConvert}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </section>

        <section aria-labelledby="recent-title">
          <h2 id="recent-title" className="section-title">
            {desktop ? "Abertos recentemente" : "Seus projetos"}
          </h2>
          {vaults.length === 0 ? (
            <p className="muted empty">Nenhum projeto ainda. Crie o primeiro acima.</p>
          ) : (
            <ul className="vault-list">
              {vaults.map((v) => (
                <li key={v.root} className="vault">
                  {confirming === v.root ? (
                    <div className="confirm-inline">
                      <span>
                        {desktop
                          ? `Tirar "${v.title}" da lista? A pasta continua no computador.`
                          : `Excluir "${v.title}" deste navegador? Não dá para desfazer.`}
                      </span>
                      <button
                        type="button"
                        className="btn danger sm"
                        onClick={() => {
                          setConfirming(null);
                          void forgetVault(v.root);
                        }}
                      >
                        {desktop ? "Tirar da lista" : "Excluir"}
                      </button>
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={() => setConfirming(null)}
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="vault-open"
                        onClick={() => void openVault(v.root)}
                        disabled={busy}
                      >
                        <span className="vault-title">{v.title}</span>
                        <span className="vault-loc">
                          {v.location}
                          {v.openedAt ? ` · ${dateFmt.format(v.openedAt)}` : ""}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="icon-btn danger"
                        title={desktop ? "Tirar da lista" : "Excluir projeto"}
                        aria-label={desktop ? `Tirar ${v.title} da lista` : `Excluir ${v.title}`}
                        onClick={() => setConfirming(v.root)}
                      >
                        <Icon name={desktop ? "close" : "trash"} />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <DriveProjects />
      </div>
    </div>
  );
}

/** Projetos que estão no Google Drive, para baixar neste computador. */
function DriveProjects() {
  const { available, account, busy, error, listRemote, download } = useSync();
  const vaults = useApp((s) => s.vaults);
  const [list, setList] = useState<RemoteProject[] | null>(null);
  const [loading, setLoading] = useState(false);
  if (!available || !account) return null;

  const load = async () => {
    setLoading(true);
    try {
      setList(await listRemote());
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section aria-labelledby="drive-title">
      <h2 id="drive-title" className="section-title">
        No Google Drive
      </h2>
      {list === null ? (
        <button type="button" className="btn ghost" disabled={loading} onClick={() => void load()}>
          <Icon name="cloud" size={16} /> {loading ? "Procurando…" : "Ver projetos no Drive"}
        </button>
      ) : list.length === 0 ? (
        <p className="muted empty">Nenhum projeto sincronizado no Drive desta conta ainda.</p>
      ) : (
        <ul className="vault-list">
          {list.map((r) => (
            <li key={r.folderId} className="vault">
              <div className="vault-open">
                <span className="vault-title">{r.title}</span>
                <span className="vault-loc">
                  {vaults.some((v) => v.title === r.title)
                    ? "Já existe um projeto com esse nome aqui"
                    : "Ainda não está neste computador"}
                </span>
              </div>
              <button
                type="button"
                className="btn ghost sm"
                disabled={busy}
                onClick={() => void download(r)}
              >
                Baixar
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="setting-error">{error}</p>}
    </section>
  );
}
