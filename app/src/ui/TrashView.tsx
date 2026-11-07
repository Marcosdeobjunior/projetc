import { useEffect, useState } from "react";
import { useApp, type Session } from "../state/store";
import { serial } from "../state/writes";
import { deleteFromTrash, emptyTrash, listTrash, type TrashEntry } from "../vault/trash";
import { parseMarkdown, splitFrontmatter } from "../markdown/parse";
import { toPlainText } from "../markdown/serialize";
import { KIND_LABEL } from "../links/context";
import { attachmentKind, KIND_ICON as ATTACHMENT_ICON } from "../editor/attachments";
import { readBackup, restorable, type BackupContents } from "../vault/backup";
import { Icon } from "./Icon";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** O que há numa cópia de segurança, numa linha: o começo do texto ou a lista do que tem. */
function backupSummary(c: BackupContents): string {
  if (c.texts.length === 1 && c.attachments.length === 0) return excerpt(c.texts[0]!.body);
  const parts = [
    c.texts.length ? plural(c.texts.length, "texto", "textos") : "",
    c.attachments.length ? plural(c.attachments.length, "anexo", "anexos") : "",
    c.other.length ? plural(c.other.length, "arquivo técnico", "arquivos técnicos") : "",
  ].filter(Boolean);
  const names = c.texts
    .slice(0, 4)
    .map((t) => t.title)
    .join(", ");
  return parts.length
    ? `${parts.join(", ")}${names ? `: ${names}${c.texts.length > 4 ? "…" : ""}` : ""}`
    : "Vazia";
}

const excerpt = (md: string) => toPlainText(parseMarkdown(md)).slice(0, 220);

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
      return { icon: "history", what: "Cópia de segurança" };
  }
}

/** Itens excluídos: pôr de volta ou apagar de vez. */
export function TrashView({ session }: { session: Session }) {
  const restoreFromTrash = useApp((s) => s.restoreFromTrash);
  const busy = useApp((s) => s.busy);
  const [entries, setEntries] = useState<TrashEntry[] | null>(null);
  const [excerpts, setExcerpts] = useState<Record<string, string>>({});
  /** Cópias de segurança que têm algo para pôr de volta no projeto. */
  const [canRestore, setCanRestore] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const { fs } = session;

  useEffect(() => {
    let cancelled = false;
    void serial(async () => {
      const list = await listTrash(fs);
      // Começo do texto de cenas e notas, para lembrar o que era.
      const texts: Record<string, string> = {};
      const restore = new Set<string>();
      const files = list.some((e) => e.item.kind === "backup") ? await fs.walk() : [];
      for (const e of list) {
        if (e.item.kind === "backup") {
          const contents = await readBackup(fs, e, files);
          texts[e.id] = backupSummary(contents);
          if (restorable(contents)) restore.add(e.id);
          continue;
        }
        if (e.item.kind !== "scene" && e.item.kind !== "note") continue;
        const md = await fs.readText(e.path);
        if (md) texts[e.id] = excerpt(splitFrontmatter(md).body);
      }
      return { list, texts, restore };
    }).then(({ list, texts, restore }) => {
      if (cancelled) return;
      setEntries(list);
      setExcerpts(texts);
      setCanRestore(restore);
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
            você apagar de vez. As cópias de segurança voltam como textos novos, sem substituir
            nada.
          </p>
          {entries &&
            entries.length > 0 &&
            (confirm === "all" ? (
              <div className="confirm-inline">
                <span>Apagar de vez tudo o que está na Lixeira?</span>
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
                <Icon name="trash" size={15} /> Esvaziar Lixeira
              </button>
            ))}
        </header>

        {entries === null ? (
          <p className="muted">Carregando…</p>
        ) : entries.length === 0 ? (
          <div className="trash-empty">
            <Icon name="trash" size={28} />
            <p>A Lixeira está vazia.</p>
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
                      {(e.item.kind !== "backup" || canRestore.has(e.id)) && (
                        <button
                          type="button"
                          className="btn ghost sm"
                          disabled={busy}
                          title={
                            e.item.kind === "backup"
                              ? "Volta como textos novos e anexos, sem substituir nada do projeto"
                              : undefined
                          }
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
