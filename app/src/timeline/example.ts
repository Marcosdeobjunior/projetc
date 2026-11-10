import type { Project } from "../manuscript/types";
import { dateKey, type WritingLog } from "../writing/writing";
import type { TimelineData } from "./timeline";

/*
 * Datas fictícias para testar a linha do tempo e o calendário de escrita num
 * projeto qualquer (também usadas no projeto de exemplo). Nada é sorteado:
 * o mesmo projeto gera sempre as mesmas datas.
 */

const AGES = [17, 18, 45, 32, 60, 25, 9];

/**
 * Preenche a linha do tempo: as cenas ganham dias quase em ordem (uma volta
 * no tempo, para aparecer "fora de ordem"), locais alternados, idades para os
 * personagens, tempos de viagem curtos o bastante para gerar um aviso, e dois
 * acontecimentos. Mantém os calendários já definidos.
 */
export function exampleTimeline(project: Project, current: TimelineData): TimelineData {
  const scenes = project.chapters.flatMap((c) => c.scenes);
  const characters = project.notes.filter((n) => n.kind === "personagens");
  const places = project.notes.filter((n) => n.kind === "lugares");

  const data: TimelineData = {
    ...current,
    scenes: {},
    events: [],
    births: {},
    travel: [],
  };
  scenes.forEach((s, i) => {
    // 1, 3, 5… e a terceira cena volta para o dia 2 (um flashback).
    const day = i === 2 ? 2 : 1 + i * 2;
    const entry: TimelineData["scenes"][string] = { day, days: i === 0 ? 2 : 1 };
    if (places.length) entry.place = places[i % places.length]!.id;
    data.scenes[s.id] = entry;
  });
  characters.forEach((c, i) => {
    data.births[c.id] = 1 - AGES[i % AGES.length]! * 365;
  });
  for (let i = 1; i < places.length; i++)
    data.travel.push({ from: places[i - 1]!.id, to: places[i]!.id, days: 3 });

  const first = characters[0];
  const second = characters[1] ?? first;
  data.events.push({
    id: "exemplo-partida",
    title: first ? `${first.title} perde o pai de vista` : "O começo de tudo",
    day: -2555,
    days: 1,
    notes: first ? [first.id] : [],
  });
  data.events.push({
    id: "exemplo-festa",
    title: "Festa da colheita",
    day: 4,
    days: 2,
    notes: second ? [second.id] : [],
  });
  return data;
}

/** Seis semanas de escrita fictícia até ontem, com alguns dias em branco e meta de 500. */
export function exampleWriting(today: Date): WritingLog {
  const pattern = [540, 620, 410, 880, 0, 530, 350, 0, 740, 505, 1200, 90, 0, 460];
  const days: WritingLog["days"] = {};
  for (let i = 1; i <= 42; i++) {
    const words = pattern[(i - 1) % pattern.length]!;
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    if (words > 0) days[dateKey(d)] = words;
  }
  return { dailyGoal: 500, days };
}
