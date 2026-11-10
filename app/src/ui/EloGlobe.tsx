import { useEffect, useState } from "react";
import type { VaultRef } from "../platform";
import type { Project } from "../manuscript/types";
import { useApp } from "../state/store";
import { loadProject, readProjectTexts } from "../vault/vault";
import { Elo } from "./GraphView";
import { Icon } from "./Icon";

/** Órbita da lua: a elipse do anel (centro 20,20; raios 17 × 5,6) no plano inclinado. */
const ORBIT = { cx: 20, cy: 20, rx: 17, ry: 5.6 };
/** Onde a lua descansa na órbita (ângulo, graus): na frente, à direita. */
const MOON_REST = 32;
/** Uma volta completa: nem rápida nem lenta. */
const ORBIT_MS = 2600;

const moonAt = (deg: number) => {
  const t = (deg * Math.PI) / 180;
  return { x: ORBIT.cx + ORBIT.rx * Math.cos(t), y: ORBIT.cy + ORBIT.ry * Math.sin(t) };
};

/**
 * Quadros da volta da lua. A posição vai num `translate` relativo ao ponto de
 * descanso; a lua da frente some na metade de trás da órbita (onde passa atrás
 * do planeta) e a de trás aparece só ali, recortada pelo planeta.
 */
function orbitFrames(front: boolean): Keyframe[] {
  const rest = moonAt(MOON_REST);
  const steps = 48;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const deg = MOON_REST + (360 * i) / steps;
    const p = moonAt(deg);
    const behind = Math.sin((deg * Math.PI) / 180) < 0;
    return {
      offset: i / steps,
      transform: `translate(${(p.x - rest.x).toFixed(3)}px, ${(p.y - rest.y).toFixed(3)}px)`,
      opacity: front ? (behind ? 0 : 1) : behind ? 1 : 0,
    };
  });
}

/** Ícones com a lua em volta agora: uma volta por vez. */
const orbiting = new WeakSet<Element>();

/**
 * Faz a lua dar uma volta inteira. Chamado ao passar o mouse (ou focar): se a
 * volta já está em andamento, não faz nada; se o mouse sai antes do fim, a
 * volta continua até a lua parar no lugar de sempre.
 */
function spinMoon(button: HTMLElement) {
  const front = button.querySelector<SVGElement>(".elo-moon.front");
  const back = button.querySelector<SVGElement>(".elo-moon.behind");
  if (!front || !back || orbiting.has(button)) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  orbiting.add(button);
  // Uma curva suave nas duas pontas: a lua sai devagar, corre e pousa.
  const opts: KeyframeAnimationOptions = {
    duration: ORBIT_MS,
    easing: "cubic-bezier(0.45, 0.05, 0.35, 1)",
  };
  back.animate(orbitFrames(false), opts);
  const a = front.animate(orbitFrames(true), opts);
  a.onfinish = a.oncancel = () => orbiting.delete(button);
}

/**
 * O ícone do Elo: um planeta com um anel inclinado e uma lua. A lua de trás
 * (escondida no descanso) só aparece fora do planeta, na metade de trás da
 * órbita; a da frente passa por cima dele.
 */
function PlanetIcon() {
  const rest = moonAt(MOON_REST);
  return (
    <svg className="elo-globe-svg" viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
      <defs>
        <clipPath id="elo-planet-clip">
          <circle cx="20" cy="20" r="10.5" />
        </clipPath>
        <mask id="elo-behind" maskUnits="userSpaceOnUse" x="0" y="0" width="40" height="40">
          <rect width="40" height="40" fill="#fff" />
          <circle cx="20" cy="20" r="10.5" fill="#000" />
        </mask>
      </defs>
      <g className="elo-ring-tilt">
        <path className="elo-ring back" d="M3 20A17 5.6 0 0 1 37 20" />
        <g mask="url(#elo-behind)">
          <circle className="elo-moon behind" cx={rest.x} cy={rest.y} r="1.6" opacity="0" />
        </g>
      </g>
      <circle cx="20" cy="20" r="10.5" className="elo-planet-body" />
      <g clipPath="url(#elo-planet-clip)">
        <path className="elo-band" d="M8 17.5c6 2.2 18 2.2 24 0M8 23c6 2 18 2 24 0" />
      </g>
      <g className="elo-ring-tilt">
        <path className="elo-ring" d="M3 20A17 5.6 0 0 0 37 20" />
        <circle className="elo-moon front" cx={rest.x} cy={rest.y} r="1.6" />
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
        onPointerEnter={(e) => spinMoon(e.currentTarget)}
        onFocus={(e) => spinMoon(e.currentTarget)}
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

  // Clicar num ponto abre o projeto já no texto dela.
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
