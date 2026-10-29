import { useEffect, useRef, useState } from "react";
import { useApp, type Session } from "../state/store";
import { Icon, Quill } from "./Icon";

/**
 * Nome do projeto no topo da barra lateral. Ao clicar, abre um menu para
 * trocar de projeto, renomear, abrir outro ou voltar para a lista.
 */
export function VaultSwitcher({ session, onRename }: { session: Session; onRename: () => void }) {
  const platform = useApp((s) => s.platform);
  const vaults = useApp((s) => s.vaults);
  const switchVault = useApp((s) => s.switchVault);
  const closeVault = useApp((s) => s.closeVault);
  const openExistingFolder = useApp((s) => s.openExistingFolder);
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const desktop = platform?.kind === "desktop";
  const others = vaults.filter((v) => v.root !== session.root).slice(0, 8);

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const onDown = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node) && e.target !== button.current) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = (i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length;
      items[next]?.focus();
    }
  };

  return (
    <div className="switcher">
      <button
        ref={button}
        type="button"
        className="switch-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Trocar de projeto"
        onClick={() => setOpen((o) => !o)}
      >
        <Quill size={22} />
        <span className="switch-title">{session.project.title}</span>
        <Icon name="chevronDown" size={16} />
      </button>

      {open && (
        <div ref={menu} className="menu" role="menu" aria-label="Projetos" onKeyDown={onKeyDown}>
          {others.length > 0 && (
            <>
              <div className="menu-label">Trocar para</div>
              {others.map((v) => (
                <button
                  key={v.root}
                  type="button"
                  role="menuitem"
                  className="menu-item"
                  onClick={run(() => void switchVault(v.root))}
                >
                  <span className="menu-main">{v.title}</span>
                  {desktop && <small className="menu-sub">{v.location}</small>}
                </button>
              ))}
              <div className="menu-sep" role="separator" />
            </>
          )}
          <button type="button" role="menuitem" className="menu-item" onClick={run(onRename)}>
            <Icon name="edit" size={16} /> Renomear este projeto
          </button>
          {desktop && (
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={run(() => void openExistingFolder())}
            >
              <Icon name="folder" size={16} /> Abrir projeto existente…
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={run(() => void closeVault())}
          >
            <Icon name="plus" size={16} /> Novo projeto…
          </button>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={run(() => void closeVault())}
          >
            <Icon name="swap" size={16} /> Ver todos os projetos
          </button>
        </div>
      )}
    </div>
  );
}
