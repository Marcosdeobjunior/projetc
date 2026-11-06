import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { pageBox, type MiniBook } from "../book/miniBook";
import type { ShelfCovers } from "../book/shelfCovers";

/*
 * O livro da tela inicial, num objeto 3D só: fechado, gira com o mouse; ao
 * clicar, a capa abre presa à lombada e as páginas viram como folhas de
 * papel (cada folha é feita de faixas que se curvam enquanto ela gira).
 *
 * Desempenho: as animações são da Web Animations API e só mexem em
 * `transform` e `opacity`, então rodam na GPU sem o React renderizar nada a
 * cada quadro. O React só troca quais páginas estão em cada lugar no começo
 * e no fim de cada virada. Cada página desenha só o capítulo em que cai.
 */

/** Espaço entre as colunas (páginas) do texto corrido, em mm. */
const GAP = 10;
const PX_PER_MM = 96 / 25.4;

/** Graus de giro por pixel arrastado: 720px de arrasto dão uma volta inteira. */
const DEG_PER_PX = 0.5;
/** Pose de descanso do livro fechado. */
const REST = { x: 6, y: -32 };
/** Pose do livro aberto: de frente, levemente deitado para mostrar a profundidade. */
const OPEN_RX = 8;
/** Arrasto menor que isso (px) conta como clique, e o clique abre o livro. */
const CLICK_PX = 4;

/** Faixas da folha que vira (frações da largura, da lombada para fora). */
const STRIPS = [0.42, 0.33, 0.25];
/** Curvatura de cada faixa em relação à anterior, no meio da virada (graus). */
const CURL = [0, 16, 22];

const TURN_MS = 760;
const OPEN_MS = 1050;
const CLOSE_MS = 950;

/** Onde cai cada capítulo e onde o texto termina. */
export interface BookLayout {
  pages: number;
  /** Páginas (índice a partir de 0) que abrem capítulo. */
  openers: Set<number>;
  /** Primeira página de capítulo: antes dela não há cabeçalho nem número. */
  firstChapter: number;
  /** Página onde começa cada parte do miolo (veja MiniBook.parts). */
  partStart: number[];
}

/** A paginação depende só do miolo (em mm), então vale para sempre por livro. */
const layoutCache = new WeakMap<MiniBook, BookLayout>();

/**
 * Pagina o miolo: põe o texto inteiro em colunas numa caixa fora da vista
 * (cada coluna é uma página) e vê onde cai cada capítulo e onde o texto acaba.
 * Roda uma vez por livro, no carregamento, fora do React.
 */
export function paginate(book: MiniBook): BookLayout {
  const cached = layoutCache.get(book);
  if (cached) return cached;
  const b = pageBox(book.layout);
  const host = document.createElement("div");
  host.className = "mb-measure";
  host.setAttribute("aria-hidden", "true");
  const style = document.createElement("style");
  style.textContent = book.css;
  const flow = document.createElement("div");
  flow.className = "mb-flow";
  Object.assign(flow.style, flowStyle(b));
  flow.innerHTML = book.html + '<span class="mb-end"></span>';
  host.append(style, flow);
  document.body.append(host);
  try {
    const step = (b.textW + GAP) * PX_PER_MM;
    const page = (el: Element) => Math.round((el as HTMLElement).offsetLeft / step);
    const end = flow.querySelector(".mb-end");
    const chapters = [...flow.querySelectorAll(".chapter")].map(page);
    const openers = new Set(chapters);
    const layout: BookLayout = {
      pages: end ? page(end) + 1 : 1,
      openers,
      firstChapter: openers.size ? Math.min(...openers) : Infinity,
      partStart: [0, ...chapters],
    };
    layoutCache.set(book, layout);
    return layout;
  } finally {
    host.remove();
  }
}

type Phase = "closed" | "loading" | "opening" | "open" | "closing";
type Dir = "next" | "prev";
type Turn = { dir: Dir; from: number };

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Curva da virada: começa devagar (a folha descola), acelera e pousa suave. */
const ease = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t);

/** Amostra uma animação em quadros-chave (as fórmulas não cabem numa curva só). */
function frames(n: number, at: (p: number) => Keyframe): Keyframe[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    return { ...at(ease(t)), offset: t };
  });
}

/** Ângulo equivalente mais perto de zero, para o livro não dar voltas ao abrir. */
const nearZero = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;

const pose = (bx: number, rx: number, ry: number) =>
  `translateX(${bx}px) rotateX(${rx}deg) rotateY(${ry}deg)`;

/**
 * As animações em andamento (Web Animations API). Ficam fora do React: o
 * componente só pede "toque isto" e "pare tudo".
 */
class Motion {
  private running: Animation[] = [];
  play(el: Element | null | undefined, kf: Keyframe[], opts: KeyframeAnimationOptions) {
    if (!el) return null;
    const a = el.animate(kf, { fill: "forwards", ...opts });
    this.running.push(a);
    return a;
  }
  /** Desfaz tudo (a pose final já deve estar gravada no estilo). */
  stop() {
    for (const a of this.running) a.cancel();
    this.running = [];
  }
  /** Pula para o fim de tudo (os onfinish rodam). */
  finish() {
    for (const a of [...this.running]) a.finish();
  }
  speed(rate: number) {
    for (const a of this.running) a.playbackRate = rate;
  }
}

/** Espessura do livro (vem do CSS, --t). */
const thickness = (el: HTMLElement | null) =>
  (el && Number.parseFloat(getComputedStyle(el).getPropertyValue("--t"))) || 38;

export function BookScene(props: {
  title: string;
  hue: number;
  /** A capa (frente) do livro fechado. */
  cover: ReactNode;
  /** Texto embaixo do livro fechado. */
  caption: ReactNode;
  /** Livro já carregado e paginado (pré-carregado), se houver. */
  ready: MiniBook | null;
  /**
   * Capa, quarta capa e lombada desenhadas (arte pronta ou o desenho do app),
   * com as medidas reais. Sem elas, o livro usa a capa simples (`cover`).
   */
  faces?: ShelfCovers | null;
  /** Carrega e pagina o miolo (usa o cache se já estiver pronto). */
  load(): Promise<MiniBook>;
  /** Começa a carregar antes do clique (mouse em cima, foco). */
  prefetch(): void;
}) {
  const { hue } = props;
  const [phase, setPhase] = useState<Phase>("closed");
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState<MiniBook | null>(null);
  /** Abertura atual: 0 = verso da capa e primeira página. */
  const [spread, setSpread] = useState(0);
  const [turn, setTurn] = useState<Turn | null>(null);
  /** Altura do livro na tela (vem do CSS, --h). */
  const [height, setHeight] = useState(330);

  const book = loaded ?? props.ready;
  const layout = book ? (layoutCache.get(book) ?? null) : null;

  const root = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const hinge = useRef<HTMLDivElement>(null);
  const motion = useRef<Motion>(null);
  const angle = useRef(REST.y);
  const drag = useRef<{ id: number; x: number; from: number; moved: boolean } | null>(null);
  const queue = useRef<Dir[]>([]);

  const anim = () => (motion.current ??= new Motion());

  // Altura real do livro (as media queries mudam --h).
  useLayoutEffect(() => {
    const el = body.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight || 330));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Quem sai da tela no meio de uma animação não deixa nada rodando.
  useEffect(() => () => motion.current?.stop(), []);

  const box = book ? pageBox(book.layout) : null;
  // A largura segue a proporção do formato do livro (14×21, A5…).
  const faces = props.faces ?? null;
  const width = box
    ? (height * box.w) / box.h
    : faces
      ? (height * faces.widthMm) / faces.heightMm
      : (height * 2) / 3;
  const scale = box ? height / (box.h * PX_PER_MM) : 1;
  const pages = layout?.pages ?? 1;
  const last = Math.ceil(pages / 2);

  /** Grava a pose no estilo (fica valendo depois que a animação é desfeita). */
  const setPose = (bx: number, rx: number, ry: number) => {
    const el = body.current;
    el?.style.setProperty("--bx", `${bx}px`);
    el?.style.setProperty("--rx", `${rx}deg`);
    el?.style.setProperty("--ry", `${ry}deg`);
  };

  /** Luz da capa enquanto gira e a sombra que ela joga na página da direita. */
  const shadeCover = (m: Motion, opts: KeyframeAnimationOptions, closing: boolean) => {
    const el = root.current;
    const k = (p: number) => (closing ? 1 - p : p);
    m.play(
      el?.querySelector(".bk-cover-out .bk-shade"),
      frames(12, (p) => ({ opacity: Math.min(1, k(p) * 2) * 0.55 })),
      opts,
    );
    m.play(
      el?.querySelector(".bk-cover-in .bk-shade"),
      frames(12, (p) => ({ opacity: Math.max(0, 1 - k(p) * 1.6) })),
      opts,
    );
    m.play(
      el?.querySelector(".bk-base .bk-cast"),
      frames(12, (p) => ({ opacity: Math.sin(Math.PI * k(p)) * 0.7 })),
      opts,
    );
  };

  // Abrir: o livro vira de frente e desliza até a lombada ficar no meio, e a
  // capa abre na dobradiça da lombada, passando por cima do leitor.
  useLayoutEffect(() => {
    if (phase !== "opening") return;
    const m = anim();
    m.stop();
    const dur = reducedMotion() ? 1 : OPEN_MS;
    const half = width / 2;
    const t = thickness(body.current);
    m.play(
      body.current,
      [
        { transform: pose(0, REST.x, nearZero(angle.current)) },
        { transform: pose(half, OPEN_RX, 0) },
      ],
      { duration: dur * 0.6, easing: "cubic-bezier(0.3, 0.1, 0.2, 1)" },
    );
    const coverOpts = { duration: dur * 0.72, delay: dur * 0.28 };
    const cover = m.play(
      hinge.current,
      frames(18, (p) => ({ transform: `translateZ(${t / 2}px) rotateY(${-180 * p}deg)` })),
      coverOpts,
    );
    shadeCover(m, coverOpts, false);
    if (cover)
      cover.onfinish = () => {
        angle.current = 0;
        setPose(half, OPEN_RX, 0);
        hinge.current?.style.setProperty("--hinge", "-180deg");
        m.stop();
        setPhase("open");
      };
    // A pose depende só de quando a fase muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Fechar: a metade esquerda (a capa e as páginas lidas) fecha sobre a direita
  // e o livro fechado volta à pose de descanso.
  useLayoutEffect(() => {
    if (phase !== "closing") return;
    const m = anim();
    m.stop();
    const dur = reducedMotion() ? 1 : CLOSE_MS;
    const half = width / 2;
    const t = thickness(body.current);
    const coverOpts = { duration: dur * 0.62 };
    m.play(
      hinge.current,
      frames(18, (p) => ({ transform: `translateZ(${t / 2}px) rotateY(${-180 + 180 * p}deg)` })),
      coverOpts,
    );
    shadeCover(m, coverOpts, true);
    const back = m.play(
      body.current,
      [{ transform: pose(half, OPEN_RX, 0) }, { transform: pose(0, REST.x, REST.y) }],
      { duration: dur * 0.5, delay: dur * 0.5, easing: "cubic-bezier(0.3, 0.1, 0.2, 1)" },
    );
    if (back)
      back.onfinish = () => {
        angle.current = REST.y;
        setPose(0, REST.x, REST.y);
        hinge.current?.style.setProperty("--hinge", "0deg");
        m.stop();
        setSpread(0);
        setPhase("closed");
        root.current?.querySelector<HTMLElement>(".bk-hit")?.focus();
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Virar: a faixa de dentro gira inteira na lombada; as de fora curvam além
  // dela, mais no meio da virada (a ponta que a mão segura vai na frente).
  useLayoutEffect(() => {
    const m = anim();
    // Sem virada: desfaz as animações da anterior. Elas ficaram na pose final
    // ("forwards") até o React trocar as páginas de lugar, então nada pisca.
    m.stop();
    if (!turn) return;
    const el = root.current!;
    const fwd = turn.dir === "next";
    const opts: KeyframeAnimationOptions = { duration: reducedMotion() ? 1 : TURN_MS };
    // Progresso da folha: de 0 (deitada à direita) a 1 (deitada à esquerda).
    const prog = (p: number) => (fwd ? p : 1 - p);
    const strips = [...el.querySelectorAll<HTMLElement>(".bk-strip")];
    const first = strips.map((strip, i) =>
      m.play(
        strip,
        frames(20, (p) => {
          const q = prog(p);
          const bend = Math.sin(Math.PI * q) * CURL[i]! * (fwd ? -1 : 1);
          return { transform: i === 0 ? `rotateY(${-180 * q}deg)` : `rotateY(${bend}deg)` };
        }),
        opts,
      ),
    )[0];
    // Luz: a frente escurece ao se afastar da luz; o verso clareia ao deitar.
    el.querySelectorAll(".bk-strip > .front > .bk-shade").forEach((s, i) =>
      m.play(
        s,
        frames(12, (p) => ({ opacity: Math.min(1, prog(p) * 1.8) * (0.42 + i * 0.03) })),
        opts,
      ),
    );
    el.querySelectorAll(".bk-strip > .back > .bk-shade").forEach((s, i) =>
      m.play(
        s,
        frames(12, (p) => ({ opacity: Math.min(1, (1 - prog(p)) * 1.6) * (0.5 + i * 0.03) })),
        opts,
      ),
    );
    // A folha joga sombra na página de baixo, dos dois lados da lombada.
    m.play(
      el.querySelector(".bk-base .bk-cast"),
      frames(12, (p) => ({
        opacity: Math.max(0, Math.sin(Math.PI * Math.min(1, prog(p) * 1.4))) * 0.55,
      })),
      opts,
    );
    m.play(
      el.querySelector(".bk-cover-in .bk-cast"),
      frames(12, (p) => ({
        opacity: Math.max(0, Math.sin(Math.PI * Math.max(0, prog(p) * 1.4 - 0.4))) * 0.5,
      })),
      opts,
    );
    if (queue.current.length) m.speed(2.6);
    if (first)
      first.onfinish = () => {
        const to = turn.from + (fwd ? 1 : -1);
        setSpread(to);
        // Cliques rápidos: a próxima virada da fila já começa.
        const next = queue.current.shift();
        if (next && (next === "prev" ? to > 0 : to < last)) {
          setTurn({ dir: next, from: to });
        } else {
          queue.current = [];
          setTurn(null);
        }
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn]);

  // --- ações ---------------------------------------------------------------

  const close = () => {
    if (phase === "loading") return setPhase("closed");
    if (phase !== "open") return;
    queue.current = [];
    // Uma virada em andamento termina na hora.
    if (turn) {
      anim().stop();
      setSpread(turn.from + (turn.dir === "next" ? 1 : -1));
      setTurn(null);
    }
    setPhase("closing");
  };

  const go = (dir: Dir) => {
    if (phase !== "open") return;
    if (turn) {
      // Cliques rápidos: a virada atual acelera e a próxima entra logo depois.
      if (queue.current.length < 12) queue.current.push(dir);
      anim().speed(2.6);
      return;
    }
    if (dir === "prev" ? spread === 0 : spread >= last) return close();
    setTurn({ dir, from: spread });
  };

  const rotateTo = (deg: number, animate: boolean) => {
    const from = angle.current;
    angle.current = deg;
    const el = body.current;
    el?.style.setProperty("--ry", `${deg}deg`);
    if (animate && el && !reducedMotion())
      el.animate([{ transform: pose(0, REST.x, from) }, { transform: pose(0, REST.x, deg) }], {
        duration: 260,
        easing: "cubic-bezier(0.2, 0.7, 0.2, 1)",
      });
  };

  const openBook = () => {
    if (phase !== "closed") return;
    setError(false);
    setSpread(0);
    if (book && layout) return setPhase("opening");
    // Ainda carregando: a animação de espera aparece já, e some quando o
    // livro estiver pronto (não antes, nem depois).
    setPhase("loading");
    props.load().then(
      (b) => {
        setLoaded(b);
        setPhase((ph) => (ph === "loading" ? "opening" : ph));
      },
      () => {
        setError(true);
        setPhase("closed");
      },
    );
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || phase !== "closed") return;
    e.preventDefault(); // não seleciona texto nem arrasta a imagem
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.classList.add("dragging");
    drag.current = { id: e.pointerId, x: e.clientX, from: angle.current, moved: false };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d?.id !== e.pointerId) return;
    if (Math.abs(e.clientX - d.x) > CLICK_PX) d.moved = true;
    if (d.moved) rotateTo(d.from + (e.clientX - d.x) * DEG_PER_PX, false);
  };
  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d?.id !== e.pointerId) return;
    drag.current = null;
    e.currentTarget.classList.remove("dragging");
    if (e.type === "pointerup" && !d.moved) openBook();
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (phase !== "open") return onPointerEnd(e);
    if (e.button !== 0) return;
    // Livro aberto: a metade esquerda volta, a direita avança.
    const r = e.currentTarget.getBoundingClientRect();
    go(e.clientX < r.left + r.width / 2 ? "prev" : "next");
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (phase === "closed") {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openBook();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        rotateTo(angle.current + (e.key === "ArrowRight" ? 15 : -15), true);
      }
      return;
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      go(e.key === "ArrowRight" ? "next" : "prev");
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  // --- o que cada lugar mostra ----------------------------------------------

  const L = (s: number) => s * 2 - 1;
  const R = (s: number) => s * 2;
  let leftIdx = L(spread);
  let rightIdx = R(spread);
  let leafFront = R(spread);
  let leafBack = L(spread + 1);
  if (turn?.dir === "next") {
    leftIdx = L(turn.from);
    rightIdx = R(turn.from + 1);
    leafFront = R(turn.from);
    leafBack = L(turn.from + 1);
  } else if (turn?.dir === "prev") {
    leftIdx = L(turn.from - 1);
    rightIdx = R(turn.from);
    leafFront = R(turn.from - 1);
    leafBack = L(turn.from);
  }
  const showPages = phase !== "closed" && phase !== "loading" && !!book && !!layout;
  const open = phase === "open";
  const style = {
    "--hue": hue,
    "--w": `${width}px`,
    // Espessura de verdade: a lombada em mm na mesma escala da altura.
    ...(faces
      ? {
          "--t": `${Math.max(10, (faces.spineMm * height) / faces.heightMm)}px`,
          "--edge-front": faces.frontEdge,
          "--edge-back": faces.backEdge,
        }
      : {}),
  } as CSSProperties;
  const label = open
    ? `${props.title}, páginas ${Math.max(1, leftIdx + 1)} e ${Math.min(pages, rightIdx + 1)} de ${pages}. Setas para folhear, Esc para fechar.`
    : `Capa de ${props.title}. Clique ou Enter para abrir e folhear; arraste para os lados ou use as setas para girar.`;

  return (
    <figure
      ref={root}
      className={"book-preview bscene phase-" + phase + (turn ? " turning" : "")}
      style={style}
      onPointerEnter={props.prefetch}
      onFocus={props.prefetch}
    >
      {book && <style>{book.css}</style>}
      <div
        className="bk-hit"
        role={open ? "group" : "button"}
        aria-roledescription={open ? "livro" : undefined}
        aria-label={label}
        aria-busy={phase === "loading"}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerEnd}
        onLostPointerCapture={onPointerEnd}
        onKeyDown={onKeyDown}
      >
        <div className="bk-stage">
          <div className="bk" ref={body}>
            <div
              className="bk-face bk-back"
              style={faces ? { backgroundImage: `url("${faces.back}")` } : undefined}
            />
            {/* Quarta capa é um cartão com espessura: o lado de dentro (visto nas
                bordas que sobram em volta do miolo) e as quinas de fora. */}
            <div className="bk-face bk-board back inside" />
            <div className="bk-face bk-board back side" />
            <div className="bk-face bk-board back top" />
            <div className="bk-face bk-board back bottom" />
            <div className="bk-face bk-edge" />
            <div className="bk-face bk-top" />
            <div className="bk-face bk-bottom" />
            <div
              className={"bk-face bk-spine" + (faces ? " art" : "")}
              style={faces ? { backgroundImage: `url("${faces.spine}")` } : undefined}
            >
              {!faces && <span>{props.title}</span>}
            </div>
            {/* Página da direita (fica embaixo da capa e da folha que vira). */}
            <div className="bk-face bk-base">
              {showPages && (
                <PageView
                  index={rightIdx}
                  book={book}
                  layout={layout}
                  scale={scale}
                  width={width}
                  height={height}
                  pages={pages}
                />
              )}
              <i className="bk-cast" />
            </div>
            {/* A folha que vira: faixas encadeadas, cada uma com frente e verso. */}
            {showPages && (
              <div className={"bk-leaf" + (turn ? " on" : "")}>
                <Strip
                  i={0}
                  front={leafFront}
                  back={leafBack}
                  book={book}
                  layout={layout}
                  scale={scale}
                  width={width}
                  height={height}
                  pages={pages}
                />
              </div>
            )}
            {/* Capa, presa na lombada. Por dentro é a guarda ou a página da esquerda. */}
            <div className="bk-hinge" ref={hinge}>
              <div className="bk-face bk-cover-out">
                {faces ? (
                  <img className="bk-art" src={faces.front} alt="" draggable={false} />
                ) : (
                  props.cover
                )}
                <i className="bk-shade" />
              </div>
              {/* A capa também tem espessura: as quinas giram junto com ela. */}
              <div className="bk-face bk-board front side" />
              <div className="bk-face bk-board front top" />
              <div className="bk-face bk-board front bottom" />
              <div className="bk-face bk-cover-in">
                {showPages && (
                  <PageView
                    index={leftIdx}
                    book={book}
                    layout={layout}
                    scale={scale}
                    width={width}
                    height={height}
                    pages={pages}
                  />
                )}
                <i className="bk-shade" />
                <i className="bk-cast" />
              </div>
            </div>
          </div>
          <div className="bk-floor" />
        </div>
      </div>
      <figcaption>
        {phase === "loading" ? (
          <span className="bk-loading" role="status">
            <span className="bk-loader" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            Abrindo o livro…
          </span>
        ) : phase === "closed" ? (
          error ? (
            <span className="warn">Não foi possível abrir o livro.</span>
          ) : (
            <span className="bk-caption">{props.caption}</span>
          )
        ) : (
          <span className="bk-open-bar">
            <span className="bk-hint">
              Clique na página da esquerda para voltar e na da direita para avançar.
            </span>
            <button type="button" className="pbtn" onClick={close} disabled={phase !== "open"}>
              Fechar livro
            </button>
          </span>
        )}
      </figcaption>
    </figure>
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

interface PageProps {
  book: MiniBook;
  layout: BookLayout;
  scale: number;
  width: number;
  height: number;
  pages: number;
}

/**
 * Uma faixa da folha que vira e, dentro dela, a próxima faixa (encadeadas: a
 * curva de uma soma à da anterior). A frente mostra o pedaço da página que
 * está sendo virada; o verso, o pedaço da página que vai aparecer à esquerda.
 */
function Strip(props: PageProps & { i: number; front: number; back: number }) {
  const { i, width } = props;
  const start = STRIPS.slice(0, i).reduce((a, b) => a + b, 0) * width;
  const w = STRIPS[i]! * width;
  // Cada faixa entra 1px na anterior: sem fresta entre elas quando curvam.
  const bleed = i === 0 ? 0 : 1;
  const style = {
    left: i === 0 ? 0 : `${STRIPS[i - 1]! * width - bleed}px`,
    width: `${w + bleed}px`,
  };
  return (
    <div className="bk-strip" style={style}>
      <div className="bk-face front">
        <div className="bk-clip" style={{ left: -(start - bleed) }}>
          <PageView index={props.front} {...props} />
        </div>
        <i className="bk-shade" />
      </div>
      <div className="bk-face back">
        {/* No verso, a faixa mostra o lado da página que fica junto à lombada. */}
        <div className="bk-clip" style={{ left: -(width - start - w) }}>
          <PageView index={props.back} {...props} />
        </div>
        <i className="bk-shade" />
      </div>
      {i + 1 < STRIPS.length && <Strip {...props} i={i + 1} />}
    </div>
  );
}

/**
 * Uma página diagramada. Desenha só a parte do miolo (capítulo) em que a
 * página cai, deslocada até a coluna certa; trocar de página dentro do mesmo
 * capítulo só muda um `transform`.
 */
const PageView = memo(function PageView({
  index,
  book,
  layout,
  scale,
  width,
  height,
  pages,
}: PageProps & { index: number }) {
  const side = index % 2 === 0 ? "right" : "left";
  const style = { width, height };
  if (index < 0 || index >= pages)
    return <div className={"mb-page mb-endpaper " + side} style={style} aria-hidden="true" />;
  const l = book.layout;
  const box = pageBox(l);
  let part = 0;
  for (let k = layout.partStart.length - 1; k >= 0; k--)
    if (layout.partStart[k]! <= index) {
      part = k;
      break;
    }
  const local = index - layout.partStart[part]!;
  const bare = index < layout.firstChapter || layout.openers.has(index);
  const head =
    l.runningHeads && !bare ? (side === "left" ? book.author || book.title : book.title) : "";
  // A medianiz fica do lado da costura: margem interna à direita na página da esquerda.
  const inner =
    side === "left"
      ? { right: l.marginInner, left: l.marginOuter }
      : { left: l.marginInner, right: l.marginOuter };
  return (
    <div className={"mb-page " + side} style={style} aria-hidden="true">
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
            style={{ ...flowStyle(box), transform: `translateX(-${local * (box.textW + GAP)}mm)` }}
            dangerouslySetInnerHTML={{ __html: book.parts[part] ?? "" }}
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
    </div>
  );
});
