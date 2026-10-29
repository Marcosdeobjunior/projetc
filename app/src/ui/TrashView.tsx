import { useEffect, useState } from "react";
import { useApp, type Session } from "../state/store";
import { serial } from "../state/writes";
import { deleteFromTrash, emptyTrash, listTrash, type TrashEntry } from "../vault/trash";
import { parseMarkdown, splitFrontmatter } from "../markdown/parse";
import { toPlainText } from "../markdown/serialize";
import { KIND_LABEL } from "../links/context";
import { attachmentKind, KIND_ICON as ATTACHMENT_ICON } from "../editor/attachments";
import { Icon } from "./Icon";

const when = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" });

function describe(e: TrashEntry): { icon: string; what: string } {
  const { item } = e;
  switch (item.kind) {
    case "scene":
      return { icon: "file", what: `Cena de "${item.chapter.title}"` };
    case "chapter": {
      const n = item.chapter.scenes.length;
      return { icon: "folder", what: `Capítulo com ${n} ${n === 1 ? "cena" : "cenas"}` };
    }
    case "note":
      return {
        icon: { personagens: "person", lugares: "pin", ideias: "bulb" }[item.note.kind],
        what: KIND_LABEL[item.note.kind].one,
      };
    case "attachment":
      return { icon: ATTACHMENT_ICON[attachmentKind(item.name)], what: "Anexo" };
    case "backup":
      return { icon: "history", what: "Cópia guardada ao restaurar uma versão" };
  }
}

/** Itens excluídos: pôr de volta ou apagar de vez. */
export function TrashView({ session }: { session: Session }) {
  const restoreFromTrash = useApp((s) => s.restoreFromTrash);
  const busy = useApp((s) => s.busy);
  const [entries, setEntries] = useState<TrashEntry[] | null>(null);
  const [excerpts, setExcerpts] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const { fs } = session;

  useEffect(() => {
    let cancelled = false;
    void serial(async () => {
      const list = await listTrash(fs);
      // Começo do texto de cenas e notas, para lembrar o que era.
      const texts: Record<string, string> = {};
      for (const e of list) {
        if (e.item.kind !== "scene" && e.item.kind !== "note") continue;
        const md = await fs.readText(e.path);
        if (md) texts[e.id] = toPlainText(parseMarkdown(splitFrontmatter(md).body)).slice(0, 220);
      }
      return { list, texts };
    }).then(({ list, texts }) => {
      if (cancelled) return;
      setEntries(list);
      setExcerpts(texts);
    });
    return () => {
      cancelled = true;
    };
  }, [fs, reload, session.project]);

  const remove = async (id: string | "all") => {
    setConfirm(null);
    await serial(() => (id === "all" ? emptyTrash(fs) : deleteFromTrash(fs, id)));
    setReload((n) => n + 1);
  };

  return (
    <div className="trash">
      <div className="trash-inner">
        <header className="trash-head">
          <p className="muted">
            Cenas, capítulos, notas e anexos excluídos ficam aqui, dentro da pasta do projeto, até
            você apagar de vez.
          </p>
          {entries &&
            entries.length > 0 &&
            (confirm === "all" ? (
              <div className="confirm-inline">
                <span>Apagar de vez tudo o que está na lixeira?</span>
                <button
                  type="button"
                  className="btn danger sm"
                  autoFocus
                  onClick={() => void remove("all")}
                >
                  Esvaziar
                </button>
                <button type="button" className="btn ghost sm" onClick={() => setConfirm(null)}>
                  Cancelar
                </button>
              </div>
            ) : (
              <button type="button" className="btn ghost sm" onClick={() => setConfirm("all")}>
                <Icon name="trash" size={15} /> Esvaziar lixeira
              </button>
            ))}
        </header>

        {entries === null ? (
          <p className="muted">Carregando…</p>
        ) : entries.length === 0 ? (
          <div className="trash-empty">
            <Icon name="trash" size={28} />
            <p>A lixeira está vazia.</p>
          </div>
        ) : (
          <ol className="trash-list">
            {entries.map((e) => {
              const d = describe(e);
              return (
                <li key={e.id} className="trash-item">
                  <Icon name={d.icon} size={18} />
                  <div className="trash-text">
                    <span className="trash-title">{e.title}</span>
                    <span className="trash-meta">
                      {d.what} · excluído em {when.format(e.deletedAt)}
                    </span>
                    {excerpts[e.id] && <span className="trash-excerpt">{excerpts[e.id]}</span>}
                  </div>
                  {confirm === e.id ? (
                    <div className="trash-actions">
                      <button
                        type="button"
                        className="btn danger sm"
                        autoFocus
                        onClick={() => void remove(e.id)}
                      >
                        Apagar de vez
                      </button>
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={() => setConfirm(null)}
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <div className="trash-actions">
                      {e.item.kind !== "backup" && (
                        <button
                          type="button"
                          className="btn ghost sm"
                          disabled={busy}
                          onClick={async () => {
                            await restoreFromTrash(e);
                            setReload((n) => n + 1);
                          }}
                        >
                          <Icon name="restore" size={15} /> Restaurar
                        </button>
                      )}
                      <button
                        type="button"
                        className="icon-btn danger"
                        title="Apagar de vez"
                        aria-label={`Apagar "${e.title}" de vez`}
                        onClick={() => setConfirm(e.id)}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
