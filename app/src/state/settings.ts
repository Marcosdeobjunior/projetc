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

/** Seções da barra lateral que podem ser recolhidas. */
export type SectionId = "manuscrito" | "notas" | "personagens" | "lugares" | "ideias";

interface Prefs {
  theme: Theme;
  minimap: boolean;
  minimapPos: MinimapPos;
  /** Conta as menções automáticas (nomes no texto) no minimapa. */
  minimapMentions: boolean;
  collapsed: SectionId[];
}

interface SettingsState extends Prefs {
  set(patch: Partial<Prefs>): void;
  toggleSection(id: SectionId): void;
}

const KEY = "inkflow.settings";
const OLD_THEME_KEY = "inkflow.theme";

const DEFAULTS: Prefs = {
  theme: "system",
  minimap: true,
  minimapPos: "bottom-right",
  minimapMentions: true,
  collapsed: [],
};

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

export const useSettings = create<SettingsState>((set, get) => ({
  ...load(),
  set(patch) {
    set(patch);
  },
  toggleSection(id) {
    const c = get().collapsed;
    set({ collapsed: c.includes(id) ? c.filter((x) => x !== id) : [...c, id] });
  },
}));

applyTheme(useSettings.getState().theme);
useSettings.subscribe((s, prev) => {
  if (s.theme !== prev.theme) applyTheme(s.theme);
  const prefs: Prefs = {
    theme: s.theme,
    minimap: s.minimap,
    minimapPos: s.minimapPos,
    minimapMentions: s.minimapMentions,
    collapsed: s.collapsed,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // sem armazenamento: vale só nesta sessão
  }
});
