import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { useComments } from "../state/comments";
import { anchorFromSelection, resolveAnchor } from "./commentAnchors";
import { Icon } from "../ui/Icon";

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export interface Draft {
  from: string;
  to: string;
  quote: string;
  x: number;
  y: number;
}

/** Começa um comentário no trecho selecionado. Devolve null se não há seleção. */
export function startComment(editor: Editor): Draft | null {
  const anchor = anchorFromSelection(editor);
  if (!anchor) return null;
  const end = editor.view.coordsAtPos(editor.state.selection.to);
  return { ...anchor, x: end.left, y: end.bottom };
}

/** Caixinha para escrever o comentário, junto do trecho selecionado. */
export function CommentComposer({ draft, onClose }: { draft: Draft; onClose(): void }) {
  const add = useComments((s) => s.add);
  const [text, setText] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const width = 300;
  const left = Math.max(8, Math.min(draft.x - width / 2, window.innerWidth - width - 8));
  const top = Math.min(draft.y + 8, window.innerHeight - 200);

  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [onClose]);

  const save = () => {
    if (!text.trim()) return;
    void add({ text: text.trim(), quote: draft.quote, from: draft.from, to: draft.to });
    onClose();
  };

  return (
    <div
      ref={box}
      className="comment-composer"
      role="dialog"
      aria-label="Novo comentário"
      style={{ left, top, width }}
    >
      <p className="comment-quote">“{draft.quote}”</p>
      <textarea
        autoFocus
        rows={3}
        value={text}
        placeholder="Escreva o comentário…"
        aria-label="Comentário"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save();
        }}
      />
      <div className="comment-actions">
        <button type="button" className="btn ghost sm" onClick={onClose}>
          Cancelar
        </button>
        <button type="button" className="btn sm" disabled={!text.trim()} onClick={save}>
          Comentar
        </button>
      </div>
    </div>
  );
}

/** Lista de comentários da cena, ao lado do texto. */
export function CommentsPanel({ editor }: { editor: Editor | null }) {
  const comments = useComments((s) => s.comments);
  const focused = useComments((s) => s.focused);
  const { focus, update, remove, setPanel } = useComments.getState();
  const [showResolved, setShowResolved] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const open = comments.filter((c) => !c.resolved);
  const resolved = comments.filter((c) => c.resolved);

  /** Seleciona o trecho no texto e rola até ele. */
  const goTo = (id: string) => {
    focus(id);
    const c = comments.find((x) => x.id === id);
    if (!editor || !c || c.resolved) return;
    const r = resolveAnchor(editor.state, c);
    if (r) editor.chain().focus().setTextSelection(r).scrollIntoView().run();
  };

  const card = (c: (typeof comments)[number]) => {
    const missing = !c.resolved && editor ? !resolveAnchor(editor.state, c) : false;
    return (
      <li
        key={c.id}
        className={"comment-card" + (c.id === focused ? " focused" : "")}
        onClick={() => goTo(c.id)}
      >
        <p className="comment-quote">
          “{c.quote}”{missing && <span className="comment-missing"> (trecho apagado)</span>}
        </p>
        {editing?.id === c.id ? (
          <div onClick={(e) => e.stopPropagation()}>
            <textarea
              autoFocus
              rows={3}
              value={editing.text}
              aria-label="Editar comentário"
              onChange={(e) => setEditing({ id: c.id, text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditing(null);
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && editing.text.trim()) {
                  void update(c.id, { text: editing.text.trim() });
                  setEditing(null);
                }
              }}
            />
            <div className="comment-actions">
              <button type="button" className="btn ghost sm" onClick={() => setEditing(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn sm"
                disabled={!editing.text.trim()}
                onClick={() => {
                  void update(c.id, { text: editing.text.trim() });
                  setEditing(null);
                }}
              >
                Salvar
              </button>
            </div>
          </div>
        ) : (
          <p className="comment-text">{c.text}</p>
        )}
        <div className="comment-foot" onClick={(e) => e.stopPropagation()}>
          <small>{c.createdAt ? dateFmt.format(c.createdAt) : ""}</small>
          {confirming === c.id ? (
            <span className="comment-confirm">
              Excluir?
              <button
                type="button"
                className="link-btn danger"
                onClick={() => {
                  setConfirming(null);
                  void remove(c.id);
                }}
              >
                Sim
              </button>
              <button type="button" className="link-btn" onClick={() => setConfirming(null)}>
                Não
              </button>
            </span>
          ) : (
            <span className="comment-tools">
              {!c.resolved && (
                <button
                  type="button"
                  className="icon-btn sm"
                  title="Editar"
                  aria-label="Editar comentário"
                  onClick={() => setEditing({ id: c.id, text: c.text })}
                >
                  <Icon name="edit" size={14} />
                </button>
              )}
              <button
                type="button"
                className="icon-btn sm"
                title={c.resolved ? "Reabrir" : "Resolver"}
                aria-label={c.resolved ? "Reabrir comentário" : "Resolver comentário"}
                onClick={() => void update(c.id, { resolved: !c.resolved })}
              >
                <Icon name={c.resolved ? "restore" : "check"} size={14} />
              </button>
              <button
                type="button"
                className="icon-btn sm danger"
                title="Excluir"
                aria-label="Excluir comentário"
                onClick={() => setConfirming(c.id)}
              >
                <Icon name="trash" size={14} />
              </button>
            </span>
          )}
        </div>
      </li>
    );
  };

  return (
    <aside className="comments-panel" aria-label="Comentários">
      <div className="comments-head">
        <h2>
          Comentários <span className="world-count">{open.length}</span>
        </h2>
        <button
          type="button"
          className="icon-btn sm"
          aria-label="Fechar comentários"
          title="Fechar"
          onClick={() => setPanel(false)}
        >
          <Icon name="close" size={15} />
        </button>
      </div>
      {open.length === 0 && (
        <p className="muted small comments-empty">
          Selecione um trecho do texto e clique em <b>Comentar</b> na barra (ou{" "}
          <kbd>Ctrl+Alt+M</kbd>) para deixar um comentário naquele ponto.
        </p>
      )}
      <ul className="comments-list">{open.map(card)}</ul>
      {resolved.length > 0 && (
        <>
          <button
            type="button"
            className="link-btn comments-resolved-toggle"
            aria-expanded={showResolved}
            onClick={() => setShowResolved((v) => !v)}
          >
            {showResolved ? "Esconder" : "Mostrar"} resolvidos ({resolved.length})
          </button>
          {showResolved && <ul className="comments-list resolved">{resolved.map(card)}</ul>}
        </>
      )}
    </aside>
  );
}
