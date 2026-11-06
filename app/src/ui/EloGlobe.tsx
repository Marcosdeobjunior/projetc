import { useEffect, useState } from "react";
import type { VaultRef } from "../platform";
import type { Project } from "../manuscript/types";
import { useApp } from "../state/store";
import { loadProject, readProjectTexts } from "../vault/vault";
import { Elo } from "./GraphView";
import { Icon } from "./Icon";

/**
 * O ícone do Elo: um planeta com um anel inclinado. A metade de trás do anel
 * passa atrás do planeta e a da frente, na frente; uma lua pequena fica no anel.
 */
function PlanetIcon() {
  return (
    <svg className="elo-globe-svg" viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
      <defs>
        <radialGradient id="elo-planet-fill" cx="0.36" cy="0.3" r="0.85">
          <stop offset="0" stopColor="var(--elo-glass-hi)" />
          <stop offset="0.55" stopColor="var(--elo-glass)" />
          <stop offset="1" stopColor="var(--elo-glass-lo)" />
        </radialGradient>
        <clipPath id="elo-planet-clip">
          <circle cx="20" cy="20" r="10.5" />
        </clipPath>
      </defs>
      <g className="elo-ring-tilt">
        <path className="elo-ring back" d="M3 20A17 5.6 0 0 1 37 20" />
      </g>
      <circle cx="20" cy="20" r="10.5" fill="url(#elo-planet-fill)" className="elo-globe-rim" />
      <g clipPath="url(#elo-planet-clip)">
        <path className="elo-band" d="M8 17.5c6 2.2 18 2.2 24 0M8 23c6 2 18 2 24 0" />
      </g>
      <g className="elo-ring-tilt">
        <path className="elo-ring" d="M3 20A17 5.6 0 0 0 37 20" />
        <circle className="elo-moon" cx="33.2" cy="23" r="1.6" />
      </g>
    </svg>
  );
}

/**
 * Planeta do Elo, antes da busca. Clicar abre o Elo do projeto selecionado
 * numa janela por cima da tela inicial.
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
        <PlanetIcon />
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
