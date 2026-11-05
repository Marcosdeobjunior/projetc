import { useEffect, useState } from "react";
import type { VaultRef } from "../platform";
import type { Project } from "../manuscript/types";
import { useApp } from "../state/store";
import { loadProject, readProjectTexts } from "../vault/vault";
import { Elo } from "./GraphView";
import { Icon } from "./Icon";

/** Órbitas do sistema solar do globo: tamanho (% do globo), volta (s) e planeta. */
const ORBITS = [
  { size: 34, turn: 6, planet: 5, tone: "rose" },
  { size: 52, turn: 10, planet: 7, tone: "gold" },
  { size: 70, turn: 16, planet: 6, tone: "teal" },
  { size: 88, turn: 26, planet: 8, tone: "fg" },
];

/**
 * Globo com um sistema solar girando. Clicar abre o Elo do projeto
 * selecionado numa janela por cima da tela de projetos.
 */
export function EloGlobe({ vault }: { vault: VaultRef | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="elo-globe"
        disabled={!vault}
        title={vault ? `Elo de ${vault.title}` : "Selecione um projeto para ver o Elo"}
        aria-label={vault ? `Abrir o Elo de ${vault.title}` : "Elo (nenhum projeto selecionado)"}
        onClick={() => setOpen(true)}
      >
        <span className="elo-globe-sky" aria-hidden="true">
          <span className="elo-system">
            <span className="elo-sun" />
            {ORBITS.map((o) => (
              <span
                key={o.size}
                className="elo-orbit"
                style={{
                  width: `${o.size}%`,
                  height: `${o.size}%`,
                  animationDuration: `${o.turn}s`,
                }}
              >
                <span
                  className={"elo-planet " + o.tone}
                  style={{ width: o.planet, height: o.planet }}
                />
              </span>
            ))}
          </span>
        </span>
      </button>
      {open && vault && <EloDialog vault={vault} onClose={() => setOpen(false)} />}
    </>
  );
}

type Loaded = { project: Project; texts: Record<string, string> };

function EloDialog({ vault, onClose }: { vault: VaultRef; onClose(): void }) {
  const platform = useApp((s) => s.platform);
  const openVault = useApp((s) => s.openVault);
  const [data, setData] = useState<Loaded | "error" | null>(null);

  useEffect(() => {
    if (!platform) return;
    let alive = true;
    const fs = platform.fs(vault.root);
    loadProject(fs)
      .then(async (project) => ({ project, texts: (await readProjectTexts(fs, project)).texts }))
      .then(
        (d) => alive && setData(d),
        () => alive && setData("error"),
      );
    return () => {
      alive = false;
    };
  }, [platform, vault.root]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Clicar numa estrela abre o projeto já no texto dela.
  const openText = (id: string) => {
    onClose();
    void openVault(vault.root).then(() => useApp.getState().openDoc(id));
  };

  return (
    <div
      className="modal-backdrop elo-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        className="panel modal elo-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="elo-title"
      >
        <div className="row-title">
          <h2 id="elo-title" className="modal-title">
            Elo · {vault.title}
          </h2>
          <button type="button" className="icon-btn" aria-label="Fechar" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="elo-modal-body">
          {data && typeof data === "object" ? (
            <Elo project={data.project} texts={data.texts} activeId={null} onOpen={openText} />
          ) : (
            <p className="muted elo-status" role="status">
              {data === "error" ? "Não foi possível ler este projeto." : "Carregando o Elo…"}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
