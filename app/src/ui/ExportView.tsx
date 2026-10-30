import { useEffect, useMemo, useState } from "react";
import { useApp, type Session } from "../state/store";
import { flushAll } from "../state/writes";
import { exportBook, type ExportFormat, type ExportOptions } from "../export";
import { buildBook, type Book } from "../export/book";
import { bookHtml } from "../export/pdf";
import { textExport } from "../export/text";
import { formatCount } from "../manuscript/wordCount";
import { Icon } from "./Icon";

const FORMATS: { id: ExportFormat; name: string; hint: string; icon: string }[] = [
  { id: "docx", name: "Word", hint: "Para revisar, enviar a editoras e concursos", icon: "file" },
  { id: "pdf", name: "PDF", hint: "Para ler, imprimir ou mandar pronto", icon: "print" },
  { id: "epub", name: "E-book", hint: "EPUB, para Kindle, Kobo e celular", icon: "book" },
  { id: "md", name: "Markdown", hint: "Texto com formatação simples", icon: "file" },
  { id: "txt", name: "Texto", hint: "Só o texto, sem formatação", icon: "file" },
];

const KEY = (projectId: string) => `inkflow.export.${projectId}`;

function load(session: Session): ExportOptions {
  const p = session.project;
  const defaults: ExportOptions = {
    format: "docx",
    title: p.title,
    author: p.author ?? "",
    chapterIds: p.chapters.map((c) => c.id),
    style: "book",
    titlePage: true,
    toc: true,
    sceneTitles: false,
    chapterNumbers: true,
    pageSize: "14x21",
    images: true,
  };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY(p.id)) ?? "null") as
      (Partial<ExportOptions> & { uncheckedIds?: string[] }) | null;
    if (!saved) return defaults;
    // Capítulos novos entram marcados; os que sumiram saem.
    const known = new Set(saved.chapterIds ?? []);
    const unchecked = new Set(saved.uncheckedIds ?? []);
    const rest: Partial<ExportOptions> = { ...saved };
    delete (rest as { uncheckedIds?: string[] }).uncheckedIds;
    return {
      ...defaults,
      ...rest,
      author: p.author ?? saved.author ?? "",
      chapterIds: p.chapters.map((c) => c.id).filter((id) => known.has(id) || !unchecked.has(id)),
    };
  } catch {
    return defaults;
  }
}

/** Exportar o livro: Word, PDF, EPUB, Markdown ou texto. */
export function ExportView({ session }: { session: Session }) {
  const platform = useApp((s) => s.platform);
  const change = useApp((s) => s.change);
  const showMessage = useApp((s) => s.showMessage);
  const [opts, setOpts] = useState(() => load(session));
  const [busy, setBusy] = useState(false);
  const [book, setBook] = useState<Book | null>(null);
  const { project, fs } = session;
  const set = (patch: Partial<ExportOptions>) => setOpts((o) => ({ ...o, ...patch }));

  useEffect(() => {
    try {
      const unchecked = project.chapters
        .map((c) => c.id)
        .filter((id) => !opts.chapterIds.includes(id));
      localStorage.setItem(KEY(project.id), JSON.stringify({ ...opts, uncheckedIds: unchecked }));
    } catch {
      // sem armazenamento: as escolhas valem só agora
    }
  }, [opts, project]);

  // Prévia: monta o livro (sem as imagens) um pouco depois da última mudança.
  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(() => {
      void flushAll()
        .then(() => buildBook(fs, project, { ...opts, images: false }))
        .then((b) => !cancelled && setBook(b));
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [fs, project, opts]);

  const preview = useMemo(
    () =>
      book
        ? bookHtml(book, opts, () => "").replace(
            "</style>",
            `html{background:#d9d9de} body{background:#fff;max-width:${opts.style === "manuscript" || opts.pageSize === "A4" ? 680 : 470}px;margin:24px auto;padding:56px 48px;box-shadow:0 10px 40px -20px #0006}
             .chapter,.title-page,.toc{border-bottom:1px dashed #ccc;padding-bottom:48px;margin-bottom:48px}</style>`,
          )
        : "",
    [book, opts],
  );

  const chapters = project.chapters;
  const selected = chapters.filter((c) => opts.chapterIds.includes(c.id));
  const manuscript = opts.style === "manuscript";
  const textOnly = opts.format === "md" || opts.format === "txt";

  const run = async () => {
    if (!platform) return;
    setBusy(true);
    try {
      if ((project.author ?? "") !== opts.author.trim()) {
        await change((p) => ({ project: { ...p, author: opts.author.trim() }, ops: [] }));
      }
      await flushAll();
      const done = await exportBook(platform, fs, project, opts);
      if (done) {
        showMessage(
          opts.format === "pdf"
            ? "Na janela de impressão, escolha “Salvar como PDF” (ou “Microsoft Print to PDF”)."
            : "Livro exportado.",
          "info",
        );
      }
    } catch (err) {
      console.error(err);
      showMessage("Não foi possível exportar o livro. Tente de novo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="export">
      <form
        className="export-form"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <fieldset>
          <legend>Formato</legend>
          <div className="format-grid" role="radiogroup" aria-label="Formato">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={opts.format === f.id}
                className="format-card"
                onClick={() => set({ format: f.id })}
              >
                <Icon name={f.icon} size={18} />
                <span className="format-name">{f.name}</span>
                <span className="format-hint">{f.hint}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="export-fields">
          <legend>Livro</legend>
          <label>
            Título
            <input value={opts.title} onChange={(e) => set({ title: e.target.value })} />
          </label>
          <label>
            Autor
            <input
              value={opts.author}
              placeholder="Seu nome ou pseudônimo"
              onChange={(e) => set({ author: e.target.value })}
            />
          </label>
        </fieldset>

        {!textOnly && (
          <fieldset>
            <legend>Aparência</legend>
            {opts.format !== "epub" && (
              <div className="segmented wide" role="radiogroup" aria-label="Estilo">
                {(
                  [
                    ["book", "Livro"],
                    ["manuscript", "Manuscrito padrão"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={opts.style === id}
                    onClick={() => set({ style: id })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            <p className="hint">
              {opts.format === "epub"
                ? "O leitor de e-book ajusta a página e a fonte ao aparelho."
                : manuscript
                  ? "Times 12, espaço duplo, margens de 2,5 cm e cabeçalho com sobrenome, título e página: o formato que editoras e agentes pedem."
                  : "Serifa, recuo de parágrafo e cada capítulo começando numa página nova."}
            </p>
            {opts.format !== "epub" && !manuscript && (
              <label className="inline">
                Página
                <select
                  className="tool-select"
                  value={opts.pageSize}
                  onChange={(e) => set({ pageSize: e.target.value as ExportOptions["pageSize"] })}
                >
                  <option value="14x21">14 × 21 cm (livro)</option>
                  <option value="A5">A5</option>
                  <option value="A4">A4</option>
                </select>
              </label>
            )}
          </fieldset>
        )}

        <fieldset className="export-checks">
          <legend>Incluir</legend>
          {(
            [
              ["titlePage", "Folha de rosto"],
              ["toc", "Sumário", textOnly],
              ["chapterNumbers", "“Capítulo 1” antes do título"],
              ["sceneTitles", "Título de cada cena (sem isso, as cenas são separadas por * * *)"],
              ["images", "Imagens", textOnly],
            ] as const
          ).map(([key, label, hidden]) =>
            hidden ? null : (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={opts[key]}
                  onChange={(e) => set({ [key]: e.target.checked })}
                />
                {label}
              </label>
            ),
          )}
        </fieldset>

        <fieldset className="export-chapters">
          <legend>
            Capítulos
            <span>
              <button
                type="button"
                className="link-btn"
                onClick={() => set({ chapterIds: chapters.map((c) => c.id) })}
              >
                Todos
              </button>
              ·
              <button type="button" className="link-btn" onClick={() => set({ chapterIds: [] })}>
                Nenhum
              </button>
            </span>
          </legend>
          {chapters.map((c) => (
            <label key={c.id}>
              <input
                type="checkbox"
                checked={opts.chapterIds.includes(c.id)}
                onChange={(e) =>
                  set({
                    chapterIds: e.target.checked
                      ? chapters
                          .map((x) => x.id)
                          .filter((id) => id === c.id || opts.chapterIds.includes(id))
                      : opts.chapterIds.filter((id) => id !== c.id),
                  })
                }
              />
              <span className="export-ch-title">{c.title}</span>
              <span className="muted">
                {formatCount(c.scenes.reduce((n, s) => n + (session.words[s.id] ?? 0), 0))}
              </span>
            </label>
          ))}
        </fieldset>

        <div className="export-go">
          <span className="muted">
            {selected.length} {selected.length === 1 ? "capítulo" : "capítulos"} ·{" "}
            {formatCount(book?.words ?? 0)} palavras
          </span>
          <button type="submit" className="btn primary" disabled={busy || selected.length === 0}>
            <Icon name="export" size={16} />
            {busy ? "Exportando…" : `Exportar ${FORMATS.find((f) => f.id === opts.format)!.name}`}
          </button>
        </div>
      </form>

      <section className="export-preview" aria-label="Prévia">
        {textOnly ? (
          <pre className="export-text">
            {book ? textExport(book, opts, opts.format === "md").slice(0, 20_000) : ""}
          </pre>
        ) : (
          <iframe title="Prévia do livro" srcDoc={preview} sandbox="allow-same-origin" />
        )}
      </section>
    </div>
  );
}
