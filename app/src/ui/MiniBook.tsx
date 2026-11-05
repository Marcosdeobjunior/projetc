import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { pageBox, type MiniBook } from "../book/miniBook";

/** Espaço entre as colunas (páginas) do texto corrido, em mm. */
const GAP = 10;
const PX_PER_MM = 96 / 25.4;

interface Layout {
  /** Total de páginas do miolo. */
  pages: number;
  /** Páginas (índice a partir de 0) que abrem capítulo. */
  openers: Set<number>;
  /** Primeira página de capítulo: antes dela não há cabeçalho nem número. */
  firstChapter: number;
}

/**
 * O livro aberto em miniatura: duas páginas lado a lado, diagramadas como na
 * impressão. Clicar na página da esquerda volta, na da direita avança. Na
 * primeira abertura a esquerda é o verso da capa (clicar fecha o livro) e,
 * depois da última página, a direita é a contracapa (clicar também fecha).
 */
export function MiniBookSpread({
  book,
  height,
  hue,
  onClose,
}: {
  book: MiniBook;
  /** Altura de cada página na tela, em px. */
  height: number;
  hue: number;
  onClose(): void;
}) {
  const box = pageBox(book.layout);
  const scale = height / (box.h * PX_PER_MM);
  const [spread, setSpread] = useState(0);
  const [turn, setTurn] = useState<"next" | "prev" | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const measure = useRef<HTMLDivElement>(null);

  // Mede onde cai cada capítulo e onde o texto termina: cada coluna da
  // caixa de medição é uma página.
  useLayoutEffect(() => {
    const flow = measure.current;
    if (!flow) return;
    const step = (box.textW + GAP) * PX_PER_MM;
    const page = (el: Element) => Math.round((el as HTMLElement).offsetLeft / step);
    const run = () => {
      const end = flow.querySelector(".mb-end");
      const openers = new Set([...flow.querySelectorAll(".chapter")].map(page));
      setLayout({
        pages: end ? page(end) + 1 : 1,
        openers,
        firstChapter: openers.size ? Math.min(...openers) : Infinity,
      });
    };
    run();
    // As fontes podem chegar depois e mudar a paginação.
    void document.fonts?.ready.then(run);
  }, [book, box.textW]);

  const pages = layout?.pages ?? 1;
  const last = Math.ceil(pages / 2); // última abertura: a contracapa fica à direita (ou à esquerda)
  const go = (dir: "next" | "prev") => {
    if (dir === "prev" ? spread === 0 : spread >= last) return onClose();
    setTurn(dir);
    setSpread((s) => s + (dir === "next" ? 1 : -1));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      go(e.key === "ArrowRight" ? "next" : "prev");
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  const left = spread * 2 - 1;
  const right = spread * 2;
  const style = {
    "--hue": hue,
    "--mb-w": `${box.w * PX_PER_MM * scale}px`,
    "--mb-h": `${height}px`,
  } as CSSProperties;
  const flow = { __html: book.html + '<span class="mb-end"></span>' };

  return (
    <div
      className="minibook"
      style={style}
      role="group"
      aria-roledescription="livro"
      aria-label={`${book.title}, páginas ${Math.max(1, left + 1)} e ${Math.min(pages, right + 1)} de ${pages}. Setas para folhear, Esc para fechar.`}
      tabIndex={0}
      onKeyDown={onKeyDown}
      // o foco vai para o livro que acabou de abrir
      autoFocus
    >
      <style>{book.css}</style>
      {/* Caixa de medição: o texto inteiro em colunas, fora da vista. */}
      <div className="mb-measure" aria-hidden="true">
        <div
          ref={measure}
          className="mb-flow"
          style={flowStyle(box)}
          dangerouslySetInnerHTML={flow}
        />
      </div>
      <div className={"mb-spread" + (turn ? " turn-" + turn : "")} key={spread}>
        <Page
          side="left"
          index={left}
          pages={pages}
          layout={layout}
          book={book}
          scale={scale}
          html={flow}
          onClick={() => go("prev")}
        />
        <Page
          side="right"
          index={right}
          pages={pages}
          layout={layout}
          book={book}
          scale={scale}
          html={flow}
          onClick={() => go("next")}
        />
      </div>
    </div>
  );
}

function flowStyle(box: ReturnType<typeof pageBox>): CSSProperties {
  return {
    width: `${box.textW}mm`,
    height: `${box.textH}mm`,
    columnWidth: `${box.textW}mm`,
    columnGap: `${GAP}mm`,
    columnFill: "auto",
  };
}

function Page(props: {
  side: "left" | "right";
  index: number;
  pages: number;
  layout: Layout | null;
  book: MiniBook;
  scale: number;
  html: { __html: string };
  onClick(): void;
}) {
  const { side, index, pages, layout, book, scale } = props;
  const l = book.layout;
  const box = pageBox(l);
  const cover = index < 0 || index >= pages; // verso da capa ou da contracapa
  const label = side === "left" ? "Página anterior" : "Próxima página";
  if (cover)
    return (
      <button
        type="button"
        className={"mb-page mb-endpaper " + side}
        aria-label={index < 0 ? "Fechar o livro" : "Fechar o livro (fim)"}
        tabIndex={-1}
        onClick={props.onClick}
      />
    );
  const bare = !layout || index < layout.firstChapter || layout.openers.has(index);
  const head =
    l.runningHeads && !bare ? (side === "left" ? book.author || book.title : book.title) : "";
  // A medianiz fica do lado da costura: margem interna à direita na página da esquerda.
  const inner =
    side === "left"
      ? { right: l.marginInner, left: l.marginOuter }
      : { left: l.marginInner, right: l.marginOuter };
  return (
    <button
      type="button"
      className={"mb-page " + side}
      aria-label={label}
      tabIndex={-1}
      onClick={props.onClick}
    >
      <div
        className="mb-sheet"
        style={{ width: `${box.w}mm`, height: `${box.h}mm`, transform: `scale(${scale})` }}
      >
        {head && (
          <div
            className="mb-head mb-flow"
            style={{
              top: `${l.marginTop / 2.4}mm`,
              left: `${inner.left}mm`,
              right: `${inner.right}mm`,
            }}
          >
            {head}
          </div>
        )}
        <div
          className="mb-window"
          style={{
            top: `${l.marginTop}mm`,
            left: `${inner.left}mm`,
            width: `${box.textW}mm`,
            height: `${box.textH}mm`,
          }}
        >
          <div
            className="mb-flow"
            style={{ ...flowStyle(box), transform: `translateX(-${index * (box.textW + GAP)}mm)` }}
            dangerouslySetInnerHTML={props.html}
          />
        </div>
        {!bare && (
          <div
            className={"mb-folio mb-flow " + side}
            style={{
              bottom: `${l.marginBottom / 2.6}mm`,
              left: `${inner.left}mm`,
              right: `${inner.right}mm`,
            }}
          >
            {index + 1}
          </div>
        )}
      </div>
    </button>
  );
}
