import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "./Icon";

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * Lista de escolha com o visual do app (a lista nativa segue o sistema e não
 * aceita estilo). Teclado: setas, Home/End, Enter/Espaço escolhem, Esc fecha;
 * digitar uma letra pula para a primeira opção que começa com ela.
 */
export function Select({
  id,
  value,
  options,
  placeholder = "—",
  onChange,
}: {
  id?: string;
  value: string;
  options: SelectOption[];
  placeholder?: string;
  onChange(value: string): void;
}) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();
  // Primeira opção vazia ("—") para poder limpar o campo.
  const all: SelectOption[] = [{ value: "", label: placeholder }, ...options];
  const current = all.find((o) => o.value === value);
  const shown = current ?? { value, label: value };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    // Clicar fora da janela (ou trocar de aba) também fecha.
    const blur = () => setOpen(false);
    document.addEventListener("mousedown", close);
    window.addEventListener("blur", blur);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("blur", blur);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const show = () => {
    const r = button.current?.getBoundingClientRect();
    // Abre para cima se não couber embaixo.
    setUp(!!r && window.innerHeight - r.bottom < 260 && r.top > window.innerHeight - r.bottom);
    setActive(Math.max(0, all.indexOf(current ?? all[0]!)));
    setOpen(true);
  };
  const pick = (v: string) => {
    setOpen(false);
    button.current?.focus();
    if (v !== value) onChange(v);
  };

  const onKey = (e: KeyboardEvent) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        show();
      }
      return;
    }
    const last = all.length - 1;
    if (e.key === "ArrowDown") setActive((a) => Math.min(last, a + 1));
    else if (e.key === "ArrowUp") setActive((a) => Math.max(0, a - 1));
    else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(last);
    else if (e.key === "Enter" || e.key === " ") pick(all[active]!.value);
    else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Tab") {
      setOpen(false);
      return;
    } else if (e.key.length === 1) {
      const k = e.key.toLocaleLowerCase("pt-BR");
      const i = all.findIndex((o, j) => j > 0 && o.label.toLocaleLowerCase("pt-BR").startsWith(k));
      if (i >= 0) setActive(i);
      else return;
    } else return;
    e.preventDefault();
  };

  return (
    <div className={"select" + (open ? " open" : "") + (up ? " up" : "")} ref={root}>
      <button
        ref={button}
        id={id}
        type="button"
        className="text-input select-btn"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        onClick={(e) => {
          e.preventDefault();
          if (open) setOpen(false);
          else show();
        }}
        onKeyDown={onKey}
      >
        <span className={shown.value ? "" : "select-empty"}>{shown.label}</span>
        <Icon name="chevronDown" size={15} />
      </button>
      {open && (
        <ul ref={list} id={listId} role="listbox" className="select-list">
          {all.map((o, i) => (
            <li
              key={o.value || "__vazio"}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={o.value === value}
              className={
                (i === active ? "active" : "") +
                (o.value === value ? " chosen" : "") +
                (o.value ? "" : " empty")
              }
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                // Dentro de um <label>, o clique "subiria" e reabriria a lista.
                e.preventDefault();
                e.stopPropagation();
                pick(o.value);
              }}
            >
              <span>{o.label}</span>
              {o.value === value && <Icon name="check" size={14} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
