import { useState } from "react";
import { useApp } from "../state/store";
import { Icon, Quill } from "./Icon";
import { ThemeToggle } from "./ThemeToggle";

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
  const desktop = platform?.kind === "desktop";

  return (
    <div className="home">
      <div className="home-inner">
        <header className="home-brand">
          <Quill size={40} />
          <div className="brand-text">
            <h1>InkFlow</h1>
            <p>Seus projetos de escrita, guardados no seu computador.</p>
          </div>
          <ThemeToggle />
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
      </div>
    </div>
  );
}
