import { useEffect, useRef, useState } from "react";
import { useApp } from "../state/store";
import { serial } from "../state/writes";
import { readDocBody, writeSceneMarkdown } from "../vault/vault";
import { parseMarkdown } from "../markdown/parse";
import { toPlainText } from "../markdown/serialize";
import { Icon } from "../ui/Icon";

/**
 * Edição rápida de uma nota sem sair do texto: o Markdown da ficha num campo,
 * gravado direto no .md (ao abrir a nota depois, o editor aplica a mudança).
 */
export function NoteQuickEdit({
  noteId,
  title,
  x,
  y,
  onClose,
  onOpenProfile,
}: {
  noteId: string;
  title: string;
  x: number;
  y: number;
  onClose(): void;
  onOpenProfile(): void;
}) {
  const [text, setText] = useState<string | null>(null);
  const [original, setOriginal] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const session = useApp.getState().session;
    if (!session) return;
    let alive = true;
    void serial(() => readDocBody(session.fs, session.project, noteId))
      .then((body) => {
        if (!alive) return;
        setOriginal(body);
        setText(body);
      })
      .catch(() => alive && setError("Não foi possível ler a ficha."));
    return () => {
      alive = false;
    };
  }, [noteId]);

  const dirty = text !== null && text !== original;
  const close = () => {
    if (dirty && !window.confirm("Descartar as mudanças na ficha?")) return;
    onClose();
  };

  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node) && !dirty) onClose();
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [dirty, onClose]);

  const save = async () => {
    const session = useApp.getState().session;
    if (!session || text === null) return;
    setSaving(true);
    try {
      const body = text.endsWith("\n") ? text : text + "\n";
      await serial(() => writeSceneMarkdown(session.fs, session.project, noteId, body));
      // Atualiza a contagem, as menções e o Mundo sem precisar abrir a nota.
      useApp.getState().setDocText(noteId, toPlainText(parseMarkdown(body)));
      onClose();
    } catch {
      setError("Não foi possível gravar. Tente de novo.");
    } finally {
      setSaving(false);
    }
  };

  const width = 380;
  return (
    <div
      ref={box}
      className="quick-edit"
      role="dialog"
      aria-label={`Editar ${title}`}
      style={{
        left: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
        top: Math.min(y + 8, window.innerHeight - 320),
        width,
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && dirty) void save();
      }}
    >
      <div className="quick-edit-head">
        <b>{title}</b>
        <button type="button" className="link-btn" onClick={onOpenProfile}>
          Abrir ficha
        </button>
      </div>
      {text === null ? (
        <p className="muted small">{error ?? "Carregando…"}</p>
      ) : (
        <textarea
          autoFocus
          rows={8}
          value={text}
          aria-label={`Texto da ficha de ${title}`}
          onChange={(e) => setText(e.target.value)}
        />
      )}
      {error && text !== null && <p className="setting-error">{error}</p>}
      <div className="comment-actions">
        <small className="muted">Ctrl+Enter salva · Esc fecha</small>
        <button type="button" className="btn ghost sm" onClick={close}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn sm"
          disabled={!dirty || saving}
          onClick={() => void save()}
        >
          <Icon name="check" size={14} /> Salvar
        </button>
      </div>
    </div>
  );
}
