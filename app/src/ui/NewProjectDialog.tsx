import { useEffect, useRef, useState } from "react";
import { useApp } from "../state/store";
import { Icon } from "./Icon";

/**
 * Janela de "Novo projeto". Cria o projeto sem sair da tela de projetos:
 * ao dar certo, fecha e o novo livro já aparece selecionado na lista.
 */
export function NewProjectDialog({
  desktop,
  onClose,
  onCreated,
}: {
  desktop: boolean;
  onClose(): void;
  onCreated(root: string): void;
}) {
  const createVault = useApp((s) => s.createVault);
  const busy = useApp((s) => s.busy);
  const [title, setTitle] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const missing = title.trim() === "";

  // Esc fecha; o foco volta para onde estava ao fechar.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      before?.focus?.();
    };
  }, [onClose]);

  async function submit() {
    setTouched(true);
    setError(null);
    if (missing) {
      input.current?.focus();
      return;
    }
    const result = await createVault(title, { open: false });
    if (result.ok) onCreated(result.root);
    else if (result.error) setError(result.error);
    // ok: false sem erro = o usuário cancelou a escolha da pasta; a janela fica aberta.
  }

  const showMissing = touched && missing;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="panel modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-project-title"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="row-title">
          <h2 id="new-project-title" className="modal-title">
            Novo projeto
          </h2>
          <button type="button" className="icon-btn" aria-label="Fechar" onClick={onClose}>
            <Icon name="close" size={16} />
          </button>
        </div>

        <label htmlFor="new-project-name" className="kicker">
          Título do livro
        </label>
        <input
          id="new-project-name"
          ref={input}
          className={"modal-input" + (showMissing ? " invalid" : "")}
          value={title}
          maxLength={120}
          placeholder="Ex.: A Casa das Marés"
          autoComplete="off"
          aria-invalid={showMissing}
          aria-describedby="new-project-hint"
          onChange={(e) => {
            setTitle(e.target.value);
            setError(null);
          }}
        />
        <p id="new-project-hint" className={"small " + (showMissing ? "warn" : "faint")}>
          {showMissing
            ? "Dê um título ao livro para criar o projeto."
            : desktop
              ? "Em seguida você escolhe em qual pasta do computador ele será salvo."
              : "O projeto fica guardado neste navegador."}
        </p>

        {error && (
          <p className="modal-error" role="alert">
            {error}
          </p>
        )}

        <div className="modal-actions">
          <button type="button" className="pbtn" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="pbtn accent" disabled={busy}>
            <Icon name="plus" size={15} /> Criar projeto
          </button>
        </div>
      </form>
    </div>
  );
}
