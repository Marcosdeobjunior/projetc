import { create } from "zustand";

/*
 * Preferências do app (valem para todos os projetos), guardadas no
 * armazenamento local da janela.
 */

export type Theme = "system" | "light" | "dark";

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

/** Fundos da tela de projetos: prontos, uma cor ou uma imagem do usuário. */
export type HomeBg = "ceu" | "aurora" | "crepusculo" | "liso" | "cor" | "imagem";

/** Seções da barra lateral que podem ser recolhidas. */
export type SectionId = "manuscrito" | "notas" | "personagens" | "lugares" | "ideias" | "anexos";

interface Prefs {
  theme: Theme;
  minimap: boolean;
  minimapPos: MinimapPos;
  /** Conta as menções automáticas (nomes no texto) no minimapa. */
  minimapMentions: boolean;
  collapsed: SectionId[];
  /** Cor de destaque escolhida (#rrggbb), ou null para a cor padrão. */
  accent: string | null;
  /** Nome do escritor, mostrado no topo da tela de projetos. */
  userName: string;
  /** De quantos em quantos minutos sincronizar com o Drive (0 = só quando pedir). */
  syncEvery: number;
  /** Fundo da tela de projetos. */
  homeBg: HomeBg;
  /** Cor usada quando o fundo é "cor" (#rrggbb). */
  homeBgColor: string;
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
  theme: "system",
  minimap: true,
  minimapPos: "bottom-right",
  minimapMentions: true,
  collapsed: [],
  accent: null,
  userName: "",
  syncEvery: 5,
  homeBg: "ceu",
  homeBgColor: "#1d2433",
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
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Prefs> | null;
    if (saved) return { ...DEFAULTS, ...saved };
    // Versões anteriores guardavam só o tema.
    const theme = localStorage.getItem(OLD_THEME_KEY);
    return { ...DEFAULTS, theme: theme === "light" || theme === "dark" ? theme : "system" };
  } catch {
    return DEFAULTS;
  }
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
}

/** Matiz e saturação de uma cor #rrggbb. */
export function hexToHueSat(hex: string): { h: number; s: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255) as [
    number,
    number,
    number,
  ];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  if (d === 0) return { h: 0, s: 0 };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = Math.round(h * 60);
  return { h: h < 0 ? h + 360 : h, s: Math.round(s * 100) };
}

/**
 * Aplica a cor de destaque em todo o app. A claridade de cada tom vem do CSS,
 * para a cor ficar legível tanto no tema claro quanto no escuro.
 */
function applyAccent(accent: string | null) {
  const root = document.documentElement;
  const hs = accent ? hexToHueSat(accent) : null;
  if (!hs) {
    delete root.dataset.accent;
    root.style.removeProperty("--ac-h");
    root.style.removeProperty("--ac-s");
    return;
  }
  root.dataset.accent = "custom";
  root.style.setProperty("--ac-h", String(hs.h));
  root.style.setProperty("--ac-s", `${hs.s}%`);
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

applyTheme(useSettings.getState().theme);
applyAccent(useSettings.getState().accent);
useSettings.subscribe((s, prev) => {
  if (s.theme !== prev.theme) applyTheme(s.theme);
  if (s.accent !== prev.accent) applyAccent(s.accent);
  const prefs: Prefs = {
    theme: s.theme,
    minimap: s.minimap,
    minimapPos: s.minimapPos,
    minimapMentions: s.minimapMentions,
    collapsed: s.collapsed,
    accent: s.accent,
    userName: s.userName,
    syncEvery: s.syncEvery,
    homeBg: s.homeBg,
    homeBgColor: s.homeBgColor,
    homeBgDim: s.homeBgDim,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // sem armazenamento: vale só nesta sessão
  }
});
