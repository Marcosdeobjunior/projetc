import type { Project, Note, TreeChange } from "../manuscript/types";
import { addNote, removeNote, setNoteFields } from "../manuscript/tree";
import type { WorldMap } from "./worldgen";

/*
 * Mapa-múndi e Mundo são a mesma coisa: cada estado do mapa é um lugar
 * ("Reino") e cada cidade é um lugar ("Cidade" ou "Capital", que "fica em" o
 * reino). Os nomes vêm da ficha (renomear no Mundo renomeia no mapa), e um
 * lugar apagado no Mundo some do mapa. Tudo aqui é puro: devolve o projeto e
 * o mapa já ajustados.
 */

export const AUTO_TYPES = ["Reino", "Capital", "Cidade"];

const sameTitle = (a: string, b: string) =>
  a.toLocaleLowerCase("pt-BR") === b.toLocaleLowerCase("pt-BR");

export interface WorldSync {
  project: Project;
  map: WorldMap;
  /** Algo mudou no projeto (precisa gravar). */
  projectChanged: boolean;
  /** Algo mudou no mapa. */
  mapChanged: boolean;
}

export function syncWorldNotes(
  map: WorldMap,
  project: Project,
  /** Recria lugares que sumiram (ao desfazer uma exclusão no mapa) em vez de tirar do mapa. */
  recreate = false,
): WorldSync {
  let p = project;
  let projectChanged = false;
  const byId = () => new Map(p.notes.map((n) => [n.id, n]));
  const link = (noteId: string | undefined, title: string): string | null => {
    const notes = byId();
    if (noteId && notes.get(noteId)) return noteId;
    if (noteId && !recreate) return null; // ligado, mas o lugar foi apagado no Mundo
    // Ainda sem ligação: usa um lugar com o mesmo nome, ou cria um.
    const same = p.notes.find((n) => n.kind === "lugares" && sameTitle(n.title, title));
    if (same) return same.id;
    const r = addNote(p, "lugares", title);
    p = r.project;
    projectChanged = true;
    return r.note.id;
  };

  // Estados.
  const states: WorldMap["states"] = [];
  let mapChanged = false;
  for (const s of map.states) {
    const id = link(s.noteId, s.name);
    if (!id) {
      mapChanged = true; // o lugar foi apagado no Mundo: o estado sai do mapa
      continue;
    }
    const note = byId().get(id)!;
    if (id !== s.noteId || note.title !== s.name) mapChanged = true;
    states.push({ ...s, noteId: id, name: note.title });
  }
  // Cidades.
  const burgs: WorldMap["burgs"] = [];
  for (const b of map.burgs) {
    const id = link(b.noteId, b.name);
    if (!id) {
      mapChanged = true;
      continue;
    }
    const note = byId().get(id)!;
    if (id !== b.noteId || note.title !== b.name) mapChanged = true;
    burgs.push({ ...b, noteId: id, name: note.title });
  }
  // Estado cuja capital sumiu também sai.
  const burgIds = new Set(burgs.map((b) => b.id));
  const keptStates = states.filter((s) => burgIds.has(s.capital));
  if (keptStates.length !== states.length) mapChanged = true;

  return {
    project: p,
    map: mapChanged ? { ...map, states: keptStates, burgs } : map,
    projectChanged,
    mapChanged,
  };
}

/**
 * Campos automáticos das fichas: tipo (Reino/Capital/Cidade) e "Fica em" (o
 * reino da cidade). Só preenche o que está vazio ou que o próprio mapa pôs.
 * `ownerOf` diz o índice do estado em que cada cidade está (ou -1).
 */
export function applyWorldFields(
  map: WorldMap,
  project: Project,
  ownerOf: (burgId: string) => number,
): { project: Project; changed: boolean } {
  let p = project;
  let changed = false;
  const stateNoteIds = new Set(map.states.map((s) => s.noteId).filter(Boolean));
  const capitals = new Set(map.states.map((s) => s.capital));
  const set = (note: Note | undefined, patch: Record<string, string>) => {
    if (!note) return;
    const cur = note.fields ?? {};
    const next = { ...cur };
    for (const [k, v] of Object.entries(patch)) {
      const old = cur[k] ?? "";
      const auto =
        !old ||
        (k === "tipo" && AUTO_TYPES.includes(old)) ||
        (k === "regiao" && stateNoteIds.has(old));
      if (auto && old !== v) next[k] = v;
    }
    if (Object.keys(next).some((k) => next[k] !== cur[k])) {
      p = setNoteFields(p, note.id, next).project;
      changed = true;
    }
  };
  const notes = new Map(p.notes.map((n) => [n.id, n]));
  for (const s of map.states) if (s.noteId) set(notes.get(s.noteId), { tipo: "Reino" });
  for (const b of map.burgs) {
    if (!b.noteId) continue;
    const k = ownerOf(b.id);
    const state = k >= 0 ? map.states[k] : undefined;
    const patch: Record<string, string> = { tipo: capitals.has(b.id) ? "Capital" : "Cidade" };
    patch.regiao = state?.noteId ?? "";
    set(notes.get(b.noteId), patch);
  }
  return { project: p, changed };
}

/**
 * Lugares criados pelo mapa e nunca mexidos (sem texto, imagem ou campos além
 * dos automáticos) podem ir para a lixeira quando saem do mapa.
 */
export function untouchedMapNote(note: Note, text: string | undefined): boolean {
  if (note.kind !== "lugares" || note.image || note.images?.length) return false;
  if ((text ?? "").replace(/^#.*$/m, "").trim()) return false;
  const f = note.fields ?? {};
  return Object.keys(f).every(
    (k) => (k === "tipo" && AUTO_TYPES.includes(f[k]!)) || k === "regiao",
  );
}

/** Tira do Mundo (para a lixeira) os lugares do mapa que ninguém mexeu. */
export function retireNotes(
  project: Project,
  ids: string[],
  texts: Record<string, string>,
): TreeChange {
  let p = project;
  const ops: TreeChange["ops"] = [];
  for (const id of ids) {
    const note = p.notes.find((n) => n.id === id);
    if (!note || !untouchedMapNote(note, texts[id])) continue;
    const r = removeNote(p, id);
    p = r.project;
    ops.push(...r.ops);
  }
  return { project: p, ops };
}
