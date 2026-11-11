import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
  type WheelEvent,
} from "react";
import type { Session } from "../state/store";
import { useApp } from "../state/store";
import { useWorldMap } from "../state/worldMap";
import { useWorldNav } from "../state/worldNav";
import {
  BIOMES,
  cellOf,
  COLS,
  DEFAULT_OPTIONS,
  deriveWorld,
  generateWorld,
  makeNamer,
  newId,
  ROWS,
  SEA,
  stateColor,
  TEMPLATES,
  type Burg,
  type Template,
  type WorldMap,
  type WorldOptions,
} from "../world/worldgen";
import { bakeBase, buildVectors, type MapMode } from "../world/worldRender";
import { Icon } from "./Icon";
import { Select } from "./Select";

/*
 * Mapa-múndi do projeto: gera um mundo (continentes, clima, biomas, rios,
 * estados, cidades e estradas) e deixa editar tudo: pincel de relevo, cidades,
 * capitais, nomes e cores dos estados. Cidades podem ser ligadas a lugares do
 * Mundo.
 */

type Tool = "mover" | "elevar" | "rebaixar" | "suavizar" | "cidade";

const TOOLS: { value: Tool; icon: string; label: string; hint: string }[] = [
  {
    value: "mover",
    icon: "grip",
    label: "Mover",
    hint: "Arraste para mover, clique para escolher",
  },
  { value: "elevar", icon: "up", label: "Elevar", hint: "Pinte para subir o terreno (cria terra)" },
  {
    value: "rebaixar",
    icon: "down",
    label: "Rebaixar",
    hint: "Pinte para baixar o terreno (cria mar)",
  },
  { value: "suavizar", icon: "wave", label: "Suavizar", hint: "Pinte para suavizar o relevo" },
  { value: "cidade", icon: "pin", label: "Cidade", hint: "Clique em terra para pôr uma cidade" },
];

const LAYERS = [
  ["rios", "Rios"],
  ["estradas", "Estradas"],
  ["fronteiras", "Fronteiras"],
  ["estados", "Cor dos estados"],
  ["cidades", "Cidades"],
  ["rotulos", "Nomes"],
] as const;
type Layer = (typeof LAYERS)[number][0];

const newSeed = () => Math.floor(Math.random() * 2 ** 32);

interface Snapshot {
  heights: Uint8Array;
  burgs: Burg[];
  states: WorldMap["states"];
}

export function WorldMapView({ session }: { session: Session }) {
  const { map, loaded, focusBurg } = useWorldMap();
  const setMap = useWorldMap((s) => s.set);
  useEffect(() => {
    void useWorldMap.getState().load();
  }, [session.root]);

  if (!loaded) return <div className="editor-state">Abrindo o mapa…</div>;
  if (!map) return <NewWorld onCreate={(m) => setMap(m)} title={session.project.title} />;
  return <WorldEditor key={session.root} session={session} map={map} focusBurg={focusBurg} />;
}

/* ---------- Gerar ---------- */

function GenerateForm({
  initial,
  onGenerate,
  submitLabel,
}: {
  initial: Omit<WorldOptions, "seed">;
  onGenerate(o: WorldOptions): void;
  submitLabel: string;
}) {
  const [o, setO] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="wm-form"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        // Deixa a tela mostrar "Gerando…" antes do cálculo.
        setTimeout(() => {
          onGenerate({ ...o, seed: newSeed() });
          setBusy(false);
        }, 30);
      }}
    >
      <label className="wm-row">
        <span>Tipo de mundo</span>
        <Select
          value={o.template}
          options={TEMPLATES.map((t) => ({ value: t.value, label: t.label }))}
          onChange={(v) => v && setO({ ...o, template: v as Template })}
        />
      </label>
      <label className="wm-row">
        <span>Terra: {Math.round(o.land * 100)}%</span>
        <input
          type="range"
          min={15}
          max={60}
          value={Math.round(o.land * 100)}
          onChange={(e) => setO({ ...o, land: +e.target.value / 100 })}
        />
      </label>
      <label className="wm-row">
        <span>Estados: {o.states}</span>
        <input
          type="range"
          min={1}
          max={20}
          value={o.states}
          onChange={(e) => setO({ ...o, states: +e.target.value })}
        />
      </label>
      <label className="wm-row">
        <span>Cidades: {o.burgs}</span>
        <input
          type="range"
          min={5}
          max={200}
          step={5}
          value={o.burgs}
          onChange={(e) => setO({ ...o, burgs: Math.max(+e.target.value, o.states) })}
        />
      </label>
      <button type="submit" className="btn primary" disabled={busy}>
        <Icon name="refresh" size={15} /> {busy ? "Gerando…" : submitLabel}
      </button>
    </form>
  );
}

function NewWorld({ onCreate, title }: { onCreate(m: WorldMap): void; title: string }) {
  return (
    <div className="wm-empty">
      <div className="wm-empty-card">
        <Icon name="globe" size={34} />
        <h2>Mapa-múndi</h2>
        <p>
          Gere o mapa do mundo de {title}: continentes, clima e biomas, rios, estados com
          fronteiras, cidades e estradas. Depois edite à vontade: pinte o relevo, crie cidades, mude
          capitais, nomes e cores, e ligue cidades aos lugares do Mundo.
        </p>
        <GenerateForm
          initial={DEFAULT_OPTIONS}
          submitLabel="Gerar mapa"
          onGenerate={(o) => onCreate(generateWorld(o, "Mundo"))}
        />
      </div>
    </div>
  );
}

/* ---------- Editor ---------- */

function WorldEditor({
  session,
  map,
  focusBurg,
}: {
  session: Session;
  map: WorldMap;
  focusBurg: string | null;
}) {
  const setMap = useWorldMap((s) => s.set);
  const createNote = useApp((s) => s.createNote);
  const setView = useApp((s) => s.setView);
  const [tool, setTool] = useState<Tool>("mover");
  const [mode, setMode] = useState<MapMode>("biomas");
  const [layers, setLayers] = useState<Record<Layer, boolean>>({
    rios: true,
    estradas: true,
    fronteiras: true,
    estados: true,
    cidades: true,
    rotulos: true,
  });
  const [brush, setBrush] = useState(8);
  const [selected, setSelected] = useState<{ kind: "burg" | "state"; id: string } | null>(null);
  const [hover, setHover] = useState<string>("");
  const [showGen, setShowGen] = useState(false);
  const undo = useRef<Snapshot[]>([]);
  const redo = useRef<Snapshot[]>([]);
  // Quantos passos há para desfazer/refazer (para os botões; as pilhas ficam em refs).
  const [hist, setHist] = useState({ undo: 0, redo: 0 });
  const syncHist = () => setHist({ undo: undo.current.length, redo: redo.current.length });

  // Altura viva durante o pincel (sem gravar a cada movimento).
  const [painted, setHeights] = useState<Uint8Array | null>(null);
  const heights = painted ?? map.heights;
  const live = useMemo(() => ({ ...map, heights }), [map, heights]);
  const derived = useMemo(() => deriveWorld(live), [live]);
  const base = useMemo(
    () => bakeBase(live, derived, mode, layers.estados),
    [live, derived, mode, layers.estados],
  );
  const vectors = useMemo(() => buildVectors(live, derived), [live, derived]);

  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setViewT] = useState({ s: 3, x: 0, y: 0 }); // tela = mapa * s + (x, y)
  const fitted = useRef(false);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setSize({ w, h });
      // Na primeira vez, mostra o mapa inteiro.
      if (!fitted.current && w > 50) {
        fitted.current = true;
        const s = Math.min(w / COLS, h / ROWS);
        setViewT({ s, x: (w - COLS * s) / 2, y: (h - ROWS * s) / 2 });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Chegou pedindo uma cidade (da ficha de um lugar): centraliza e seleciona,
  // depois de saber o tamanho real da tela.
  useEffect(() => {
    if (!focusBurg || size.w < 50) return;
    const b = map.burgs.find((x) => x.id === focusBurg);
    fitted.current = true;
    const raf = requestAnimationFrame(() => {
      useWorldMap.getState().focus(null);
      if (!b) return;
      const s = Math.max(6, Math.min(size.w / COLS, size.h / ROWS) * 2.5);
      setViewT({ s, x: size.w / 2 - b.x * s, y: size.h / 2 - b.y * s });
      setSelected({ kind: "burg", id: b.id });
    });
    return () => cancelAnimationFrame(raf);
  }, [focusBurg, map.burgs, size]);

  const capitals = useMemo(() => new Set(map.states.map((s) => s.capital)), [map.states]);

  // Desenho.
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(size.w * dpr);
    c.height = Math.round(size.h * dpr);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#1f3a55";
    ctx.fillRect(0, 0, size.w, size.h);
    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.scale(view.s, view.s);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(base, 0, 0, COLS, ROWS);
    const px = 1 / view.s; // um pixel de tela, em unidades do mapa
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    // Costa.
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = px * 4;
    ctx.stroke(vectors.coast);
    ctx.strokeStyle = "#2b2a26";
    ctx.lineWidth = px * 1.2;
    ctx.stroke(vectors.coast);
    if (layers.rios) {
      ctx.strokeStyle = "#4f86b8";
      for (const r of vectors.rivers) {
        // Espessura em pixels de tela (cresce pouco com o zoom).
        ctx.lineWidth = px * (0.7 + r.width * 0.8) * Math.min(2, Math.sqrt(view.s / 3));
        ctx.stroke(r.path);
      }
    }
    if (layers.estradas) {
      ctx.strokeStyle = "rgba(92,62,38,0.75)";
      ctx.lineWidth = Math.max(px * 0.8, 0.18);
      ctx.setLineDash([px * 4, px * 3]);
      ctx.stroke(vectors.roads);
      ctx.setLineDash([]);
    }
    if (layers.fronteiras) {
      ctx.strokeStyle = "rgba(60,30,40,0.75)";
      ctx.lineWidth = px * 1.6;
      ctx.setLineDash([px * 5, px * 2, px * 1, px * 2]);
      ctx.stroke(vectors.borders);
      ctx.setLineDash([]);
    }
    if (selected?.kind === "state") {
      const k = map.states.findIndex((s) => s.id === selected.id);
      if (k >= 0) {
        ctx.fillStyle = "rgba(255,255,255,0.22)";
        for (let i = 0; i < COLS * ROWS; i++)
          if (derived.owner[i] === k) ctx.fillRect(i % COLS, Math.floor(i / COLS), 1.02, 1.02);
      }
    }
    ctx.restore();
    // Texto e marcadores em pixels de tela (tamanho fixo ao dar zoom).
    const toS = (x: number, y: number) => [x * view.s + view.x, y * view.s + view.y] as const;
    if (layers.rotulos) {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      map.states.forEach((s, k) => {
        const l = vectors.labels[k];
        if (!l) return;
        const [sx, sy] = toS(l.x, l.y);
        const fs = Math.max(11, Math.min(30, Math.sqrt(l.area) * view.s * 0.09));
        ctx.font = `600 ${fs}px Georgia, "Times New Roman", serif`;
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(245,238,220,0.8)";
        const text = s.name.toUpperCase().split("").join(" ");
        ctx.strokeText(text, sx, sy);
        ctx.fillStyle = "#3b2a2a";
        ctx.fillText(text, sx, sy);
      });
    }
    if (layers.cidades) {
      // Rótulos que não se sobrepõem: capitais primeiro, depois as outras.
      const placedLabels: [number, number, number, number][] = [];
      const free = (x: number, y: number, w: number, h: number) =>
        placedLabels.every(([a, b, c, d]) => x > c || x + w < a || y > d || y + h < b);
      const ordered = [...map.burgs].sort(
        (a, b) => Number(capitals.has(b.id)) - Number(capitals.has(a.id)),
      );
      for (const b of ordered) {
        const [sx, sy] = toS(b.x, b.y);
        if (sx < -50 || sy < -50 || sx > size.w + 50 || sy > size.h + 50) continue;
        const cap = capitals.has(b.id);
        const sel = selected?.kind === "burg" && selected.id === b.id;
        ctx.beginPath();
        ctx.arc(sx, sy, cap ? 4.5 : 3, 0, Math.PI * 2);
        ctx.fillStyle = cap ? "#2b2a26" : "#fffaf0";
        ctx.fill();
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = cap ? "#fffaf0" : "#2b2a26";
        ctx.stroke();
        if (cap) {
          ctx.beginPath();
          ctx.arc(sx, sy, 7, 0, Math.PI * 2);
          ctx.strokeStyle = "#2b2a26";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        if (sel) {
          ctx.beginPath();
          ctx.arc(sx, sy, 11, 0, Math.PI * 2);
          ctx.strokeStyle = "#e0a52c";
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
        if (layers.rotulos && (cap || view.s > 3.2 || sel)) {
          ctx.font = `${cap ? "700 13px" : "500 11.5px"} Georgia, "Times New Roman", serif`;
          ctx.textAlign = "left";
          const tw = ctx.measureText(b.name).width;
          if (!sel && !free(sx + 6, sy - 13, tw + 2, 14)) continue;
          placedLabels.push([sx + 6, sy - 13, sx + 8 + tw, sy + 1]);
          ctx.lineWidth = 3;
          ctx.strokeStyle = "rgba(255,250,235,0.85)";
          ctx.strokeText(b.name, sx + 7, sy - 6);
          ctx.fillStyle = "#24201b";
          ctx.fillText(b.name, sx + 7, sy - 6);
        }
      }
    }
  }, [base, vectors, view, size, layers, map, capitals, selected, derived]);

  /* ----- Edição ----- */

  const snapshot = (): Snapshot => ({ heights: map.heights, burgs: map.burgs, states: map.states });
  const commit = (next: WorldMap) => {
    undo.current = [...undo.current.slice(-29), snapshot()];
    redo.current = [];
    syncHist();
    setMap(next);
  };

  const restore = (from: RefObject<Snapshot[]>, to: RefObject<Snapshot[]>) => {
    const s = from.current.pop();
    if (!s) return;
    to.current.push(snapshot());
    syncHist();
    setMap({ ...map, ...s });
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [contenteditable]")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) restore(redo, undo);
        else restore(undo, redo);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const toMap = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect();
    return [(e.clientX - r.left - view.x) / view.s, (e.clientY - r.top - view.y) / view.s] as const;
  };
  const burgAt = (x: number, y: number) =>
    map.burgs.find((b) => Math.hypot(b.x - x, b.y - y) * view.s < 9);

  const paint = (h: Uint8Array, x: number, y: number, t: Tool) => {
    const r = brush;
    const out = new Uint8Array(h);
    for (
      let cy = Math.max(0, Math.floor(y - r));
      cy <= Math.min(ROWS - 1, Math.ceil(y + r));
      cy++
    ) {
      for (
        let cx = Math.max(0, Math.floor(x - r));
        cx <= Math.min(COLS - 1, Math.ceil(x + r));
        cx++
      ) {
        const d = Math.hypot(cx + 0.5 - x, cy + 0.5 - y) / r;
        if (d >= 1) continue;
        const f = (1 - d * d) * (1 - d * d);
        const i = cy * COLS + cx;
        if (t === "elevar") out[i] = Math.min(255, h[i]! + 6 * f + (h[i]! < SEA ? 4 * f : 0));
        else if (t === "rebaixar") out[i] = Math.max(0, h[i]! - 6 * f - (h[i]! >= SEA ? 4 * f : 0));
        else {
          let sum = 0;
          let n = 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const nx = cx + dx;
              const ny = cy + dy;
              if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
              sum += h[ny * COLS + nx]!;
              n++;
            }
          out[i] = Math.round(h[i]! + (sum / n - h[i]!) * 0.5 * f);
        }
      }
    }
    return out;
  };

  const drag = useRef<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    moved: boolean;
    burg?: string;
  } | null>(null);
  const painting = useRef<{ h: Uint8Array; last: number } | null>(null);

  const onDown = (e: PointerEvent) => {
    canvas.current!.setPointerCapture(e.pointerId);
    const [x, y] = toMap(e);
    if (tool === "mover") {
      const b = burgAt(x, y);
      drag.current = {
        x: e.clientX,
        y: e.clientY,
        vx: view.x,
        vy: view.y,
        moved: false,
        burg: b?.id,
      };
    } else if (tool === "cidade") {
      const c = cellOf(x, y);
      if (map.heights[c]! < SEA) return;
      const name = makeNamer(Date.now())();
      const b: Burg = { id: newId("c"), name, x, y };
      commit({ ...map, burgs: [...map.burgs, b] });
      setSelected({ kind: "burg", id: b.id });
    } else {
      painting.current = { h: paint(heights, x, y, tool), last: performance.now() };
      setHeights(painting.current.h);
    }
  };
  const onMove = (e: PointerEvent) => {
    const [x, y] = toMap(e);
    if (x >= 0 && y >= 0 && x < COLS && y < ROWS) {
      const c = cellOf(x, y);
      const h = heights[c]!;
      const st = derived.owner[c]! >= 0 ? map.states[derived.owner[c]!]?.name : null;
      const metres =
        h >= SEA
          ? Math.round(((h - SEA) / 127) ** 1.6 * 5200)
          : -Math.round(((SEA - h) / SEA) * 4000);
      setHover(
        [
          h >= SEA ? BIOMES[derived.biome[c]!]!.name : "Mar",
          st,
          `${metres.toLocaleString("pt-BR")} m`,
        ]
          .filter(Boolean)
          .join(" · "),
      );
    } else setHover("");
    const d = drag.current;
    if (d) {
      if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 4) d.moved = true;
      if (d.moved && d.burg) {
        // Arrastar uma cidade a muda de lugar (só em terra).
        if (heights[cellOf(x, y)]! >= SEA)
          useWorldMap.setState({
            map: { ...map, burgs: map.burgs.map((b) => (b.id === d.burg ? { ...b, x, y } : b)) },
          });
      } else if (d.moved)
        setViewT((v) => ({ ...v, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y }));
    }
    const p = painting.current;
    if (p && e.buttons) {
      p.h = paint(p.h, x, y, tool);
      setHeights(p.h);
    }
  };
  const onUp = (e: PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (d) {
      if (d.moved && d.burg) {
        const moved = useWorldMap.getState().map!;
        syncHist();
        undo.current = [
          ...undo.current.slice(-29),
          { heights: map.heights, burgs: map.burgs, states: map.states },
        ];
        redo.current = [];
        syncHist();
        setMap(moved);
      } else if (!d.moved) {
        const [x, y] = toMap(e);
        const b = burgAt(x, y);
        if (b) setSelected({ kind: "burg", id: b.id });
        else {
          const o = derived.owner[cellOf(x, y)]!;
          setSelected(o >= 0 && map.states[o] ? { kind: "state", id: map.states[o]!.id } : null);
        }
      }
    }
    const p = painting.current;
    painting.current = null;
    if (p) {
      commit({ ...map, heights: p.h });
      setHeights(null);
    }
  };
  const onWheel = (e: WheelEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    zoomAt(e.deltaY > 0 ? 1 / 1.15 : 1.15, mx, my);
  };
  const zoomAt = (f: number, mx = size.w / 2, my = size.h / 2) =>
    setViewT((v) => {
      const min = Math.min(size.w / COLS, size.h / ROWS) * 0.8;
      const s = Math.max(min, Math.min(40, v.s * f));
      return { s, x: mx - ((mx - v.x) / v.s) * s, y: my - ((my - v.y) / v.s) * s };
    });
  const fit = () => {
    const s = Math.min(size.w / COLS, size.h / ROWS);
    setViewT({ s, x: (size.w - COLS * s) / 2, y: (size.h - ROWS * s) / 2 });
  };

  /* ----- Painel ----- */

  const burg = selected?.kind === "burg" ? map.burgs.find((b) => b.id === selected.id) : undefined;
  const burgState = burg ? map.states[derived.owner[cellOf(burg.x, burg.y)]!] : undefined;
  const state =
    selected?.kind === "state" ? map.states.find((s) => s.id === selected.id) : undefined;
  const places = session.project.notes
    .filter((n) => n.kind === "lugares")
    .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
  const updateBurg = (id: string, patch: Partial<Burg>) =>
    commit({ ...map, burgs: map.burgs.map((b) => (b.id === id ? { ...b, ...patch } : b)) });
  const openNote = (id: string) => {
    useWorldNav.getState().setOpenId(id);
    setView("world");
  };

  return (
    <div className="wm">
      <div className="wm-canvas" ref={wrap}>
        <canvas
          ref={canvas}
          className={"tool-" + tool}
          style={{ width: size.w, height: size.h }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={() => setHover("")}
          onWheel={onWheel}
        />
        <div className="wm-tools" role="toolbar" aria-label="Ferramentas do mapa">
          {TOOLS.map((t) => (
            <button
              key={t.value}
              type="button"
              className={tool === t.value ? "on" : ""}
              aria-pressed={tool === t.value}
              title={t.hint}
              onClick={() => setTool(t.value)}
            >
              <Icon name={t.icon} size={16} />
              <span>{t.label}</span>
            </button>
          ))}
          {(tool === "elevar" || tool === "rebaixar" || tool === "suavizar") && (
            <label className="wm-brush" title="Tamanho do pincel">
              <span>Pincel</span>
              <input
                type="range"
                min={2}
                max={30}
                value={brush}
                onChange={(e) => setBrush(+e.target.value)}
              />
            </label>
          )}
          <div className="wm-tools-sep" />
          <button
            type="button"
            title="Desfazer (Ctrl+Z)"
            disabled={!hist.undo}
            onClick={() => restore(undo, redo)}
          >
            <Icon name="undo" size={16} />
            <span>Desfazer</span>
          </button>
          <button
            type="button"
            title="Refazer (Ctrl+Shift+Z)"
            disabled={!hist.redo}
            onClick={() => restore(redo, undo)}
          >
            <Icon name="redo" size={16} />
            <span>Refazer</span>
          </button>
        </div>
        <div className="wm-zoom">
          <button type="button" aria-label="Aproximar" onClick={() => zoomAt(1.4)}>
            +
          </button>
          <button type="button" aria-label="Afastar" onClick={() => zoomAt(1 / 1.4)}>
            −
          </button>
          <button
            type="button"
            aria-label="Mostrar o mapa inteiro"
            title="Mapa inteiro"
            onClick={fit}
          >
            <Icon name="expand" size={14} />
          </button>
        </div>
        {hover && <div className="wm-status">{hover}</div>}
      </div>

      <aside className="wm-panel">
        <section className="profile-card">
          <input
            className="wm-title"
            aria-label="Nome do mundo"
            defaultValue={map.name}
            key={map.name}
            onBlur={(e) =>
              e.target.value.trim() &&
              e.target.value !== map.name &&
              commit({ ...map, name: e.target.value.trim() })
            }
          />
          <p className="wm-meta">
            {map.states.length} estados · {map.burgs.length} cidades · {derived.rivers.length} rios
          </p>
          <div className="wm-modes segmented wide" role="radiogroup" aria-label="Estilo do mapa">
            {(
              [
                ["biomas", "Biomas"],
                ["relevo", "Relevo"],
                ["politico", "Político"],
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={mode === v}
                onClick={() => setMode(v)}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="wm-layers">
            {LAYERS.map(([k, l]) => (
              <label key={k} className="region-check">
                <input
                  type="checkbox"
                  checked={layers[k]}
                  onChange={(e) => setLayers({ ...layers, [k]: e.target.checked })}
                />
                {l}
              </label>
            ))}
          </div>
          <button type="button" className="btn ghost sm" onClick={() => setShowGen((v) => !v)}>
            <Icon name="refresh" size={14} /> Gerar outro mundo
          </button>
          {showGen && (
            <div className="wm-gen">
              <p className="field-hint">
                Substitui o mapa atual (o relevo, as cidades e os estados). Dá para desfazer com
                Ctrl+Z.
              </p>
              <GenerateForm
                initial={{ ...map.options }}
                submitLabel="Gerar"
                onGenerate={(o) => {
                  commit(generateWorld(o, map.name));
                  setSelected(null);
                  setShowGen(false);
                }}
              />
            </div>
          )}
        </section>

        {burg && (
          <section className="profile-card wm-sel">
            <h3>{capitals.has(burg.id) ? "Capital" : "Cidade"}</h3>
            <input
              className="text-input"
              aria-label="Nome da cidade"
              key={burg.id + burg.name}
              defaultValue={burg.name}
              onBlur={(e) =>
                e.target.value.trim() &&
                e.target.value !== burg.name &&
                updateBurg(burg.id, { name: e.target.value.trim() })
              }
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
            <p className="wm-meta">
              {burgState ? `Em ${burgState.name}` : "Sem estado"} ·{" "}
              {BIOMES[derived.biome[cellOf(burg.x, burg.y)]!]!.name}
            </p>
            <label className="region-check">
              <input
                type="checkbox"
                checked={capitals.has(burg.id)}
                onChange={(e) => {
                  if (e.target.checked)
                    commit({
                      ...map,
                      states: [
                        ...map.states,
                        {
                          id: newId("e"),
                          name: makeNamer(Date.now())(),
                          color: stateColor(map.states.length),
                          capital: burg.id,
                        },
                      ],
                    });
                  else commit({ ...map, states: map.states.filter((s) => s.capital !== burg.id) });
                }}
              />
              Capital de um estado
            </label>
            <div className="field">
              <label>Lugar no Mundo</label>
              <Select
                value={burg.noteId ?? ""}
                placeholder="Nenhum"
                options={places.map((n) => ({ value: n.id, label: n.title }))}
                onChange={(v) => updateBurg(burg.id, { noteId: v || undefined })}
              />
            </div>
            <div className="profile-photo-actions">
              {burg.noteId && places.some((n) => n.id === burg.noteId) ? (
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => openNote(burg.noteId!)}
                >
                  Abrir ficha
                </button>
              ) : (
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={async () => {
                    const id = await createNote("lugares", burg.name);
                    if (id) updateBurg(burg.id, { noteId: id });
                  }}
                >
                  Criar lugar “{burg.name}”
                </button>
              )}
              <button
                type="button"
                className="btn ghost sm danger"
                onClick={() => {
                  commit({
                    ...map,
                    burgs: map.burgs.filter((b) => b.id !== burg.id),
                    states: map.states.filter((s) => s.capital !== burg.id),
                  });
                  setSelected(null);
                }}
              >
                Excluir
              </button>
            </div>
            <p className="field-hint">
              Com a ferramenta Mover, arraste a cidade para mudá-la de lugar.
            </p>
          </section>
        )}

        {state && (
          <section className="profile-card wm-sel">
            <h3>Estado</h3>
            <div className="wm-state-row">
              <input
                type="color"
                aria-label="Cor do estado"
                value={state.color}
                onChange={(e) =>
                  useWorldMap.setState({
                    map: {
                      ...map,
                      states: map.states.map((s) =>
                        s.id === state.id ? { ...s, color: e.target.value } : s,
                      ),
                    },
                  })
                }
                onBlur={() => commit(useWorldMap.getState().map!)}
              />
              <input
                className="text-input"
                aria-label="Nome do estado"
                key={state.id + state.name}
                defaultValue={state.name}
                onBlur={(e) =>
                  e.target.value.trim() &&
                  e.target.value !== state.name &&
                  commit({
                    ...map,
                    states: map.states.map((s) =>
                      s.id === state.id ? { ...s, name: e.target.value.trim() } : s,
                    ),
                  })
                }
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              />
            </div>
            {(() => {
              const k = map.states.indexOf(state);
              let cells = 0;
              for (let i = 0; i < COLS * ROWS; i++) if (derived.owner[i] === k) cells++;
              const land = derived.land.reduce((a, v) => a + v, 0) || 1;
              const cities = map.burgs.filter((b) => derived.owner[cellOf(b.x, b.y)] === k);
              const cap = map.burgs.find((b) => b.id === state.capital);
              return (
                <>
                  <p className="wm-meta">
                    {Math.round((cells / land) * 100)}% das terras · {cities.length} cidades
                  </p>
                  {cap && (
                    <button
                      type="button"
                      className="profile-link"
                      onClick={() => setSelected({ kind: "burg", id: cap.id })}
                    >
                      <Icon name="pin" size={14} /> Capital: {cap.name}
                    </button>
                  )}
                </>
              );
            })()}
          </section>
        )}

        {!burg && !state && (
          <section className="profile-card wm-help">
            <h3>Como usar</h3>
            <ul>
              <li>Roda do mouse aproxima; arraste para mover.</li>
              <li>Clique numa cidade ou num estado para editar nome, cor e capital.</li>
              <li>
                Elevar e Rebaixar pintam o relevo: crie ilhas, cordilheiras e mares. Rios, biomas e
                fronteiras se refazem sozinhos.
              </li>
              <li>
                Ligue cidades aos lugares do Mundo; a ficha do lugar ganha “Ver no mapa-múndi”.
              </li>
            </ul>
          </section>
        )}
        <section className="profile-card wm-legend">
          <h3>Biomas</h3>
          <ul>
            {BIOMES.slice(1).map((b) => (
              <li key={b.name}>
                <span style={{ background: b.color }} />
                {b.name}
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}
