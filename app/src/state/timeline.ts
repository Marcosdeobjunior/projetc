import { create } from "zustand";
import {
  EMPTY_TIMELINE,
  readTimeline,
  setTravel,
  writeTimeline,
  type Dated,
  type TimelineData,
  type TimelineEvent,
} from "../timeline/timeline";
import type { CalendarDef } from "../timeline/calendar";
import { useApp } from "./store";
import { serial } from "./writes";

/** Linha do tempo do projeto aberto. Gravada na fila única de escrita. */
interface TimelineState {
  root: string | null;
  data: TimelineData;
  load(): Promise<void>;
  setScene(sceneId: string, date: Dated | null): Promise<void>;
  addEvent(e: Omit<TimelineEvent, "id">): Promise<string>;
  updateEvent(id: string, patch: Partial<Omit<TimelineEvent, "id">>): Promise<void>;
  removeEvent(id: string): Promise<void>;
  /** Grava (ou apaga, com null) a definição de um calendário do mundo. */
  setCalendar(noteId: string, def: CalendarDef | null): Promise<void>;
  /** Escolhe o calendário que a linha do tempo usa (null = "Dia N"). */
  setActiveCalendar(noteId: string | null): Promise<void>;
  /** Troca a linha do tempo inteira (datas de teste). */
  replace(data: TimelineData): Promise<void>;
  /** Dia da história em que o personagem nasceu (null tira). */
  setBirth(noteId: string, day: number | null): Promise<void>;
  /** Tempo de viagem entre dois lugares (null tira). */
  setTravelTime(a: string, b: string, days: number | null): Promise<void>;
  /** Onde se passa uma cena (com ou sem data); null volta ao lugar deduzido do texto. */
  setScenePlace(sceneId: string, placeId: string | null): Promise<void>;
  /** Local e "ignorar avisos" de uma cena com data. */
  setSceneMeta(sceneId: string, patch: { place?: string | null; ignore?: boolean }): Promise<void>;
}

export const useTimeline = create<TimelineState>((set, get) => {
  const save = async (data: TimelineData) => {
    set({ data });
    const fs = useApp.getState().session?.fs;
    if (fs) await serial(() => writeTimeline(fs, data));
  };
  return {
    root: null,
    data: EMPTY_TIMELINE,
    async load() {
      const session = useApp.getState().session;
      if (!session) return;
      if (get().root !== session.root) set({ root: session.root, data: EMPTY_TIMELINE });
      const data = await serial(() => readTimeline(session.fs));
      if (useApp.getState().session?.root === session.root) set({ data });
    },
    async setScene(sceneId, date) {
      const scenes = { ...get().data.scenes };
      // Mudar o dia não apaga o local nem o "ignorar avisos" da cena.
      if (date) scenes[sceneId] = { ...scenes[sceneId], ...date };
      else delete scenes[sceneId];
      await save({ ...get().data, scenes });
    },
    async addEvent(e) {
      const id = crypto.randomUUID();
      await save({ ...get().data, events: [...get().data.events, { ...e, id }] });
      return id;
    },
    async updateEvent(id, patch) {
      await save({
        ...get().data,
        events: get().data.events.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      });
    },
    async removeEvent(id) {
      await save({ ...get().data, events: get().data.events.filter((e) => e.id !== id) });
    },
    async setCalendar(noteId, def) {
      const calendars = { ...get().data.calendars };
      if (def) calendars[noteId] = def;
      else delete calendars[noteId];
      const active = get().data.activeCalendar;
      await save({
        ...get().data,
        calendars,
        activeCalendar: active && calendars[active] ? active : def ? noteId : null,
      });
    },
    async replace(data) {
      await save(data);
    },
    async setActiveCalendar(noteId) {
      await save({ ...get().data, activeCalendar: noteId });
    },
    async setBirth(noteId, day) {
      const births = { ...get().data.births };
      if (day === null) delete births[noteId];
      else births[noteId] = day;
      await save({ ...get().data, births });
    },
    async setTravelTime(a, b, days) {
      await save({ ...get().data, travel: setTravel(get().data.travel, a, b, days) });
    },
    async setScenePlace(sceneId, placeId) {
      const data = get().data;
      const places = { ...data.places };
      if (placeId) places[sceneId] = placeId;
      else delete places[sceneId];
      // Cena com data: o local fica também na data (é o que a linha do tempo mostra).
      const scenes = { ...data.scenes };
      const cur = scenes[sceneId];
      if (cur) {
        const next = { ...cur };
        if (placeId) next.place = placeId;
        else delete next.place;
        scenes[sceneId] = next;
      }
      await save({ ...data, scenes, places });
    },
    async setSceneMeta(sceneId, patch) {
      const cur = get().data.scenes[sceneId];
      if (!cur) return;
      const next = { ...cur };
      if (patch.place !== undefined) {
        if (patch.place) next.place = patch.place;
        else delete next.place;
      }
      if (patch.ignore !== undefined) {
        if (patch.ignore) next.ignore = true;
        else delete next.ignore;
      }
      await save({ ...get().data, scenes: { ...get().data.scenes, [sceneId]: next } });
    },
  };
});
