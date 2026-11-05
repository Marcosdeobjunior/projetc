import { create } from "zustand";
import { migrateHomeBg, type HomeBg } from "./backgrounds";

/*
 * Preferências do app (valem para todos os projetos), guardadas no
 * armazenamento local da janela.
 */

/**
 * Paletas do app. Cada uma define as cores de tudo (editor e tela de
 * projetos) e se é clara ou escura; não há cores livres.
 */
export type PaletteId = "ambar" | "perola" | "esmeralda" | "natury";

export const PALETTES: {
  id: PaletteId;
  label: string;
  hint: string;
  theme: "light" | "dark";
  /** Amostras: fundo, painel, destaque, secundária. */
  swatch: [string, string, string, string];
}[] = [
  {
    id: "ambar",
    label: "Âmbar",
    hint: "Dourado e preto",
    theme: "dark",
    swatch: ["#0a0806", "#1d1810", "#e2b35a", "#c97a3a"],
  },
  {
    id: "perola",
    label: "Pérola",
    hint: "Marfim iridescente",
    theme: "light",
    swatch: ["#f6f2ec", "#e6dfd8", "#7d5f86", "#b4698a"],
  },
  {
    id: "esmeralda",
    label: "Esmeralda",
    hint: "Verde-joia no escuro",
    theme: "dark",
    swatch: ["#03100c", "#0d221a", "#3fd9a0", "#d9c57c"],
  },
  {
    id: "natury",
    label: "Natury",
    hint: "Folha e terra",
    theme: "light",
    swatch: ["#eef0e4", "#dbe1cb", "#3f6b3a", "#b0573a"],
  },
];

const isPalette = (v: unknown): v is PaletteId => PALETTES.some((p) => p.id === v);

/** Onde o minimapa fica na página: 4 cantos ou o meio de cada lado. */
export type MinimapPos =
  "top-left" | "top" | "top-right" | "right" | "bottom-right" | "bottom" | "bottom-left" | "left";

export const MINIMAP_POSITIONS: MinimapPos[] = [
  "top-left",
  "top",
  "top-right",
  "left",
  "right",
  "bottom-left",
  "bottom",
  "bottom-right",
];

export type { HomeBg } from "./backgrounds";
export { THEME_BACKGROUNDS, migrateHomeBg, themeBackgroundUrl } from "./backgrounds";

/** Seções da barra lateral que podem ser recolhidas. */
export type SectionId = "manuscrito" | "notas" | "personagens" | "lugares" | "ideias" | "anexos";

interface Prefs {
  palette: PaletteId;
  minimap: boolean;
  minimapPos: MinimapPos;
  /** Conta as menções automáticas (nomes no texto) no minimapa. */
  minimapMentions: boolean;
  collapsed: SectionId[];
  /** Nome do escritor, mostrado no topo da tela de projetos. */
  userName: string;
  /** De quantos em quantos minutos sincronizar com o Drive (0 = só quando pedir). */
  syncEvery: number;
  /** Fundo da tela de projetos. */
  homeBg: HomeBg;
  /** Quanto a imagem de fundo é suavizada (0 a 85, em %), para o texto continuar legível. */
  homeBgDim: number;
}

interface SettingsState extends Prefs {
  /** Imagem de fundo (data URL). Fica guardada à parte, por ser grande. */
  homeBgImage: string | null;
  set(patch: Partial<Prefs>): void;
  toggleSection(id: SectionId): void;
  /** Troca a imagem de fundo. Devolve false se não couber no armazenamento. */
  setHomeBgImage(image: string | null): boolean;
}

const KEY = "inkflow.settings";
const OLD_THEME_KEY = "inkflow.theme";
const BG_IMAGE_KEY = "inkflow.homeBgImage";

const DEFAULTS: Prefs = {
  palette: "ambar",
  minimap: true,
  minimapPos: "bottom-right",
  minimapMentions: true,
  collapsed: [],
  userName: "",
  syncEvery: 5,
  homeBg: "tema",
  homeBgDim: 45,
};

function loadImage(): string | null {
  try {
    return localStorage.getItem(BG_IMAGE_KEY);
  } catch {
    return null;
  }
}

function load(): Prefs {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as
      (Partial<Prefs> & { theme?: string }) | null;
    // Versões anteriores tinham tema claro/escuro (e antes disso só o tema,
    // em outra chave): o claro vira Pérola, o resto Âmbar.
    const theme = saved?.theme ?? localStorage.getItem(OLD_THEME_KEY);
    const palette = isPalette(saved?.palette)
      ? saved.palette
      : theme === "light"
        ? "perola"
        : DEFAULTS.palette;
    return {
      ...DEFAULTS,
      ...pick(saved ?? {}),
      palette,
      homeBg: migrateHomeBg(saved?.homeBg),
    };
  } catch {
    return DEFAULTS;
  }
}

/** Só as preferências que ainda existem (as antigas ficam para trás). */
function pick(saved: Partial<Prefs>): Partial<Prefs> {
  const out: Partial<Prefs> = {};
  for (const k of Object.keys(DEFAULTS) as (keyof Prefs)[])
    if (saved[k] !== undefined) (out as Record<string, unknown>)[k] = saved[k];
  return out;
}

/** Aplica a paleta em todo o app: as cores vêm do CSS (`data-palette`). */
function applyPalette(id: PaletteId) {
  const root = document.documentElement;
  const palette = PALETTES.find((p) => p.id === id) ?? PALETTES[0]!;
  root.dataset.palette = palette.id;
  // Claro ou escuro decide o resto (contrastes, sombras, cores das notas).
  root.dataset.theme = palette.theme;
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...load(),
  homeBgImage: loadImage(),
  set(patch) {
    set(patch);
  },
  setHomeBgImage(image) {
    try {
      if (image) localStorage.setItem(BG_IMAGE_KEY, image);
      else localStorage.removeItem(BG_IMAGE_KEY);
    } catch {
      if (image) return false;
    }
    set({ homeBgImage: image });
    return true;
  },
  toggleSection(id) {
    const c = get().collapsed;
    set({ collapsed: c.includes(id) ? c.filter((x) => x !== id) : [...c, id] });
  },
}));

applyPalette(useSettings.getState().palette);
useSettings.subscribe((s, prev) => {
  if (s.palette !== prev.palette) applyPalette(s.palette);
  const prefs: Prefs = {
    palette: s.palette,
    minimap: s.minimap,
    minimapPos: s.minimapPos,
    minimapMentions: s.minimapMentions,
    collapsed: s.collapsed,
    userName: s.userName,
    syncEvery: s.syncEvery,
    homeBg: s.homeBg,
    homeBgDim: s.homeBgDim,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // sem armazenamento: vale só nesta sessão
  }
});
