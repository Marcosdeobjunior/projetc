import { useEffect, useRef, useState } from "react";
import type { VaultRef } from "../platform";
import type { Project } from "../manuscript/types";
import { useApp } from "../state/store";
import { loadProject, readProjectTexts } from "../vault/vault";
import { Elo } from "./GraphView";
import { Icon } from "./Icon";

/** Órbitas do globo (raios da elipse no viewBox 40×40), volta (s) e planeta. */
const ORBITS = [
  { rx: 7, ry: 2.6, turn: 5, r: 1.3, tone: "rose" },
  { rx: 11, ry: 4.1, turn: 9, r: 1.7, tone: "gold" },
  { rx: 15, ry: 5.6, turn: 15, r: 1.5, tone: "teal" },
];

/** Elipse como caminho (começa à direita), para o planeta seguir. */
const ellipse = (rx: number, ry: number) =>
  `M${20 + rx} 20a${rx} ${ry} 0 1 1 ${-2 * rx} 0a${rx} ${ry} 0 1 1 ${2 * rx} 0`;

/** O ícone do Elo: um globo com a estrela do Elo no centro e planetas em órbita. */
function GlobeIcon() {
  // Quem pediu menos movimento no sistema vê o globo parado.
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () =>
      mq.matches ? ref.current?.pauseAnimations() : ref.current?.unpauseAnimations();
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return (
    <svg
      ref={ref}
      className="elo-globe-svg"
      viewBox="0 0 40 40"
      width="40"
      height="40"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="elo-globe-fill" cx="0.36" cy="0.3" r="0.8">
          <stop offset="0" stopColor="var(--elo-glass-hi)" />
          <stop offset="0.55" stopColor="var(--elo-glass)" />
          <stop offset="1" stopColor="var(--elo-glass-lo)" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="19" fill="url(#elo-globe-fill)" className="elo-globe-rim" />
      {/* O plano das órbitas, inclinado, dá a volta inteira devagar. */}
      <g className="elo-plane">
        {ORBITS.map((o) => (
          <g key={o.rx}>
            <path d={ellipse(o.rx, o.ry)} className="elo-orbit" />
            <circle r={o.r} className={"elo-planet " + o.tone}>
              <animateMotion
                dur={`${o.turn}s`}
                repeatCount="indefinite"
                path={ellipse(o.rx, o.ry)}
              />
            </circle>
          </g>
        ))}
      </g>
      {/* Sol: a estrela do Elo. */}
      <circle cx="20" cy="20" r="3.4" className="elo-sun-glow" />
      <path
        className="elo-sun"
        d="M20 14.5 21.1 18.9 25.5 20 21.1 21.1 20 25.5 18.9 21.1 14.5 20 18.9 18.9Z"
      />
      <ellipse
        cx="14"
        cy="11"
        rx="6"
        ry="3.2"
        className="elo-shine"
        transform="rotate(-28 14 11)"
      />
    </svg>
  );
}

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
        <GlobeIcon />
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
