import { useEffect, useState, type CSSProperties } from "react";
import type { VaultRef } from "../platform";
import { useSettings } from "../state/settings";
import { Icon, Quill } from "./Icon";
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

/** Topo do app: [botão da barra] [logo] [nome] | [pasta ativa] [•]. */
export function AppBar(props: {
  collapsed: boolean;
  onToggle(): void;
  folder: string | null;
  folderTitle?: string;
  onEditName(): void;
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
        {props.folder ? (
          <span className="appbar-folder" title={props.folderTitle ?? props.folder}>
            <span className="sr-only">Pasta ativa: </span>
            <span className="appbar-folder-name">{props.folder}</span>
            <span className="pulse" aria-hidden="true" />
          </span>
        ) : (
          <span className="appbar-folder none">Nenhuma pasta ativa</span>
        )}
      </div>
    </header>
  );
}

/** Barra lateral da tela de projetos. */
export function HomeSidebar(props: {
  collapsed: boolean;
  onToggle(): void;
  desktop: boolean;
  busy: boolean;
  vaults: VaultRef[];
  activeRoot: string | null;
  onSelect(root: string): void;
  onOpen(root: string): void;
  onCreate(): void;
  onOpenFolder(): void;
  onSettings(): void;
}) {
  const { collapsed } = props;
  // Recolhida, a barra mostra só ícones: o nome vira dica (title).
  const tip = (label: string) => (collapsed ? label : undefined);
  const after = (fn: () => void) => () => {
    fn();
    if (isNarrow()) props.onToggle();
  };

  return (
    <nav id="home-nav" className="home-nav" aria-label="Navegação">
      <div className="home-nav-group">
        <button
          type="button"
          className="nav-item current"
          aria-current="page"
          title={tip("Projetos")}
        >
          <Icon name="list" size={17} />
          <span className="nav-label">Projetos</span>
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

      {props.vaults.length > 0 && (
        <div className="home-nav-group home-nav-folders">
          <p className="nav-heading">
            <span className="nav-label">Pastas</span>
          </p>
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

      <div className="home-nav-group home-nav-foot">
        <button
          type="button"
          className="nav-item"
          title={tip("Configurações")}
          onClick={props.onSettings}
        >
          <Icon name="settings" size={17} />
          <span className="nav-label">Configurações</span>
        </button>
        <button
          type="button"
          className="nav-item nav-collapse"
          title={tip("Expandir barra")}
          aria-expanded={!collapsed}
          aria-controls="home-nav"
          onClick={props.onToggle}
        >
          <Icon name="chevron" size={17} />
          <span className="nav-label">Recolher</span>
        </button>
      </div>
    </nav>
  );
}
