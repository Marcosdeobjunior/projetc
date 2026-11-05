import { useEffect, useId, useState, type CSSProperties } from "react";
import type { VaultRef } from "../platform";
import { useSettings } from "../state/settings";
import type { SyncStatus } from "../state/syncStatus";
import { Icon, Quill } from "./Icon";
import { MusicPlayer } from "./Music";
import { useMusic } from "../state/music";
import { coverHue } from "./library";

const COLLAPSED_KEY = "inkflow.homeNavCollapsed";
export const isNarrow = () => window.matchMedia("(max-width: 760px)").matches;

/**
 * Estado da barra lateral da tela de projetos. No computador ela vira um
 * trilho de ícones quando recolhida (e lembra disso); em telas estreitas é
 * uma gaveta que começa fechada.
 */
export function useHomeNav() {
  const [collapsed, setCollapsed] = useState(() => {
    if (isNarrow()) return true;
    try {
      return localStorage.getItem(COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (isNarrow()) return;
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      // sem armazenamento: vale só nesta sessão
    }
  }, [collapsed]);

  // Ctrl/⌘ + \ mostra ou esconde a barra, como no espaço de trabalho;
  // Esc fecha a gaveta em telas estreitas.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "\\" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setCollapsed((c) => !c);
      } else if (e.key === "Escape" && isNarrow()) {
        setCollapsed(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return { collapsed, toggle: () => setCollapsed((c) => !c), setCollapsed };
}

/** Nome da pasta do projeto: o último trecho do caminho no desktop. */
export function folderName(v: VaultRef, desktop: boolean): string {
  if (!desktop) return v.title;
  const parts = v.root.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] ?? v.title;
}

/** Topo do app: [botão da barra] [logo] [nome] | [• sincronização] [pasta ativa]. */
export function AppBar(props: {
  collapsed: boolean;
  onToggle(): void;
  folder: string | null;
  folderTitle?: string;
  onEditName(): void;
  /** Situação real da sincronização da pasta ativa. */
  sync: SyncStatus;
}) {
  const userName = useSettings((s) => s.userName.trim());
  return (
    <header className="appbar">
      <button
        type="button"
        className="icon-btn appbar-toggle"
        aria-label={props.collapsed ? "Mostrar barra lateral" : "Recolher barra lateral"}
        title={`${props.collapsed ? "Mostrar" : "Recolher"} barra lateral (Ctrl+\\)`}
        aria-expanded={!props.collapsed}
        aria-controls="home-nav"
        onClick={props.onToggle}
      >
        <Icon name="sidebar" size={17} />
      </button>
      <div className="appbar-id">
        <span className="appbar-logo" role="img" aria-label="InkFlow">
          <Quill size={22} />
        </span>
        {userName ? (
          <span className="appbar-user" title={userName}>
            {userName}
          </span>
        ) : (
          <button
            type="button"
            className="appbar-user empty"
            title="Definir seu nome nas configurações"
            onClick={props.onEditName}
          >
            Adicionar seu nome
          </button>
        )}
        <span className="appbar-sep" aria-hidden="true" />
        <SyncIndicator status={props.sync} />
        {props.folder ? (
          <span className="appbar-folder" title={props.folderTitle ?? props.folder}>
            <span className="sr-only">Pasta ativa: </span>
            <span className="appbar-folder-name">{props.folder}</span>
          </span>
        ) : (
          <span className="appbar-folder none">Nenhuma pasta ativa</span>
        )}
      </div>
    </header>
  );
}

/** Ponto pulsante com o estado da sincronização; a explicação aparece ao passar o mouse. */
function SyncIndicator({ status }: { status: SyncStatus }) {
  const tipId = useId();
  return (
    <span
      className={"sync " + (status.ok ? "ok" : "bad")}
      data-sync={status.kind}
      tabIndex={0}
      role="status"
      aria-label={status.label}
      aria-describedby={tipId}
    >
      <span className="pulse" aria-hidden="true" />
      <span id={tipId} role="tooltip" className="sync-tip">
        <b>{status.label}</b>
        {status.detail}
      </span>
    </span>
  );
}

/** Barra lateral da tela de projetos. */
export function HomeSidebar(props: {
  collapsed: boolean;
  onToggle(): void;
  desktop: boolean;
  busy: boolean;
  vaults: VaultRef[];
  /** Mostrado no lugar da lista quando a busca não encontra nada. */
  emptyText?: string;
  activeRoot: string | null;
  onSelect(root: string): void;
  onOpen(root: string): void;
  onCreate(): void;
  /** Só no modo de desenvolvimento: cria o livro grande de teste. */
  onCreateTestBook?(): void;
  onOpenFolder(): void;
  onSettings(): void;
  /** Abre as Configurações na seção de música. */
  onMusicSettings?(): void;
}) {
  const { collapsed } = props;
  // Recolhida, a barra mostra só ícones: o nome vira dica (title).
  const tip = (label: string) => (collapsed ? label : undefined);
  const after = (fn: () => void) => () => {
    fn();
    if (isNarrow()) props.onToggle();
  };

  const playing = useMusic(
    (s) =>
      (s.active === "library" && s.playing) || s.active === "spotify" || s.active === "youtube",
  );
  const showMusic = useMusic((s) => s.prefs.showInSidebar);
  const panelOpen = useMusic((s) => s.panelOpen);
  const setPanelOpen = useMusic((s) => s.setPanelOpen);

  return (
    <nav id="home-nav" className="home-nav" aria-label="Navegação">
      {/* Recolher/mostrar: primeira linha da própria barra, sem sobrepor nada. */}
      <div className="home-nav-head">
        <span className="nav-heading nav-label">Menu</span>
        <button
          type="button"
          className="home-nav-toggle"
          aria-label={collapsed ? "Mostrar barra lateral" : "Recolher barra lateral"}
          title={`${collapsed ? "Mostrar" : "Recolher"} barra lateral (Ctrl+\\)`}
          aria-expanded={!collapsed}
          aria-controls="home-nav"
          onClick={props.onToggle}
        >
          <Icon name={collapsed ? "chevron" : "chevron-left"} size={15} />
        </button>
      </div>
      <div className="home-nav-scroll">
        <div className="home-nav-group">
          <button
            type="button"
            className="nav-item current"
            aria-current="page"
            title={tip("Início")}
          >
            <Icon name="home" size={17} />
            <span className="nav-label">Início</span>
          </button>
          <button
            type="button"
            className="nav-item"
            title={tip("Novo projeto")}
            onClick={after(props.onCreate)}
          >
            <Icon name="plus" size={17} />
            <span className="nav-label">Novo projeto</span>
          </button>
          {props.onCreateTestBook && (
            <button
              type="button"
              className="nav-item"
              title={collapsed ? "Livro de teste" : "Cria um livro grande, só para testes"}
              disabled={props.busy}
              onClick={after(props.onCreateTestBook)}
            >
              <Icon name="bulb" size={17} />
              <span className="nav-label">Livro de teste</span>
            </button>
          )}
          {props.desktop && (
            <button
              type="button"
              className="nav-item"
              title={tip("Abrir projeto")}
              disabled={props.busy}
              onClick={after(props.onOpenFolder)}
            >
              <Icon name="folder" size={17} />
              <span className="nav-label">Abrir projeto</span>
            </button>
          )}
        </div>

        {(props.vaults.length > 0 || props.emptyText) && (
          <div className="home-nav-group home-nav-folders">
            <p className="nav-heading">
              <span className="nav-label">Pastas</span>
            </p>
            {props.emptyText && <p className="nav-empty nav-label">{props.emptyText}</p>}
            <ul>
              {props.vaults.map((v) => {
                const active = v.root === props.activeRoot;
                const name = folderName(v, props.desktop);
                return (
                  <li key={v.root}>
                    <button
                      type="button"
                      className={"nav-item folder" + (active ? " active" : "")}
                      aria-pressed={active}
                      title={collapsed ? name : "Duplo clique para abrir"}
                      onClick={after(() => props.onSelect(v.root))}
                      onDoubleClick={() => props.onOpen(v.root)}
                    >
                      <span
                        className="nav-dot"
                        style={{ "--hue": coverHue(v.title) } as CSSProperties}
                        aria-hidden="true"
                      />
                      <span className="nav-label">{name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* Música e Configurações ficam no pé da barra, separadas da navegação. */}
      <div className="home-nav-group home-nav-foot">
        {showMusic && (
          <div className="home-nav-music">
            {collapsed ? (
              <button
                type="button"
                className="nav-item"
                title={playing ? "Música (tocando)" : "Música"}
                onClick={() => {
                  setPanelOpen(true);
                  props.onToggle();
                }}
              >
                <Icon name="turntable" size={18} />
                {playing && <span className="music-live" aria-hidden="true" />}
                <span className="nav-label">Música</span>
              </button>
            ) : (
              <>
                {/* O player abre para cima: o botão fica no lugar, logo acima de Configurações. */}
                <div id="home-music" className={"music-drawer" + (panelOpen ? " open" : "")}>
                  <div className="music-drawer-inner" inert={!panelOpen} data-music-clip>
                    <MusicPlayer onSettings={props.onMusicSettings ?? props.onSettings} />
                  </div>
                </div>
                <button
                  type="button"
                  className={"nav-item music-toggle" + (panelOpen ? " open" : "")}
                  aria-expanded={panelOpen}
                  aria-controls="home-music"
                  onClick={() => setPanelOpen(!panelOpen)}
                >
                  <Icon name="turntable" size={18} />
                  <span className="nav-label">Música</span>
                  {playing && <span className="music-live" aria-hidden="true" />}
                  <span className="music-caret" aria-hidden="true">
                    <Icon name="up" size={14} />
                  </span>
                </button>
              </>
            )}
          </div>
        )}
        <button
          type="button"
          className="nav-item"
          title={tip("Configurações")}
          onClick={props.onSettings}
        >
          <Icon name="settings" size={17} />
          <span className="nav-label">Configurações</span>
        </button>
      </div>
    </nav>
  );
}
