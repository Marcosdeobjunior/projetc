import { create } from "zustand";
import {
  EMPTY_TIMELINE,
  readTimeline,
  writeTimeline,
  type Dated,
  type TimelineData,
  type TimelineEvent,
} from "../timeline/timeline";
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
      if (date) scenes[sceneId] = date;
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
  };
});
