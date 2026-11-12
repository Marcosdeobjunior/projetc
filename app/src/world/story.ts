import type { Project } from "../manuscript/types";
import type { TimelineData } from "../timeline/timeline";
import { COLS, ROWS, type WorldMap } from "./worldgen";

/*
 * A história no mapa: onde se passa cada cena e o caminho de cada personagem.
 * O lugar de uma cena é o escolhido pelo autor; sem escolha, o lugar do mapa
 * mais citado no texto da cena. As posições vêm das cidades (e estados) do
 * mapa-múndi ligados às notas de lugar.
 */

export interface ScenePlace {
  sceneId: string;
  title: string;
  chapterId: string;
  chapterTitle: string;
  /** Posição na ordem do livro (0, 1, 2…). */
  order: number;
  chapterIndex: number;
  /** Nota de lugar onde a cena se passa (ou null). */
  place: string | null;
  /** O lugar foi deduzido do texto (e não escolhido)? */
  auto: boolean;
  /** Dia da história, se a cena tem data. */
  day: number | null;
  days: number;
}

/** Posição (em células) de cada nota de lugar que está no mapa. */
export function placePositions(map: WorldMap): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>();
  for (const b of map.burgs) if (b.noteId) pos.set(b.noteId, { x: b.x, y: b.y });
  // Estados: a posição da capital (um país inteiro é "o lugar" de uma cena).
  for (const s of map.states) {
    if (!s.noteId || pos.has(s.noteId)) continue;
    const cap = map.burgs.find((b) => b.id === s.capital);
    if (cap) pos.set(s.noteId, { x: cap.x, y: cap.y });
  }
  return pos;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Quantas vezes o nome aparece no texto (palavra inteira, sem diferenciar maiúsculas). */
function countName(text: string, name: string): number {
  if (!name.trim()) return 0;
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escape(name)}(?![\\p{L}\\p{N}])`, "giu");
  return text.match(re)?.length ?? 0;
}

export function scenePlaces(
  project: Project,
  texts: Record<string, string>,
  data: TimelineData,
  onMap: Set<string>,
): ScenePlace[] {
  const places = project.notes.filter((n) => n.kind === "lugares");
  const isPlace = new Set(places.map((n) => n.id));
  const out: ScenePlace[] = [];
  let order = 0;
  project.chapters.forEach((c, ci) => {
    for (const s of c.scenes) {
      const date = data.scenes[s.id];
      const chosen = date?.place ?? data.places?.[s.id];
      let place: string | null = chosen && isPlace.has(chosen) ? chosen : null;
      let auto = false;
      if (!place) {
        // O lugar do mapa mais citado no texto (links [[…]] e menções contam igual).
        const text = texts[s.id] ?? "";
        let best = 0;
        for (const n of places) {
          if (!onMap.has(n.id)) continue;
          const k = countName(text, n.title);
          if (k > best) {
            best = k;
            place = n.id;
          }
        }
        auto = !!place;
      }
      out.push({
        sceneId: s.id,
        title: s.title,
        chapterId: c.id,
        chapterTitle: c.title,
        order: order++,
        chapterIndex: ci,
        place,
        auto,
        day: date ? date.day : null,
        days: date ? date.days : 1,
      });
    }
  });
  return out;
}

/** Distância (km) pelo arco entre duas posições do mapa (planeta do tamanho da Terra). */
export function distanceKm(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const toRad = Math.PI / 180;
  const lon1 = ((a.x / COLS) * 360 - 180) * toRad;
  const lon2 = ((b.x / COLS) * 360 - 180) * toRad;
  const lat1 = (90 - (a.y / ROWS) * 180) * toRad;
  const lat2 = (90 - (b.y / ROWS) * 180) * toRad;
  const h =
    Math.sin((lat2 - lat1) / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Quilômetros por dia de viagem, por meio de transporte e época. */
export const TRAVEL_MODES = {
  fantasia: [
    { label: "a pé", kmPerDay: 30 },
    { label: "a cavalo", kmPerDay: 60 },
    { label: "de navio", kmPerDay: 150 },
  ],
  atual: [
    { label: "de carro", kmPerDay: 700 },
    { label: "de avião", kmPerDay: 8000 },
  ],
} as const;

export interface JourneyStop {
  scene: ScenePlace;
  place: string;
  x: number;
  y: number;
}

export interface JourneyLeg {
  from: JourneyStop;
  to: JourneyStop;
  km: number;
  /** Dias entre o fim da cena de saída e a de chegada (se as duas têm data). */
  elapsed: number | null;
}

export interface Journey {
  noteId: string;
  stops: JourneyStop[];
  legs: JourneyLeg[];
  km: number;
}

/**
 * Caminho de um personagem: as cenas em que ele aparece e que têm lugar no
 * mapa, na ordem da história (pela data; sem data, pela ordem do livro), sem
 * repetir paradas seguidas no mesmo lugar.
 */
export function journey(
  noteId: string,
  scenes: ScenePlace[],
  linksOf: Map<string, string[]>,
  pos: Map<string, { x: number; y: number }>,
): Journey {
  const mine = scenes.filter(
    (s) => s.place && pos.has(s.place) && (linksOf.get(s.sceneId) ?? []).includes(noteId),
  );
  // Ordem da história: cena sem data fica logo depois da cena com data anterior no livro.
  let lastDay = -Infinity;
  const keyed = mine.map((s) => {
    if (s.day !== null) lastDay = s.day;
    return { s, key: s.day ?? lastDay };
  });
  keyed.sort((a, b) => a.key - b.key || a.s.order - b.s.order);
  const stops: JourneyStop[] = [];
  for (const { s } of keyed) {
    const p = pos.get(s.place!)!;
    const prev = stops[stops.length - 1];
    if (prev && prev.place === s.place) continue;
    stops.push({ scene: s, place: s.place!, x: p.x, y: p.y });
  }
  const legs: JourneyLeg[] = [];
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1]!;
    const b = stops[i]!;
    const elapsed =
      a.scene.day !== null && b.scene.day !== null
        ? b.scene.day - (a.scene.day + a.scene.days - 1)
        : null;
    legs.push({ from: a, to: b, km: distanceKm(a, b), elapsed });
  }
  return { noteId, stops, legs, km: legs.reduce((s, l) => s + l.km, 0) };
}

/** Cores das jornadas (uma por personagem). */
export const JOURNEY_COLORS = [
  "#e4572e",
  "#2e86de",
  "#9b59b6",
  "#16a085",
  "#f39c12",
  "#d63384",
  "#6c5ce7",
  "#20bf6b",
];
