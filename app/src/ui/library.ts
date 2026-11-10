import { useEffect, useState } from "react";
import { create } from "zustand";
import type { Platform, VaultRef } from "../platform";
import { loadProject, readProjectTexts } from "../vault/vault";

/** Números de um projeto, lidos do disco para a tela de projetos. */
export interface ProjectStats {
  root: string;
  chapters: number;
  scenes: number;
  words: number;
  characters: number;
  places: number;
  ideas: number;
  /** Total de notas, de todos os tipos. */
  notes: number;
  createdAt: number;
  updatedAt: number;
  /** Começo do primeiro texto com conteúdo, mostrado como sinopse na capa. */
  excerpt: string;
}

async function readStats(platform: Platform, root: string): Promise<ProjectStats | null> {
  try {
    const fs = platform.fs(root);
    const project = await loadProject(fs);
    const { words, texts } = await readProjectTexts(fs, project);
    const sceneIds = project.chapters.flatMap((c) => c.scenes.map((s) => s.id));
    const firstText = sceneIds.map((id) => texts[id]?.trim()).find((t) => t) ?? "";
    const kind = (k: string) => project.notes.filter((n) => n.kind === k).length;
    return {
      root,
      chapters: project.chapters.length,
      scenes: sceneIds.length,
      words: sceneIds.reduce((n, id) => n + (words[id] ?? 0), 0),
      characters: kind("personagens"),
      places: kind("lugares"),
      ideas: kind("ideias"),
      notes: project.notes.length,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      excerpt: firstText.length > 420 ? firstText.slice(0, 420).trimEnd() + "…" : firstText,
    };
  } catch {
    // Pasta movida ou apagada: o projeto aparece sem números.
    return null;
  }
}

/** Lê os números de todos os projetos conhecidos. */
export function useLibraryStats(platform: Platform | null, vaults: VaultRef[]) {
  const [stats, setStats] = useState<Record<string, ProjectStats | null>>({});
  const key = vaults.map((v) => v.root).join("\n");
  useEffect(() => {
    if (!platform) return;
    let alive = true;
    void Promise.all(vaults.map((v) => readStats(platform, v.root))).then((list) => {
      if (!alive) return;
      setStats(Object.fromEntries(vaults.map((v, i) => [v.root, list[i] ?? null])));
    });
    return () => {
      alive = false;
    };
    // `key` muda quando a lista de projetos muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform, key]);
  return stats;
}

/*
 * Metas de palavras de cada projeto. Ficam no armazenamento local da janela,
 * como as outras preferências do app.
 */
const GOALS_KEY = "talia.goals";

function loadGoals(): Record<string, number> {
  try {
    return (JSON.parse(localStorage.getItem(GOALS_KEY) ?? "null") as Record<string, number>) ?? {};
  } catch {
    return {};
  }
}

interface GoalsState {
  goals: Record<string, number>;
  setGoal(root: string, words: number | null): void;
}

export const useGoals = create<GoalsState>((set, get) => ({
  goals: loadGoals(),
  setGoal(root, words) {
    const goals = { ...get().goals };
    if (words && words > 0) goals[root] = Math.round(words);
    else delete goals[root];
    set({ goals });
    try {
      localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
    } catch {
      // sem armazenamento: a meta vale só enquanto a janela estiver aberta
    }
  },
}));

const QUOTES: [string, string][] = [
  [
    "O valor das coisas não está no tempo que elas duram, mas na intensidade com que acontecem.",
    "Fernando Pessoa",
  ],
  [
    "Escrever é esquecer. A literatura é a maneira mais agradável de ignorar a vida.",
    "Fernando Pessoa",
  ],
  ["Palavra puxa palavra, uma ideia traz outra, e assim se faz um livro.", "Machado de Assis"],
  [
    "Viver é muito perigoso… Querer o bem com demais força, de incerto jeito, pode já estar sendo se querendo o mal.",
    "Guimarães Rosa",
  ],
  ["O que a vida quer da gente é coragem.", "Guimarães Rosa"],
  ["Liberdade é pouco. O que eu desejo ainda não tem nome.", "Clarice Lispector"],
  [
    "Enquanto eu tiver perguntas e não houver resposta, continuarei a escrever.",
    "Clarice Lispector",
  ],
  ["Tudo vale a pena se a alma não é pequena.", "Fernando Pessoa"],
  ["A gente escreve o que ouve, nunca o que houve.", "Oswald de Andrade"],
  ["No meio do caminho tinha uma pedra.", "Carlos Drummond de Andrade"],
];

/** Uma citação por dia; `offset` passa para as próximas. */
export function quoteOfTheDay(offset: number, now = new Date()): { text: string; author: string } {
  const day = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86_400_000,
  );
  const [text, author] = QUOTES[(day + offset) % QUOTES.length]!;
  return { text, author };
}

/** Cor da capa gerada a partir do título, sempre a mesma para o mesmo livro. */
export function coverHue(title: string): number {
  let h = 0;
  for (const ch of title) h = (h * 31 + ch.codePointAt(0)!) % 360;
  return h;
}

const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

export function timeAgo(ts: number, now = Date.now()): string {
  const s = Math.round((ts - now) / 1000);
  const abs = Math.abs(s);
  if (abs < 60) return "agora";
  if (abs < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(s / 3600), "hour");
  if (abs < 86_400 * 30) return rtf.format(Math.round(s / 86_400), "day");
  if (abs < 86_400 * 365) return rtf.format(Math.round(s / (86_400 * 30)), "month");
  return rtf.format(Math.round(s / (86_400 * 365)), "year");
}
