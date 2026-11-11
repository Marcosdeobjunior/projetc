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
import { renameDocAndLinks } from "../state/store";
import { renameDoc, setNoteFields } from "../manuscript/tree";
import { distToPolyline } from "../world/geom";
import { BurgDialog } from "./BurgDialog";
import { GlobeView } from "./GlobeView";
import { makeMarkovNamer, nameBase } from "../world/names";
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
  type Route,
  ROUTE_TYPES,
  STATE_FORMS,
  type StateForm,
  type WorldState,
  CULTURE_TYPES,
  dCol,
  wrapCol,
  type Template,
  type WorldMap,
  type WorldOptions,
} from "../world/worldgen";
import {
  bakeBase,
  buildProvinceVectors,
  buildVectors,
  coastPath,
  type MapMode,
} from "../world/worldRender";
import { deriveSociety, MARKER_TYPES } from "../world/society";
import { settlementInfo } from "../world/settlement";
import { drawWorld, KM_PER_CELL, stateMask, type BurgMeta } from "./worldDraw";
import { Icon } from "./Icon";
import { Select } from "./Select";

/*
 * Mapa-múndi do projeto: gera um mundo (continentes, clima, biomas, rios,
 * estados, cidades e estradas) e deixa editar tudo: pincel de relevo, cidades,
 * capitais, nomes e cores dos estados. Cidades podem ser ligadas a lugares do
 * Mundo.
 */

type Tool = "mover" | "elevar" | "rebaixar" | "suavizar" | "cidade" | "rota";

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
  {
    value: "rota",
    icon: "link",
    label: "Rota",
    hint: "Clique para marcar o caminho; Enter (ou duplo clique) conclui",
  },
];

const LAYERS = [
  ["rios", "Rios"],
  ["estradas", "Rotas e estradas"],
  ["fronteiras", "Fronteiras"],
  ["estados", "Cor dos estados"],
  ["provincias", "Províncias"],
  ["cidades", "Cidades"],
  ["marcadores", "Marcadores"],
  ["rotulos", "Nomes"],
] as const;
type Layer = (typeof LAYERS)[number][0];

const newSeed = () => Math.floor(Math.random() * 2 ** 32);

interface Snapshot {
  heights: Uint8Array;
  burgs: Burg[];
  states: WorldMap["states"];
  routes?: Route[];
}

export function WorldMapView({ session }: { session: Session }) {
  const { map, loaded, focusBurg } = useWorldMap();
  const setMap = useWorldMap((s) => s.set);
  useEffect(() => {
    void useWorldMap.getState().load();
  }, [session.root]);

  if (!loaded) return <div className="editor-state">Abrindo o mapa…</div>;
  if (!map)
    return (
      <NewWorld
        onCreate={(m) => {
          setMap(m);
          void useWorldMap.getState().reconcile();
        }}
        title={session.project.title}
      />
    );
  return <WorldEditor key={session.root} session={session} map={map} focusBurg={focusBurg} />;
}

/** Menor zoom em que o planeta cobre a área inteira. */
/** "Reino de Faia", "Império de Goura", "República de Seel"… */
function fullStateName(s: WorldState) {
  return `${s.form ?? "Reino"} de ${s.name}`;
}

/** Zoom de 100%: o planeta inteiro cabe na área, sem rolagem. */
function fitScale(size: { w: number; h: number }) {
  return Math.min(size.w / COLS, size.h / ROWS) || 1;
}

/**
 * Limita a vista: nunca menos que 100% (o planeta inteiro) e sem rolar além das
 * bordas. Na direção em que o planeta não enche a área, ele fica centralizado
 * (a sobra é pintada como continuação do mar polar, sem faixas vazias).
 */
function clampView(v: { s: number; x: number; y: number }, size: { w: number; h: number }) {
  if (size.w < 1) return v;
  const s = Math.max(fitScale(size), v.s);
  const axis = (pos: number, span: number, room: number) =>
    span <= room ? (room - span) / 2 : Math.min(0, Math.max(room - span, pos));
  return { s, x: axis(v.x, COLS * s, size.w), y: axis(v.y, ROWS * s, size.h) };
}

/** Um sim/não lembrado no navegador (localStorage), com valor padrão se não der. */
function useStoredFlag(key: string, initial: boolean) {
  const [v, setV] = useState(() => {
    try {
      const s = localStorage.getItem(key);
      return s === null ? initial : s === "1";
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, v ? "1" : "0");
    } catch {
      /* sem armazenamento: só não lembra */
    }
  }, [key, v]);
  return [v, setV] as const;
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
    provincias: true,
    marcadores: true,
  });
  const [brush, setBrush] = useState(8);
  // Ferramentas e painel de opções recolhíveis (lembrados neste computador).
  const [toolsOpen, setToolsOpen] = useStoredFlag("talia.mapa.ferramentas", true);
  const [panelOpen, setPanelOpen] = useStoredFlag("talia.mapa.opcoes", true);
  const [globe, setGlobe] = useStoredFlag("talia.mapa.globo", false);
  const root = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const on = () => setFullscreen(document.fullscreenElement === root.current);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const [selected, setSelected] = useState<{
    kind: "burg" | "state" | "route" | "road";
    id: string;
  } | null>(null);
  // Rota sendo desenhada (pontos de passagem em células).
  const [draft, setDraft] = useState<[number, number][]>([]);
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
  // Só o que muda a geografia refaz clima, rios e fronteiras (renomear não refaz).
  const geoKey =
    map.burgs.map((b) => `${b.id}:${b.x.toFixed(2)}:${b.y.toFixed(2)}`).join("|") +
    "#" +
    map.states.map((s) => s.capital).join("|") +
    "#" +
    map.options.seed +
    "#" +
    (map.routes ?? []).map((r) => `${r.id}:${r.type}:${r.points.join(";")}`).join("|");
  const colorKey = map.states.map((s) => s.color).join("|");
  const geo = useMemo(
    () => ({ ...map, heights: map.heights }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [map.heights, geoKey],
  );
  const derived = useMemo(() => deriveWorld(geo), [geo]);
  // Províncias, religiões e marcadores (dependem também dos nomes e das formas de governo).
  const socKey =
    map.states.map((s) => s.form ?? "").join("|") + map.burgs.map((b) => b.name).join("|");
  const society = useMemo(
    () => deriveSociety({ ...geo, states: map.states, burgs: map.burgs }, derived),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [geo, derived, socKey],
  );
  const provinceVectors = useMemo(() => buildProvinceVectors(society, derived), [society, derived]);
  const base = useMemo(
    () =>
      bakeBase({ ...geo, states: map.states }, derived, mode, layers.estados, undefined, {
        cells: society.religion,
        colors: society.religions.map((r) => r.color),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [geo, derived, mode, layers.estados, colorKey, mode === "religioes" ? society : null],
  );
  const fullVectors = useMemo(() => buildVectors(geo, derived), [geo, derived]);
  // Enquanto pinta: só o relevo e a costa são refeitos (em resolução menor);
  // clima, rios e fronteiras se refazem ao soltar.
  const quickBase = useMemo(
    () =>
      painted
        ? bakeBase(
            { ...geo, heights: painted, states: map.states },
            { ...derived, eff: painted },
            mode,
            layers.estados,
            1,
          )
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [painted],
  );
  const vectors = useMemo(
    () => (painted ? { ...fullVectors, coast: coastPath(painted) } : fullVectors),
    [painted, fullVectors],
  );

  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // tela = mapa * s + (x, y). O mapa plano sempre cobre a área toda e não passa
  // das bordas do planeta (sem faixas vazias nem rolagem infinita).
  const [rawView, setViewT] = useState({ s: 3, x: 0, y: 0 });
  const view = useMemo(() => clampView(rawView, size), [rawView, size]);
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

  // Mundo mudou (lugar renomeado, apagado…): o mapa acompanha.
  const notes = session.project.notes;
  useEffect(() => {
    void useWorldMap.getState().reconcile();
  }, [notes]);

  // Lugar do Mundo esperando um clique no mapa para virar cidade.
  const [placing, setPlacing] = useState<string | null>(null);

  // População e porto de cada cidade (tamanho do marcador e âncora).
  const meta = useMemo(() => {
    const m = new Map<string, BurgMeta>();
    const notesById = new Map(session.project.notes.map((n) => [n.id, n]));
    for (const b of map.burgs) {
      const info = settlementInfo(
        b,
        capitals.has(b.id),
        heights,
        derived,
        (b.noteId && notesById.get(b.noteId)?.fields) || {},
      );
      m.set(b.id, { population: info.population, port: info.elements.has("porto") });
    }
    return m;
  }, [map.burgs, capitals, heights, derived, session.project.notes]);

  const selectedStateIndex =
    selected?.kind === "state" ? map.states.findIndex((s) => s.id === selected.id) : -1;
  const highlight = useMemo(
    () => (selectedStateIndex >= 0 ? stateMask(derived, selectedStateIndex) : null),
    [derived, selectedStateIndex],
  );
  const [brushAt, setBrushAt] = useState<{ x: number; y: number } | null>(null);
  // Cidade sendo arrastada (só o marcador anda; o mapa se refaz ao soltar).
  const [dragging, setDragging] = useState<{ id: string; x: number; y: number } | null>(null);
  const shown = useMemo(
    () =>
      dragging
        ? {
            ...map,
            burgs: map.burgs.map((b) =>
              b.id === dragging.id ? { ...b, x: dragging.x, y: dragging.y } : b,
            ),
          }
        : map,
    [map, dragging],
  );
  const painterTool = tool === "elevar" || tool === "rebaixar" || tool === "suavizar";

  // Desenho.
  useEffect(() => {
    const c = canvas.current;
    if (!c || size.w < 1) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(size.w * dpr);
    c.height = Math.round(size.h * dpr);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawWorld(ctx, {
      map: shown,
      derived,
      base: quickBase ?? base,
      vectors,
      view,
      size,
      layers,
      society,
      provinceVectors,
      capitals,
      meta,
      selectedBurg: selected?.kind === "burg" ? selected.id : null,
      selectedRoute: selected?.kind === "route" ? selected.id : null,
      selectedRoad: selected?.kind === "road" ? selected.id : null,
      draft: tool === "rota" ? draft : null,
      highlight,
      brush: painterTool && brushAt ? { ...brushAt, r: brush } : null,
      furniture: true,
      single: true,
    });
  }, [
    base,
    quickBase,
    vectors,
    view,
    size,
    layers,
    shown,
    capitals,
    selected,
    derived,
    meta,
    highlight,
    painterTool,
    brushAt,
    brush,
    tool,
    draft,
    society,
    provinceVectors,
  ]);

  /** Exporta o mapa inteiro como imagem PNG (em alta resolução). */
  const exportPng = async () => {
    const platform = useApp.getState().platform;
    if (!platform) return;
    const scale = 6;
    const w = COLS * scale;
    const h = ROWS * scale;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    drawWorld(c.getContext("2d")!, {
      map,
      derived,
      base,
      vectors,
      view: { s: scale, x: 0, y: 0 },
      size: { w, h },
      layers,
      society,
      provinceVectors,
      capitals,
      meta,
      furniture: true,
    });
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
    if (!blob) return;
    const data = new Uint8Array(await blob.arrayBuffer());
    await platform.saveFile(`${map.name || "Mapa"}.png`, data, {
      name: "Imagem PNG",
      extensions: ["png"],
    });
  };

  /* ----- Edição ----- */

  const colorBefore = useRef<Snapshot | null>(null);
  const colorTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const snapshot = (): Snapshot => ({
    heights: map.heights,
    burgs: map.burgs,
    states: map.states,
    routes: map.routes ?? [],
  });
  const commit = (next: WorldMap) => {
    undo.current = [...undo.current.slice(-29), snapshot()];
    redo.current = [];
    syncHist();
    // Lugares que saíram do mapa vão para a lixeira (se ninguém mexeu neles).
    const now = new Set([...next.burgs.map((b) => b.noteId), ...next.states.map((s) => s.noteId)]);
    const retire = [...map.burgs.map((b) => b.noteId), ...map.states.map((s) => s.noteId)].filter(
      (id): id is string => !!id && !now.has(id),
    );
    setMap(next);
    void useWorldMap.getState().reconcile({ retire });
  };
  // Renomear no mapa renomeia a ficha (o nome da ficha é o que vale).
  const renameLinked = async (noteId: string | undefined, name: string) => {
    if (noteId && session.project.notes.some((n) => n.id === noteId))
      await renameDocAndLinks((p) => renameDoc(p, noteId, name), noteId);
  };

  const restore = (from: RefObject<Snapshot[]>, to: RefObject<Snapshot[]>) => {
    const s = from.current.pop();
    if (!s) return;
    to.current.push(snapshot());
    syncHist();
    setMap({ ...map, ...s, routes: s.routes ?? map.routes });
    // Desfazer uma exclusão traz o lugar de volta ao Mundo.
    void useWorldMap.getState().reconcile({ recreate: true });
  };
  /** Conclui a rota desenhada (marítima se começa ou termina na água). */
  const finishRoute = (pts = draft) => {
    setDraft([]);
    if (pts.length < 2) return;
    const wet = (p: [number, number]) => !derived.land[cellOf(p[0], p[1])];
    const r: Route = {
      id: newId("r"),
      name: "Nova rota",
      type: wet(pts[0]!) || wet(pts[pts.length - 1]!) ? "maritima" : "estrada",
      points: pts,
    };
    commit({ ...map, routes: [...(map.routes ?? []), r] });
    setSelected({ kind: "route", id: r.id });
    setTool("mover");
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [contenteditable]")) return;
      if (tool === "rota" && draft.length) {
        if (e.key === "Enter") return finishRoute();
        if (e.key === "Backspace") return setDraft(draft.slice(0, -1));
        if (e.key === "Escape") return setDraft([]);
      }
      if (e.key === "Escape") {
        // Esc: cancela o "pôr no mapa", fecha a janela da cidade, volta a Mover.
        if (placing) setPlacing(null);
        else if (selected) setSelected(null);
        else setTool("mover");
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) restore(redo, undo);
        else restore(undo, redo);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /** Nome novo no estilo da cultura do lugar (ou um nome genérico, sem cultura). */
  const nameFor = (cell: number) => {
    const c = map.cultures?.[derived.culture[cell]!];
    return c ? makeMarkovNamer(c.base, Date.now() & 0xffffff)() : makeNamer(Date.now())();
  };
  const toMap = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect();
    // A longitude dá a volta: o x volta para dentro do planeta (0 a COLS).
    const x = (e.clientX - r.left - view.x) / view.s;
    return [((x % COLS) + COLS) % COLS, (e.clientY - r.top - view.y) / view.s] as const;
  };
  const burgAt = (x: number, y: number) =>
    map.burgs.find((b) => Math.hypot(dCol(b.x, x), b.y - y) * view.s < 9);
  const near = (pts: [number, number][], x: number, y: number) =>
    Math.min(...[-COLS, 0, COLS].map((k) => distToPolyline([x + k, y], pts))) * view.s < 7;
  const routeAt = (x: number, y: number) => vectors.routes.find((r) => near(r.points, x, y));
  /** Estrada gerada (rodovia ou estrada) sob o clique: só quando o traço aparece bem. */
  const roadAt = (x: number, y: number) =>
    view.s > 2 && layers.estradas
      ? vectors.namedRoads.find((r) => near(r.points, x, y))
      : undefined;

  const paint = (h: Uint8Array, x: number, y: number, t: Tool) => {
    const r = brush;
    const out = new Uint8Array(h);
    for (
      let cy = Math.max(0, Math.floor(y - r));
      cy <= Math.min(ROWS - 1, Math.ceil(y + r));
      cy++
    ) {
      for (let cx = Math.floor(x - r); cx <= Math.ceil(x + r); cx++) {
        const d = Math.hypot(cx + 0.5 - x, cy + 0.5 - y) / r;
        if (d >= 1) continue;
        const f = (1 - d * d) * (1 - d * d);
        const i = cy * COLS + wrapCol(cx);
        if (t === "elevar") out[i] = Math.min(255, h[i]! + 6 * f + (h[i]! < SEA ? 4 * f : 0));
        else if (t === "rebaixar") out[i] = Math.max(0, h[i]! - 6 * f - (h[i]! >= SEA ? 4 * f : 0));
        else {
          let sum = 0;
          let n = 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const nx = cx + dx;
              const ny = cy + dy;
              if (ny < 0 || ny >= ROWS) continue;
              sum += h[ny * COLS + wrapCol(nx)]!;
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
    } else if (tool === "rota") {
      // Cada clique marca um ponto (perto de uma cidade, encaixa nela); duplo clique conclui.
      const b = burgAt(x, y);
      const pt: [number, number] = b ? [b.x, b.y] : [x, y];
      const last = draft[draft.length - 1];
      if (e.detail >= 2 || (last && Math.hypot(last[0] - pt[0], last[1] - pt[1]) * view.s < 4))
        finishRoute(last ? draft : [...draft, pt]);
      else setDraft([...draft, pt]);
    } else if (tool === "cidade") {
      const c = cellOf(x, y);
      if (!derived.land[c]) return;
      const placed = placing ? session.project.notes.find((n) => n.id === placing) : undefined;
      const b: Burg = placed
        ? { id: newId("c"), name: placed.title, x, y, noteId: placed.id }
        : { id: newId("c"), name: nameFor(cellOf(x, y)), x, y };
      commit({ ...map, burgs: [...map.burgs, b] });
      setSelected({ kind: "burg", id: b.id });
      if (placed) {
        setPlacing(null);
        setTool("mover");
      }
    } else {
      painting.current = { h: paint(heights, x, y, tool), last: performance.now() };
      setHeights(painting.current.h);
    }
  };
  /** Bioma, reino, altitude e coordenadas do ponto sob o mouse. */
  const hoverText = (x: number | null, y: number | null) => {
    if (x === null || y === null || y < 0 || y >= ROWS) return "";
    const c = cellOf(x, y);
    const h = heights[c]!;
    const owner = derived.owner[c]! >= 0 ? map.states[derived.owner[c]!] : undefined;
    const st = owner ? fullStateName(owner) : null;
    const cu = map.cultures?.[derived.culture[c]!]?.name;
    const metres =
      h >= SEA
        ? Math.round(((h - SEA) / 127) ** 1.6 * 5200)
        : -Math.round(((SEA - h) / SEA) * 4000);
    const lat = 90 - (y / ROWS) * 180;
    const lon = (x / COLS) * 360 - 180;
    const coord = `${Math.abs(lat).toFixed(0)}°${lat >= 0 ? "N" : "S"} ${Math.abs(lon).toFixed(0)}°${lon >= 0 ? "L" : "O"}`;
    // Marcador sob o mouse: nome e lenda.
    if (layers.marcadores) {
      const r = 9 / view.s;
      const m = society.markers.find((m) => Math.hypot(m.x - x, m.y - y) < r);
      if (m) return `${MARKER_TYPES[m.type].label}: ${m.name} — ${m.legend}`;
    }
    const prov = society.provinces[society.province[c]!]?.name;
    const rel = society.religions[society.religion[c]!]?.name;
    const lake = derived.lake[c]! >= 0 ? derived.lakes[derived.lake[c]!] : undefined;
    if (lake && painted === null)
      return [lake.name, lake.salty ? "água salgada, sem saída" : "água doce", st, coord]
        .filter(Boolean)
        .join(" · ");
    return [
      h >= SEA
        ? BIOMES[derived.biome[c]!]!.name
        : derived.temp[c]! < 0.16
          ? "Mar congelado"
          : "Mar",
      st,
      prov,
      cu ? `povo ${cu}` : null,
      rel,
      `${metres.toLocaleString("pt-BR")} m`,
      coord,
    ]
      .filter(Boolean)
      .join(" · ");
  };

  const onMove = (e: PointerEvent) => {
    const [x, y] = toMap(e);
    setHover(hoverText(x, y));
    if (tool === "mover" && !drag.current)
      canvas.current!.style.cursor = burgAt(x, y) ? "pointer" : "";
    const d = drag.current;
    if (d) {
      if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 4) d.moved = true;
      if (d.moved && d.burg) {
        // Arrastar uma cidade a muda de lugar (só em terra); o mapa se refaz ao soltar.
        if (heights[cellOf(x, y)]! >= SEA) setDragging({ id: d.burg, x, y });
      } else if (d.moved)
        setViewT((v) =>
          clampView({ ...v, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y }, size),
        );
    }
    if (painterTool) setBrushAt({ x, y });
    const p = painting.current;
    if (p && e.buttons) {
      p.h = paint(p.h, x, y, tool);
      // Refaz o mapa no máximo a cada ~120 ms enquanto pinta (o cálculo é pesado).
      const now = performance.now();
      if (now - p.last > 50) {
        p.last = now;
        setHeights(p.h);
      }
    }
  };
  const onUp = (e: PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (d) {
      if (d.moved && d.burg) {
        const to = dragging;
        setDragging(null);
        if (to)
          commit({
            ...map,
            burgs: map.burgs.map((b) => (b.id === to.id ? { ...b, x: to.x, y: to.y } : b)),
          });
      } else if (!d.moved) {
        const [x, y] = toMap(e);
        const b = burgAt(x, y);
        const route = b ? undefined : routeAt(x, y);
        const road = b || route ? undefined : roadAt(x, y);
        if (b) setSelected({ kind: "burg", id: b.id });
        else if (route) setSelected({ kind: "route", id: route.id });
        else if (road) setSelected({ kind: "road", id: road.name });
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
    setViewT((raw) => {
      const v = clampView(raw, size);
      const s = Math.max(fitScale(size), Math.min(40, v.s * f));
      return clampView({ s, x: mx - ((mx - v.x) / v.s) * s, y: my - ((my - v.y) / v.s) * s }, size);
    });
  const fit = () => {
    const s = fitScale(size);
    setViewT({ s, x: (size.w - COLS * s) / 2, y: (size.h - ROWS * s) / 2 });
  };

  /* ----- Painel ----- */

  const burg = selected?.kind === "burg" ? map.burgs.find((b) => b.id === selected.id) : undefined;
  const burgState = burg ? map.states[derived.owner[cellOf(burg.x, burg.y)]!] : undefined;
  const state =
    selected?.kind === "state" ? map.states.find((s) => s.id === selected.id) : undefined;
  const route =
    selected?.kind === "route" ? (map.routes ?? []).find((r) => r.id === selected.id) : undefined;
  const routeInfo = route ? vectors.routes.find((r) => r.id === route.id) : undefined;
  const road =
    selected?.kind === "road" ? vectors.namedRoads.find((r) => r.name === selected.id) : undefined;
  /** Dar nome (ou mudar o tipo) de uma estrada gerada a transforma numa rota sua. */
  const adoptRoad = (patch: Partial<Route>) => {
    if (!road) return;
    // Pontos de passagem: um a cada ~6 células (o trajeto é recalculado pelo terreno).
    const pts = road.points
      .filter((_, i) => i % 6 === 0 || i === road.points.length - 1)
      .map(([x, y]) => [((x % COLS) + COLS) % COLS, y] as [number, number]);
    const r: Route = { id: newId("r"), name: road.name, type: road.type, points: pts, ...patch };
    commit({ ...map, routes: [...(map.routes ?? []), r] });
    setSelected({ kind: "route", id: r.id });
  };
  const updateRoute = (id: string, patch: Partial<Route>) =>
    commit({
      ...map,
      routes: (map.routes ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)),
    });
  // Lugares do Mundo que ainda não estão no mapa.
  const onMap = new Set([...map.burgs.map((b) => b.noteId), ...map.states.map((s) => s.noteId)]);
  const offMap = session.project.notes
    .filter((n) => n.kind === "lugares" && !onMap.has(n.id))
    .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
  const updateBurg = (id: string, patch: Partial<Burg>) =>
    commit({ ...map, burgs: map.burgs.map((b) => (b.id === id ? { ...b, ...patch } : b)) });
  const openNote = (id: string) => {
    useWorldNav.getState().setOpenId(id);
    setView("world");
  };

  return (
    <div className={"wm" + (panelOpen ? "" : " panel-closed")} ref={root}>
      <div className="wm-canvas" ref={wrap}>
        {globe && (
          <GlobeView
            map={map}
            derived={derived}
            base={base}
            vectors={vectors}
            layers={layers}
            capitals={capitals}
            meta={meta}
            selectedBurg={selected?.kind === "burg" ? selected.id : null}
            focus={burg ?? null}
            onHover={(x, y) => setHover(hoverText(x, y))}
            onPick={(x, y) => {
              const b = map.burgs.find((q) => q.x === x && q.y === y);
              if (b) return setSelected({ kind: "burg", id: b.id });
              const o = derived.owner[cellOf(x, y)]!;
              setSelected(
                o >= 0 && map.states[o] ? { kind: "state", id: map.states[o]!.id } : null,
              );
            }}
          />
        )}
        <div className="wm-view-toggle segmented wide" role="radiogroup" aria-label="Vista">
          <button type="button" role="radio" aria-checked={!globe} onClick={() => setGlobe(false)}>
            Plano
          </button>
          <button type="button" role="radio" aria-checked={globe} onClick={() => setGlobe(true)}>
            Globo
          </button>
        </div>
        <canvas
          ref={canvas}
          hidden={globe}
          className={"tool-" + tool}
          style={{ width: size.w, height: size.h }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={() => setHover("")}
          onWheel={onWheel}
        />
        {!globe && (
          <div
            className={"wm-tools" + (toolsOpen ? "" : " compact")}
            role="toolbar"
            aria-label="Ferramentas do mapa"
          >
            <button
              type="button"
              className="wm-collapse"
              aria-label={toolsOpen ? "Recolher ferramentas" : "Mostrar nomes das ferramentas"}
              title={toolsOpen ? "Recolher (só ícones)" : "Mostrar os nomes"}
              onClick={() => setToolsOpen((v) => !v)}
            >
              <Icon name={toolsOpen ? "chevron-left" : "chevron"} size={14} />
              <span>Recolher</span>
            </button>
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
        )}
        <button
          type="button"
          className="wm-fullscreen"
          aria-pressed={fullscreen}
          title={fullscreen ? "Sair da tela cheia (Esc)" : "Tela cheia"}
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen();
            else void root.current?.requestFullscreen?.().catch(() => undefined);
          }}
        >
          <Icon name="expand" size={14} /> {fullscreen ? "Sair da tela cheia" : "Tela cheia"}
        </button>
        <button
          type="button"
          className="wm-panel-toggle"
          aria-expanded={panelOpen}
          title={panelOpen ? "Esconder as opções do mapa" : "Mostrar as opções do mapa"}
          onClick={() => setPanelOpen((v) => !v)}
        >
          <Icon name={panelOpen ? "chevron" : "chevron-left"} size={14} />
          {panelOpen ? "Esconder opções" : "Opções"}
        </button>
        {!globe && (
          <div className="wm-zoom">
            <span className="wm-zoom-level" title="100% = o planeta inteiro">
              {Math.round((view.s / fitScale(size)) * 100)}%
            </span>
            <button type="button" aria-label="Aproximar" onClick={() => zoomAt(1.4)}>
              +
            </button>
            <button type="button" aria-label="Afastar" onClick={() => zoomAt(1 / 1.4)}>
              −
            </button>
            <button
              type="button"
              aria-label="Mostrar o mapa inteiro (100%)"
              title="Mapa inteiro (100%)"
              onClick={fit}
            >
              <Icon name="expand" size={14} />
            </button>
          </div>
        )}
        {hover && <div className="wm-status">{hover}</div>}
        {tool === "rota" && !globe && (
          <div className="wm-draft">
            <span>
              {draft.length
                ? `${draft.length} ${draft.length === 1 ? "ponto" : "pontos"} · Enter ou duplo clique conclui · Backspace desfaz o último · Esc cancela`
                : "Clique no mapa para marcar o começo da rota (perto de uma cidade, encaixa nela)."}
            </span>
            {draft.length >= 2 && (
              <button type="button" className="btn primary sm" onClick={() => finishRoute()}>
                Concluir
              </button>
            )}
          </div>
        )}
        {burg && (
          <BurgDialog
            key={burg.id}
            burg={burg}
            note={session.project.notes.find((n) => n.id === burg.noteId)}
            capital={capitals.has(burg.id)}
            stateName={burgState ? fullStateName(burgState) : null}
            heights={map.heights}
            derived={derived}
            cultures={map.cultures ?? []}
            attachments={session.attachments}
            onClose={() => setSelected(null)}
            onRename={(name) => {
              // Ligada a um lugar: renomeia a ficha, e o mapa acompanha.
              if (burg.noteId && session.project.notes.some((n) => n.id === burg.noteId))
                void renameLinked(burg.noteId, name);
              else updateBurg(burg.id, { name });
            }}
            onCapital={(on) => {
              if (on)
                commit({
                  ...map,
                  states: [
                    ...map.states,
                    {
                      id: newId("e"),
                      name: nameFor(cellOf(burg.x, burg.y)),
                      color: stateColor(map.states.length),
                      capital: burg.id,
                    },
                  ],
                });
              else commit({ ...map, states: map.states.filter((s) => s.capital !== burg.id) });
            }}
            onDelete={() => {
              commit({
                ...map,
                burgs: map.burgs.filter((b) => b.id !== burg.id),
                states: map.states.filter((s) => s.capital !== burg.id),
              });
              setSelected(null);
            }}
            onOpenNote={() => burg.noteId && openNote(burg.noteId)}
            onFields={(patch) => {
              const id = burg.noteId;
              if (!id) return;
              void useApp.getState().change((p) => {
                const cur = p.notes.find((n) => n.id === id)?.fields ?? {};
                return setNoteFields(p, id, { ...cur, ...patch });
              });
            }}
          />
        )}
      </div>

      {panelOpen && (
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
              {map.states.length} estados · {map.burgs.length} cidades · {derived.rivers.length}{" "}
              rios
            </p>
            <div className="wm-modes segmented wide" role="radiogroup" aria-label="Estilo do mapa">
              {(
                [
                  ["biomas", "Biomas"],
                  ["relevo", "Relevo"],
                  ["politico", "Político"],
                  ["culturas", "Culturas"],
                  ["religioes", "Religiões"],
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
            <div className="wm-actions">
              <button type="button" className="btn ghost sm" onClick={() => setShowGen((v) => !v)}>
                <Icon name="refresh" size={14} /> Gerar outro mundo
              </button>
              <button type="button" className="btn ghost sm" onClick={() => void exportPng()}>
                <Icon name="export" size={14} /> Exportar imagem
              </button>
            </div>
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

          {road && (
            <section className="profile-card wm-sel">
              <h3>{ROUTE_TYPES.find((rt) => rt.value === road.type)?.label ?? "Estrada"}</h3>
              <input
                className="text-input"
                aria-label="Nome da estrada"
                key={road.name}
                defaultValue={road.name}
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (name && name !== road.name) adoptRoad({ name });
                }}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              />
              <div className="wm-route-types" role="radiogroup" aria-label="Tipo de rota">
                {ROUTE_TYPES.filter((rt) => rt.value !== "maritima").map((rt) => (
                  <button
                    key={rt.value}
                    type="button"
                    role="radio"
                    aria-checked={road.type === rt.value}
                    title={rt.hint}
                    onClick={() => rt.value !== road.type && adoptRoad({ type: rt.value })}
                  >
                    <span className={"route-swatch " + rt.value} />
                    {rt.label}
                  </button>
                ))}
              </div>
              <p className="wm-meta">
                {Math.round(
                  road.points.reduce(
                    (s, p, i, a) =>
                      i
                        ? s +
                          Math.hypot(
                            (p[0] - a[i - 1]![0]) *
                              Math.cos(((90 - (p[1] / ROWS) * 180) * Math.PI) / 180),
                            p[1] - a[i - 1]![1],
                          )
                        : 0,
                    0,
                  ) * KM_PER_CELL,
                ).toLocaleString("pt-BR")}{" "}
                km · gerada pelo mapa
              </p>
              <p className="field-hint">
                Ao mudar o nome ou o tipo, ela vira uma rota sua (fica na lista Rotas e pode ser
                editada ou excluída).
              </p>
            </section>
          )}

          {route && routeInfo && (
            <section className="profile-card wm-sel">
              <h3>Rota</h3>
              <input
                className="text-input"
                aria-label="Nome da rota"
                key={route.id + route.name}
                defaultValue={route.name}
                placeholder="ex.: Rodovia Castelo Branco, Estrada dos Romeiros"
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (name && name !== route.name) updateRoute(route.id, { name });
                }}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              />
              <div className="wm-route-types" role="radiogroup" aria-label="Tipo de rota">
                {ROUTE_TYPES.map((rt) => (
                  <button
                    key={rt.value}
                    type="button"
                    role="radio"
                    aria-checked={route.type === rt.value}
                    title={rt.hint}
                    onClick={() => updateRoute(route.id, { type: rt.value })}
                  >
                    <span className={"route-swatch " + rt.value} />
                    {rt.label}
                  </button>
                ))}
              </div>
              <p className="wm-meta">
                {Math.round(routeInfo.length * KM_PER_CELL).toLocaleString("pt-BR")} km ·{" "}
                {route.points.length} pontos de passagem
              </p>
              <div className="profile-photo-actions">
                <button
                  type="button"
                  className="btn ghost sm danger"
                  onClick={() => {
                    commit({ ...map, routes: (map.routes ?? []).filter((r) => r.id !== route.id) });
                    setSelected(null);
                  }}
                >
                  <Icon name="trash" size={14} /> Excluir rota
                </button>
              </div>
            </section>
          )}

          {state && (
            <section className="profile-card wm-sel">
              <h3>{fullStateName(state)}</h3>
              <div className="field">
                <label>Forma de governo</label>
                <Select
                  value={state.form ?? "Reino"}
                  options={STATE_FORMS.map((f) => ({ value: f, label: f }))}
                  onChange={(v) =>
                    v &&
                    commit({
                      ...map,
                      states: map.states.map((s) =>
                        s.id === state.id ? { ...s, form: v as StateForm } : s,
                      ),
                    })
                  }
                />
              </div>
              <div className="wm-state-row">
                <input
                  type="color"
                  aria-label="Cor do estado"
                  value={state.color}
                  onChange={(e) => {
                    // Enquanto escolhe, só pinta; o passo de desfazer guarda a cor de antes.
                    colorBefore.current ??= snapshot();
                    clearTimeout(colorTimer.current);
                    colorTimer.current = setTimeout(() => {
                      const before = colorBefore.current;
                      colorBefore.current = null;
                      if (!before) return;
                      undo.current = [...undo.current.slice(-29), before];
                      redo.current = [];
                      syncHist();
                      setMap(useWorldMap.getState().map!);
                    }, 400);
                    useWorldMap.setState({
                      map: {
                        ...map,
                        states: map.states.map((s) =>
                          s.id === state.id ? { ...s, color: e.target.value } : s,
                        ),
                      },
                    });
                  }}
                />
                <input
                  className="text-input"
                  aria-label="Nome do estado"
                  key={state.id + state.name}
                  defaultValue={state.name}
                  onBlur={(e) => {
                    const name = e.target.value.trim();
                    if (!name || name === state.name) return;
                    if (state.noteId && session.project.notes.some((n) => n.id === state.noteId))
                      void renameLinked(state.noteId, name);
                    else
                      commit({
                        ...map,
                        states: map.states.map((s) => (s.id === state.id ? { ...s, name } : s)),
                      });
                  }}
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
                    {society.provinces.some((p) => p.state === k) && (
                      <div className="wm-provinces">
                        <span>Províncias</span>
                        <ul>
                          {society.provinces
                            .filter((p) => p.state === k)
                            .map((p) => (
                              <li key={p.seat}>
                                <button
                                  type="button"
                                  className="link-btn"
                                  onClick={() => setSelected({ kind: "burg", id: p.seat })}
                                  title="Abrir a sede da província"
                                >
                                  {p.name}
                                </button>
                              </li>
                            ))}
                        </ul>
                      </div>
                    )}
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
                  Elevar e Rebaixar pintam o relevo: crie ilhas, cordilheiras e mares. Rios, biomas
                  e fronteiras se refazem sozinhos.
                </li>
                <li>
                  Cada estado e cidade é um lugar no Mundo: renomear ou apagar de um lado vale para
                  o outro. A ficha do lugar tem “Ver no mapa-múndi”.
                </li>
              </ul>
            </section>
          )}
          {placing && (
            <section className="profile-card wm-placing">
              <p>
                Clique em terra no mapa para pôr{" "}
                <b>{session.project.notes.find((n) => n.id === placing)?.title}</b>.
              </p>
              <button type="button" className="btn ghost sm" onClick={() => setPlacing(null)}>
                Cancelar
              </button>
            </section>
          )}
          {offMap.length > 0 && (
            <section className="profile-card wm-offmap">
              <h3>Lugares fora do mapa</h3>
              <p className="field-hint">
                Lugares do Mundo que ainda não estão no mapa. Ponha cada um onde fica.
              </p>
              <ul>
                {offMap.map((n) => (
                  <li key={n.id}>
                    <span>{n.title}</span>
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => {
                        setPlacing(n.id);
                        setTool("cidade");
                        setSelected(null);
                      }}
                    >
                      <Icon name="pin" size={13} /> Pôr no mapa
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="profile-card wm-routes">
            <h3>Rotas</h3>
            <ul className="wm-route-legend">
              {ROUTE_TYPES.map((rt) => (
                <li key={rt.value}>
                  <span className={"route-swatch " + rt.value} />
                  {rt.label}
                </li>
              ))}
            </ul>
            {(map.routes ?? []).length ? (
              <ul className="wm-route-list">
                {(map.routes ?? []).map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      className={selected?.id === r.id ? "on" : ""}
                      onClick={() => setSelected({ kind: "route", id: r.id })}
                    >
                      <span className={"route-swatch " + r.type} />
                      {r.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="field-hint">
                As estradas geradas ligam cidades e capitais. Para traçar e dar nome a uma rota sua
                (uma rodovia, um caminho de romeiros, uma trilha na serra), use a ferramenta Rota.
              </p>
            )}
            <button type="button" className="btn ghost sm" onClick={() => setTool("rota")}>
              <Icon name="link" size={14} /> Traçar rota
            </button>
          </section>
          {(map.cultures ?? []).length > 0 && (
            <section className="profile-card wm-legend wm-cultures">
              <h3>Culturas</h3>
              <ul>
                {(map.cultures ?? []).map((c) => (
                  <li key={c.id} title={`Nomes no estilo ${nameBase(c.base).label.toLowerCase()}`}>
                    <span style={{ background: c.color }} />
                    <div>
                      {c.name}
                      <small>
                        {CULTURE_TYPES[c.type]} · {nameBase(c.base).label}
                      </small>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {mode === "religioes" && society.religions.length > 0 && (
            <section className="profile-card wm-legend wm-cultures">
              <h3>Religiões</h3>
              <ul>
                {society.religions.map((r) => (
                  <li key={r.name} title={`Divindade: ${r.deity}`}>
                    <span style={{ background: r.color }} />
                    <div>
                      {r.name}
                      <small>
                        {r.type} · {r.form}
                      </small>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {layers.marcadores && society.markers.length > 0 && (
            <section className="profile-card wm-legend wm-markers">
              <h3>Marcadores</h3>
              <ul>
                {(Object.keys(MARKER_TYPES) as (keyof typeof MARKER_TYPES)[])
                  .filter((k) => society.markers.some((m) => m.type === k))
                  .map((k) => (
                    <li key={k}>
                      <span className="wm-marker-icon">{MARKER_TYPES[k].icon}</span>
                      {MARKER_TYPES[k].label}
                    </li>
                  ))}
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
      )}
    </div>
  );
}
