import { useEffect, useMemo, useState } from "react";
import { useApp, type Session } from "../state/store";
import { flushAll, serial } from "../state/writes";
import {
  compareVersion,
  deleteVersion,
  listVersions,
  readBodies,
  readVersion,
  type DocComparison,
  type DocStatus,
  type Version,
  type VersionInfo,
} from "../vault/history";
import { formatCount } from "../manuscript/wordCount";
import { KIND_LABEL } from "../links/context";
import { DocPreview } from "./DocPreview";
import { Icon } from "./Icon";

const STATUS_LABEL: Record<DocStatus, string> = {
  changed: "Mudou depois",
  removed: "Excluído depois",
  added: "Não existia",
  same: "Igual a agora",
};
const STATUS_ORDER: DocStatus[] = ["changed", "removed", "added", "same"];
const KIND_ICON = { scene: "file", personagens: "person", lugares: "pin", ideias: "bulb" };

const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const longDate = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" });

function dayLabel(at: number) {
  const d = new Date(at);
  const today = new Date();
  const yesterday = new Date(Date.now() - 864e5);
  if (d.toDateString() === today.toDateString()) return "Hoje";
  if (d.toDateString() === yesterday.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
}

const signed = (n: number) => (n > 0 ? `+${formatCount(n)}` : n < 0 ? `−${formatCount(-n)}` : "");

/** Histórico de versões do projeto inteiro: salvar, comparar e restaurar. */
export function HistoryView({ session }: { session: Session }) {
  const saveVersion = useApp((s) => s.saveVersion);
  const restoreText = useApp((s) => s.restoreText);
  const restoreVersion = useApp((s) => s.restoreVersion);
  const busy = useApp((s) => s.busy);
  const [list, setList] = useState<VersionInfo[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [version, setVersion] = useState<Version | null>(null);
  const [current, setCurrent] = useState<Record<string, string> | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [confirm, setConfirm] = useState<"restore" | "delete" | null>(null);
  const [showSame, setShowSame] = useState(false);
  const [reload, setReload] = useState(0);
  const { fs, project } = session;

  // Lista de versões e o texto atual de cada cena (gravando antes o que estiver pendente).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await flushAll();
      const [versions, bodies] = await serial(
        async () => [await listVersions(fs), await readBodies(fs, project)] as const,
      );
      if (cancelled) return;
      setList(versions);
      setCurrent(bodies);
      setSelected((s) => (s && versions.some((v) => v.id === s) ? s : (versions[0]?.id ?? null)));
    })();
    return () => {
      cancelled = true;
    };
  }, [fs, project, reload]);

  useEffect(() => {
    let cancelled = false;
    if (!selected) return;
    void serial(() => readVersion(fs, selected)).then((v) => {
      if (!cancelled) setVersion(v);
    });
    return () => {
      cancelled = true;
    };
  }, [fs, selected]);

  const rows = useMemo(() => {
    if (!version || !current || version.id !== selected) return null;
    return compareVersion(version, project, current).sort(
      (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status),
    );
  }, [version, current, project, selected]);
  const doc = rows?.find((r) => r.id === docId) ?? rows?.find((r) => r.status !== "same") ?? null;

  const groups = useMemo(() => {
    const out: { day: string; items: VersionInfo[] }[] = [];
    for (const v of list ?? []) {
      const day = dayLabel(v.createdAt);
      if (out.at(-1)?.day !== day) out.push({ day, items: [] });
      out.at(-1)!.items.push(v);
    }
    return out;
  }, [list]);

  const save = async () => {
    await saveVersion(label, false);
    setLabel("");
    setReload((n) => n + 1);
  };

  return (
    <div className="history">
      <aside className="history-list" aria-label="Versões">
        <form
          className="history-save"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <input
            value={label}
            placeholder="Nome da versão (opcional)"
            aria-label="Nome da versão"
            maxLength={80}
            onChange={(e) => setLabel(e.target.value)}
          />
          <button type="submit" className="btn primary sm" disabled={busy}>
            <Icon name="save" size={15} /> Salvar versão agora
          </button>
          <p className="hint">
            O app também guarda versões sozinho ao abrir o projeto e a cada 10 minutos de trabalho.
          </p>
        </form>

        {list === null ? (
          <p className="muted history-empty">Carregando…</p>
        ) : list.length === 0 ? (
          <p className="muted history-empty">Nenhuma versão ainda.</p>
        ) : (
          groups.map((g) => (
            <section key={g.day}>
              <h3 className="history-day">{g.day}</h3>
              <ol>
                {g.items.map((v) => {
                  const i = list.indexOf(v);
                  const delta = list[i + 1] ? v.words - list[i + 1]!.words : 0;
                  return (
                    <li key={v.id}>
                      <button
                        type="button"
                        className={"history-item" + (v.id === selected ? " on" : "")}
                        aria-current={v.id === selected ? "true" : undefined}
                        onClick={() => {
                          setSelected(v.id);
                          setDocId(null);
                          setConfirm(null);
                        }}
                      >
                        <span className="history-time">{time.format(v.createdAt)}</span>
                        <span className={"history-label" + (v.auto ? " auto" : "")}>{v.label}</span>
                        <span className="history-words">
                          {formatCount(v.words)}
                          {delta !== 0 && (
                            <b className={delta > 0 ? "up" : "down"}>{signed(delta)}</b>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))
        )}
      </aside>

      <section className="history-detail" aria-live="polite">
        {!version || !rows ? (
          <p className="muted history-empty">
            {list?.length
              ? "Carregando a versão…"
              : "Salve uma versão para poder voltar a ela depois."}
          </p>
        ) : (
          <>
            <header className="history-head">
              <div>
                <h2>{version.label}</h2>
                <p className="muted">
                  {longDate.format(version.createdAt)} · {formatCount(version.words)} palavras no
                  manuscrito
                  {version.auto && " · automática"}
                </p>
              </div>
              {confirm ? (
                <div className="confirm-inline history-confirm" role="alertdialog">
                  <span>
                    {confirm === "restore"
                      ? "Voltar o projeto inteiro para esta versão? Como está agora fica guardado no histórico antes."
                      : "Excluir esta versão do histórico?"}
                  </span>
                  <button
                    type="button"
                    className={"btn sm " + (confirm === "restore" ? "primary" : "danger")}
                    disabled={busy}
                    autoFocus
                    onClick={async () => {
                      const what = confirm;
                      setConfirm(null);
                      if (what === "restore") await restoreVersion(version);
                      else await serial(() => deleteVersion(fs, version.id));
                      setReload((n) => n + 1);
                    }}
                  >
                    {confirm === "restore" ? "Restaurar" : "Excluir"}
                  </button>
                  <button type="button" className="btn ghost sm" onClick={() => setConfirm(null)}>
                    Cancelar
                  </button>
                </div>
              ) : (
                <div className="history-actions">
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => setConfirm("restore")}
                  >
                    <Icon name="restore" size={15} /> Restaurar projeto inteiro
                  </button>
                  <button
                    type="button"
                    className="icon-btn danger"
                    title="Excluir esta versão"
                    aria-label="Excluir esta versão"
                    onClick={() => setConfirm("delete")}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              )}
            </header>

            <div className="history-body">
              <ol className="history-docs" aria-label="Textos nesta versão">
                {rows
                  .filter((r) => showSame || r.status !== "same")
                  .map((r) => (
                    <DocRow
                      key={r.id}
                      row={r}
                      on={r.id === doc?.id}
                      onClick={() => setDocId(r.id)}
                    />
                  ))}
                {rows.some((r) => r.status === "same") && (
                  <li>
                    <button
                      type="button"
                      className="link-btn history-same"
                      onClick={() => setShowSame((v) => !v)}
                    >
                      {showSame
                        ? "Esconder os textos iguais a agora"
                        : `Mostrar ${rows.filter((r) => r.status === "same").length} textos iguais a agora`}
                    </button>
                  </li>
                )}
                {rows.every((r) => r.status === "same") && (
                  <li className="muted history-nochange">Nada mudou desde esta versão.</li>
                )}
              </ol>

              <article className="history-preview">
                {doc ? (
                  <>
                    <header>
                      <h3>{doc.title}</h3>
                      {doc.status !== "added" && doc.status !== "same" && (
                        <button
                          type="button"
                          className="btn primary sm"
                          disabled={busy}
                          onClick={() => void restoreText(version, doc.id)}
                        >
                          <Icon name="restore" size={15} />
                          {doc.status === "removed" ? "Recriar este texto" : "Restaurar este texto"}
                        </button>
                      )}
                    </header>
                    {doc.status === "added" ? (
                      <p className="muted">Este texto ainda não existia nesta versão.</p>
                    ) : (
                      <DocPreview markdown={version.texts[doc.id] ?? ""} />
                    )}
                  </>
                ) : (
                  <p className="muted">Escolha um texto para ver como ele estava.</p>
                )}
              </article>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function DocRow({ row, on, onClick }: { row: DocComparison; on: boolean; onClick(): void }) {
  const where = row.type === "scene" ? row.chapter : KIND_LABEL[row.type].one;
  const delta = row.now - row.then;
  return (
    <li>
      <button type="button" className={"history-doc" + (on ? " on" : "")} onClick={onClick}>
        <Icon name={KIND_ICON[row.type]} size={15} />
        <span className="history-doc-title">
          {row.title}
          <small>{where}</small>
        </span>
        <span className={"status-chip " + row.status}>{STATUS_LABEL[row.status]}</span>
        {row.status === "changed" && delta !== 0 && (
          <span className="history-delta" title="Palavras de lá para cá">
            {signed(delta)}
          </span>
        )}
      </button>
    </li>
  );
}
