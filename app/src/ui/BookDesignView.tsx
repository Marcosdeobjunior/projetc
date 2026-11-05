import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useApp, type Session } from "../state/store";
import { flushAll, registerFlush, serial } from "../state/writes";
import {
  coverSpread,
  DEFAULT_DESIGN,
  estimatePages,
  FONTS,
  loadDesign,
  PAPER,
  pageCount,
  saveDesign,
  spineWidth,
  TRIM,
  type BookDesign,
  type CoverDesign,
  type FontId,
  type LayoutDesign,
} from "../book/design";
import { renderPart, renderSpread, toPng, type BookInfo } from "../book/cover";
import { printImage } from "../book/print";
import { interiorCss } from "../book/interior";
import { buildBook, type Book, type ExportOptions } from "../export/book";
import { printPdf } from "../export/pdf";
import { chapterHtml } from "../export/html";
import { attachmentKind, ATTACHMENTS_DIR } from "../editor/attachments";
import { formatCount } from "../manuscript/wordCount";
import { folderName } from "../vault/paths";
import { Book3D } from "./Book3D";
import { Icon } from "./Icon";

type Tab = "capa" | "quarta" | "lombada" | "miolo";
type Preview = "3d" | "aberta" | "pagina";

const TABS: { id: Tab; label: string }[] = [
  { id: "capa", label: "Capa" },
  { id: "quarta", label: "Quarta capa" },
  { id: "lombada", label: "Lombada e orelhas" },
  { id: "miolo", label: "Miolo" },
];

const ORNAMENTS = ["❦", "✦", "⁂", "* * *", "~", "◆"];

const interiorOptions = (
  book: { title: string; author: string },
  ids: string[],
): ExportOptions => ({
  format: "pdf",
  title: book.title,
  author: book.author,
  chapterIds: ids,
  style: "book",
  titlePage: true,
  toc: true,
  sceneTitles: false,
  chapterNumbers: true,
  pageSize: "14x21",
  images: true,
});

/** Diagramação: capa, quarta capa, lombada, orelhas e miolo, com o livro em 3D. */
export function BookDesignView({ session }: { session: Session }) {
  const { project, fs } = session;
  const change = useApp((s) => s.change);
  const addAttachments = useApp((s) => s.addAttachments);
  const platform = useApp((s) => s.platform);
  const showMessage = useApp((s) => s.showMessage);
  const [design, setDesign] = useState<BookDesign | null>(null);
  const [tab, setTab] = useState<Tab>("capa");
  const [preview, setPreview] = useState<Preview>("3d");
  const [faces, setFaces] = useState<{ front: string; back: string; spine: string } | null>(null);
  const [spread, setSpread] = useState<string | null>(null);
  const [sample, setSample] = useState<Book | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [author, setAuthor] = useState(project.author ?? "");

  const info: BookInfo = useMemo(() => ({ title: project.title, author }), [project.title, author]);
  const words = project.chapters.reduce(
    (n, c) => n + c.scenes.reduce((m, s) => m + (session.words[s.id] ?? 0), 0),
    0,
  );

  useEffect(() => {
    void serial(() => loadDesign(fs)).then(setDesign);
  }, [fs]);

  // Gravações pendentes (projeto gráfico e autor). Gravam pouco depois de cada
  // mudança, ao sair desta tela e antes de exportar ou sincronizar (flushAll).
  const pending = useRef<{ design?: () => Promise<unknown>; author?: () => Promise<unknown> }>({});
  useEffect(() => {
    const holder = pending;
    const flush = async () => {
      const { design: d, author: a } = holder.current;
      holder.current = {};
      await Promise.all([d?.(), a?.()]);
    };
    const unregister = registerFlush(flush);
    return () => {
      unregister();
      void flush();
    };
  }, []);

  const first = useRef(true);
  useEffect(() => {
    if (!design) return;
    if (first.current) {
      first.current = false;
      return;
    }
    const save = () => serial(() => saveDesign(fs, design));
    pending.current.design = save;
    const t = window.setTimeout(() => {
      if (pending.current.design === save) pending.current.design = undefined;
      void save();
    }, 500);
    return () => window.clearTimeout(t);
  }, [design, fs]);

  // O autor fica no projeto (usado também na exportação).
  useEffect(() => {
    if ((project.author ?? "") === author.trim()) return;
    const save = () => change((p) => ({ project: { ...p, author: author.trim() }, ops: [] }));
    pending.current.author = save;
    const t = window.setTimeout(() => {
      if (pending.current.author === save) pending.current.author = undefined;
      void save();
    }, 600);
    return () => window.clearTimeout(t);
  }, [author, project.author, change]);

  const pages = design ? pageCount(design.layout, words, project.chapters.length) : 0;
  const spine = design ? spineWidth(design.layout, pages) : 0;

  // Desenha capa, quarta capa e lombada para a prévia.
  useEffect(() => {
    if (!design) return;
    let cancelled = false;
    const t = window.setTimeout(async () => {
      const dpi = 110;
      const [f, b, s] = (await Promise.all(
        (["front", "back", "spine"] as const).map((p) => renderPart(p, design, info, dpi, spine)),
      )) as [HTMLCanvasElement, HTMLCanvasElement, HTMLCanvasElement];
      const open = await renderSpread(design, info, pages, 50, true);
      if (cancelled) return;
      setFaces({ front: f.toDataURL(), back: b.toDataURL(), spine: s.toDataURL() });
      setSpread(open.canvas.toDataURL());
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [design, info, pages, spine]);

  // Primeiro capítulo, para a prévia da página do miolo.
  useEffect(() => {
    if (preview !== "pagina" || !project.chapters[0]) return;
    let cancelled = false;
    void buildBook(fs, project, interiorOptions(info, [project.chapters[0].id])).then(
      (b) => !cancelled && setSample(b),
    );
    return () => {
      cancelled = true;
    };
  }, [preview, fs, project, info]);

  if (!design) return <div className="editor-state" aria-busy="true" />;
  const cover = design.cover;
  const layout = design.layout;
  const setCover = (patch: Partial<CoverDesign>) =>
    setDesign((d) => d && { ...d, cover: { ...d.cover, ...patch } });
  const setLayout = (patch: Partial<LayoutDesign>) =>
    setDesign((d) => d && { ...d, layout: { ...d.layout, ...patch } });
  const imageFiles = session.attachments.filter((a) => attachmentKind(a) === "image");

  const run = async (what: string, task: () => Promise<void>) => {
    setBusy(what);
    try {
      await flushAll();
      await task();
    } catch (err) {
      console.error(err);
      showMessage("Não foi possível gerar o arquivo. Tente de novo.");
    } finally {
      setBusy(null);
    }
  };

  const printInterior = () =>
    run("miolo", async () => {
      const opts = interiorOptions(
        info,
        project.chapters.map((c) => c.id),
      );
      await printPdf(await buildBook(fs, project, opts), opts, layout);
      showMessage(
        "Na janela de impressão, escolha “Salvar como PDF”. Margens: “Nenhuma” ou “Padrão”.",
        "info",
      );
    });
  const printCover = () =>
    run("capa", async () => {
      const r = await renderSpread(design, info, pages, 300);
      await printImage(r.canvas, r.widthMm, r.heightMm);
      showMessage("Na janela de impressão, escolha “Salvar como PDF” e margens “Nenhuma”.", "info");
    });
  const saveEbookCover = () =>
    run("png", async () => {
      const canvas = await renderPart("front", design, info, (1600 / TRIM[layout.trim].w) * 25.4);
      const done = await platform?.saveFile(
        `${folderName(project.title)} - capa.png`,
        await toPng(canvas),
        {
          name: "Imagem PNG",
          extensions: ["png"],
        },
      );
      if (done) showMessage("Capa salva.", "info");
    });

  return (
    <div className="design">
      <div className="design-form">
        <div className="design-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => {
                setTab(t.id);
                if (t.id === "miolo") setPreview("pagina");
                else if (preview === "pagina") setPreview("3d");
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="design-fields">
          {tab === "capa" && (
            <>
              <Field label="Título" hint="Vem do nome do projeto.">
                <input value={project.title} readOnly />
              </Field>
              <Field label="Subtítulo">
                <input
                  value={cover.subtitle}
                  onChange={(e) => setCover({ subtitle: e.target.value })}
                />
              </Field>
              <Field label="Autor">
                <input
                  value={author}
                  placeholder="Seu nome ou pseudônimo"
                  onChange={(e) => setAuthor(e.target.value)}
                />
              </Field>
              <ImagePicker
                trim={layout.trim}
                label="Imagem da capa"
                value={cover.image}
                images={imageFiles}
                onChange={(image) => setCover({ image })}
                onUpload={async (file) => {
                  const [added] = await addAttachments([file]);
                  if (added) setCover({ image: added.src });
                }}
              />
              {cover.image && (
                <Field label={`Escurecer a imagem: ${Math.round(cover.shade * 100)}%`}>
                  <input
                    type="range"
                    min={0}
                    max={0.8}
                    step={0.05}
                    value={cover.shade}
                    onChange={(e) => setCover({ shade: Number(e.target.value) })}
                  />
                </Field>
              )}
              <div className="design-row">
                <Color
                  label="Fundo"
                  value={cover.background}
                  onChange={(background) => setCover({ background })}
                />
                <Color
                  label="Degradê"
                  value={cover.background2}
                  optional
                  onChange={(background2) => setCover({ background2 })}
                />
                <Color
                  label="Texto"
                  value={cover.textColor}
                  onChange={(textColor) => setCover({ textColor })}
                />
                <Color
                  label="Cor de destaque"
                  value={cover.accent}
                  onChange={(accent) => setCover({ accent })}
                />
              </div>
              <Field label="Fonte do título">
                <FontSelect
                  value={cover.titleFont}
                  onChange={(titleFont) => setCover({ titleFont })}
                />
              </Field>
              <Field label="Posição do título" group>
                <div className="segmented wide" role="radiogroup">
                  {(
                    [
                      ["top", "Em cima"],
                      ["center", "No meio"],
                      ["bottom", "Embaixo"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={cover.placement === id}
                      onClick={() => setCover({ placement: id })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Field>
            </>
          )}

          {tab === "quarta" && (
            <>
              <Field
                label="Frase de destaque"
                hint="Uma linha que chama a atenção, no alto da quarta capa."
              >
                <input
                  value={cover.tagline}
                  onChange={(e) => setCover({ tagline: e.target.value })}
                />
              </Field>
              <Field
                label="Sinopse"
                hint="Entre 100 e 200 palavras costuma caber bem. Com orelhas, ela vai também na orelha da frente."
              >
                <textarea
                  rows={9}
                  value={cover.synopsis}
                  onChange={(e) => setCover({ synopsis: e.target.value })}
                />
              </Field>
              <Field
                label="Sobre o autor"
                hint={cover.flaps ? "Vai na orelha de trás." : "Vai embaixo da sinopse."}
              >
                <textarea
                  rows={4}
                  value={cover.authorBio}
                  onChange={(e) => setCover({ authorBio: e.target.value })}
                />
              </Field>
              <ImagePicker
                trim={layout.trim}
                label="Imagem de fundo da quarta capa"
                value={cover.backImage}
                images={imageFiles}
                onChange={(backImage) => setCover({ backImage })}
                onUpload={async (file) => {
                  const [added] = await addAttachments([file]);
                  if (added) setCover({ backImage: added.src });
                }}
              />
              <Check
                label="Reservar espaço para o código de barras (ISBN)"
                checked={cover.barcode}
                onChange={(barcode) => setCover({ barcode })}
              />
            </>
          )}

          {tab === "lombada" && (
            <>
              <Field label="Papel do miolo">
                <select
                  className="tool-select"
                  value={layout.paper}
                  onChange={(e) => setLayout({ paper: e.target.value as LayoutDesign["paper"] })}
                >
                  {Object.entries(PAPER).map(([id, p]) => (
                    <option key={id} value={id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Número de páginas"
                hint={`Estimativa pelo texto (${formatCount(words)} palavras): ${estimatePages(layout, words, project.chapters.length)} páginas. Depois de gerar o PDF do miolo, coloque aqui o número real.`}
              >
                <input
                  type="number"
                  min={0}
                  step={2}
                  value={layout.pages || ""}
                  placeholder={`${estimatePages(layout, words, project.chapters.length)} (estimado)`}
                  onChange={(e) => setLayout({ pages: Number(e.target.value) || 0 })}
                />
              </Field>
              <p className="design-measure">
                Lombada: <b>{spine.toLocaleString("pt-BR")} mm</b>
                {spine < 6 && " — fina demais para ter texto"}
                <br />
                Capa aberta (com 3 mm de sangria):{" "}
                <b>
                  {coverSpread(design, pages).width.toLocaleString("pt-BR", {
                    maximumFractionDigits: 1,
                  })}{" "}
                  × {coverSpread(design, pages).height} mm
                </b>
              </p>
              <Check
                label="Orelhas"
                checked={cover.flaps}
                onChange={(flaps) => setCover({ flaps })}
              />
              {cover.flaps && (
                <Field label="Largura de cada orelha (mm)">
                  <input
                    type="number"
                    min={40}
                    max={120}
                    value={cover.flapWidth}
                    onChange={(e) => setCover({ flapWidth: Number(e.target.value) || 80 })}
                  />
                </Field>
              )}
            </>
          )}

          {tab === "miolo" && (
            <>
              <Field label="Tamanho do livro">
                <select
                  className="tool-select"
                  value={layout.trim}
                  onChange={(e) => setLayout({ trim: e.target.value as LayoutDesign["trim"] })}
                >
                  {Object.entries(TRIM).map(([id, t]) => (
                    <option key={id} value={id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Fonte do texto">
                <FontSelect value={layout.font} onChange={(font) => setLayout({ font })} />
              </Field>
              <div className="design-row">
                <Num
                  label="Corpo (pt)"
                  value={layout.size}
                  step={0.5}
                  onChange={(size) => setLayout({ size })}
                />
                <Num
                  label="Entrelinha (× corpo)"
                  value={layout.leading}
                  step={0.05}
                  onChange={(leading) => setLayout({ leading })}
                />
              </div>
              <div className="design-row">
                <Num
                  label="Margem superior"
                  value={layout.marginTop}
                  onChange={(marginTop) => setLayout({ marginTop })}
                />
                <Num
                  label="Margem inferior"
                  value={layout.marginBottom}
                  onChange={(marginBottom) => setLayout({ marginBottom })}
                />
                <Num
                  label="Medianiz (margem interna)"
                  value={layout.marginInner}
                  onChange={(marginInner) => setLayout({ marginInner })}
                />
                <Num
                  label="Margem externa"
                  value={layout.marginOuter}
                  onChange={(marginOuter) => setLayout({ marginOuter })}
                />
              </div>
              <Field label="Ornamento entre cenas" group>
                <div className="segmented wide ornaments" role="radiogroup">
                  {ORNAMENTS.map((o) => (
                    <button
                      key={o}
                      type="button"
                      role="radio"
                      aria-checked={layout.ornament === o}
                      onClick={() => setLayout({ ornament: o })}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </Field>
              <Check
                label="Capitular (primeira letra grande e primeira linha em versalete no começo do capítulo)"
                checked={layout.dropCap}
                onChange={(dropCap) => setLayout({ dropCap })}
              />
              <Check
                label="Cabeço (título corrente): autor nas páginas pares, título nas ímpares"
                checked={layout.runningHeads}
                onChange={(runningHeads) => setLayout({ runningHeads })}
              />
              <Check
                label="Capítulo sempre começa na página da direita"
                checked={layout.chapterOnRight}
                onChange={(chapterOnRight) => setLayout({ chapterOnRight })}
              />
              <button
                type="button"
                className="link-btn"
                onClick={() => setDesign((d) => d && { ...d, layout: DEFAULT_DESIGN.layout })}
              >
                Voltar ao padrão
              </button>
            </>
          )}
        </div>

        <div className="design-actions">
          <span className="muted">Arquivos para a gráfica e as lojas:</span>
          <button
            type="button"
            className="btn ghost sm"
            disabled={!!busy}
            onClick={() => void printInterior()}
          >
            <Icon name="print" size={15} /> {busy === "miolo" ? "Gerando…" : "PDF do miolo"}
          </button>
          <button
            type="button"
            className="btn ghost sm"
            disabled={!!busy}
            onClick={() => void printCover()}
          >
            <Icon name="print" size={15} /> {busy === "capa" ? "Gerando…" : "PDF da capa aberta"}
          </button>
          <button
            type="button"
            className="btn ghost sm"
            disabled={!!busy}
            onClick={() => void saveEbookCover()}
          >
            <Icon name="image" size={15} /> {busy === "png" ? "Gerando…" : "Capa para e-book (PNG)"}
          </button>
        </div>
      </div>

      <section className="design-preview" aria-label="Prévia">
        <div className="design-preview-tabs segmented" role="radiogroup" aria-label="Prévia">
          {(
            [
              ["3d", "Livro 3D"],
              ["aberta", "Capa aberta"],
              ["pagina", "Página do miolo"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={preview === id}
              onClick={() => setPreview(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {preview === "3d" &&
          (faces ? (
            <Book3D
              front={faces.front}
              back={faces.back}
              spine={faces.spine}
              widthMm={TRIM[layout.trim].w}
              heightMm={TRIM[layout.trim].h}
              spineMm={spine}
            />
          ) : (
            <div className="editor-state" aria-busy="true" />
          ))}
        {preview === "aberta" && spread && (
          <div className="design-spread">
            <img src={spread} alt="Capa aberta: quarta capa, lombada e capa" />
            <p className="muted">
              Da esquerda para a direita: {cover.flaps && "orelha, "}quarta capa, lombada, capa
              {cover.flaps && ", orelha"}. A borda de 3 mm (sangria) é cortada pela gráfica.
            </p>
          </div>
        )}
        {preview === "pagina" && (
          <iframe
            className="design-page"
            title="Página do miolo"
            sandbox="allow-same-origin"
            srcDoc={sample ? pageSample(sample, layout) : ""}
          />
        )}
      </section>
    </div>
  );
}

/** Prévia de páginas do miolo (na tela, sem paginação real). */
function pageSample(book: Book, layout: LayoutDesign) {
  const trim = TRIM[layout.trim];
  const opts = interiorOptions(book, []);
  const fonts = [...document.styleSheets]
    .flatMap((s) => {
      try {
        return [...s.cssRules].filter((r) => r instanceof CSSFontFaceRule).map((r) => r.cssText);
      } catch {
        return [];
      }
    })
    .join("\n");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>${fonts}
${interiorCss(book, layout)}
html { background: #d9d9de; }
body { width: ${trim.w}mm; min-height: ${trim.h}mm; box-sizing: border-box; margin: 24px auto;
  padding: ${layout.marginTop}mm ${layout.marginOuter}mm ${layout.marginBottom}mm ${layout.marginInner}mm;
  background: #fff; box-shadow: 0 10px 40px -20px #0006; }
.title-page, .credits { display: none; }
.chapter > header { margin-top: 10%; }
figure img[src=""] { display: none; }
</style></head><body>${book.chapters.map((c) => chapterHtml(c, opts, () => "")).join("")}</body></html>`;
}

/**
 * Campo com título. `group`: para grupos de botões, que não podem ficar dentro
 * de um <label> (clicar no título acionaria o primeiro botão).
 */
function Field({
  label,
  hint,
  group,
  children,
}: {
  label: string;
  hint?: string;
  group?: boolean;
  children: ReactNode;
}) {
  if (group) {
    return (
      <div className="design-field" role="group" aria-label={label}>
        <span>{label}</span>
        {children}
        {hint && <small className="hint">{hint}</small>}
      </div>
    );
  }
  return (
    <label className="design-field">
      <span>{label}</span>
      {children}
      {hint && <small className="hint">{hint}</small>}
    </label>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange(v: boolean): void;
}) {
  return (
    <label className="design-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function Num({
  label,
  value,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  onChange(v: number): void;
}) {
  return (
    <label className="design-field">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (e.target.value !== "" && v >= 0) onChange(v);
        }}
      />
    </label>
  );
}

function Color({
  label,
  value,
  optional,
  onChange,
}: {
  label: string;
  value: string;
  optional?: boolean;
  onChange(v: string): void;
}) {
  return (
    <label className="design-color">
      <span>{label}</span>
      <input type="color" value={value || "#000000"} onChange={(e) => onChange(e.target.value)} />
      {optional && value && (
        <button type="button" className="link-btn" onClick={() => onChange("")}>
          Remover
        </button>
      )}
    </label>
  );
}

function FontSelect({ value, onChange }: { value: FontId; onChange(v: FontId): void }) {
  return (
    <select
      className="tool-select"
      value={value}
      onChange={(e) => onChange(e.target.value as FontId)}
    >
      {Object.entries(FONTS).map(([id, f]) => (
        <option key={id} value={id} style={{ fontFamily: f.css }}>
          {f.label}
        </option>
      ))}
    </select>
  );
}

/** Pixels para imprimir uma medida (mm, com a sangria) a 300 dpi. */
const printPx = (mm: number) => Math.ceil(((mm + 6) / 25.4) * 300);

function ImagePicker({
  label,
  value,
  images,
  trim,
  onChange,
  onUpload,
}: {
  trim: LayoutDesign["trim"];
  label: string;
  value: string;
  images: string[];
  onChange(src: string): void;
  onUpload(file: File): Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="design-field">
      <span>{label}</span>
      <div className="design-image">
        <select className="tool-select" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Sem imagem (só cor)</option>
          {images.map((name) => (
            <option key={name} value={`${ATTACHMENTS_DIR}/${name}`}>
              {name}
            </option>
          ))}
        </select>
        <button type="button" className="btn ghost sm" onClick={() => input.current?.click()}>
          Escolher imagem…
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onUpload(f);
            e.target.value = "";
          }}
        />
      </div>
      <small className="hint">
        Para a impressão sair nítida, use uma imagem de pelo menos {printPx(TRIM[trim].w)} ×{" "}
        {printPx(TRIM[trim].h)} px.
      </small>
    </div>
  );
}
