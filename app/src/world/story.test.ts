import { describe, expect, it } from "vitest";
import type { Project } from "../manuscript/types";
import { EMPTY_TIMELINE, sanitizeTimeline, type TimelineData } from "../timeline/timeline";
import { distanceKm, journey, placePositions, scenePlaces } from "./story";
import type { WorldMap } from "./worldgen";

const project: Project = {
  format: 1,
  id: "p",
  title: "Teste",
  createdAt: 0,
  updatedAt: 0,
  chapters: [
    {
      id: "c1",
      title: "Capítulo 1",
      dir: "c1",
      scenes: [
        { id: "s1", title: "Partida", file: "a.md" },
        { id: "s2", title: "Estrada", file: "b.md" },
      ],
    },
    {
      id: "c2",
      title: "Capítulo 2",
      dir: "c2",
      scenes: [{ id: "s3", title: "Chegada", file: "c.md" }],
    },
  ],
  notes: [
    { id: "ana", title: "Ana", kind: "personagens", file: "ana.md" },
    { id: "vila", title: "Vila Nova", kind: "lugares", file: "vila.md" },
    { id: "porto", title: "Porto Alto", kind: "lugares", file: "porto.md" },
  ],
};
const texts = {
  s1: "Ana saiu de Vila Nova cedo. Vila Nova ainda dormia; só Porto Alto aparecia no horizonte.",
  s2: "Ana andou o dia todo.",
  s3: "Ana chegou a Porto Alto.",
};
const map = {
  name: "M",
  options: { seed: 1, template: "continentes", land: 0.3, states: 1, burgs: 2 },
  heights: new Uint8Array(0),
  states: [],
  burgs: [
    { id: "b1", name: "Vila Nova", x: 100.5, y: 60.5, noteId: "vila" },
    { id: "b2", name: "Porto Alto", x: 110.5, y: 60.5, noteId: "porto" },
  ],
} as unknown as WorldMap;
const linksOf = new Map([
  ["s1", ["ana", "vila", "porto"]],
  ["s2", ["ana"]],
  ["s3", ["ana", "porto"]],
]);

describe("história no mapa", () => {
  it("lugar da cena: o escolhido, ou o mais citado no texto", () => {
    const pos = placePositions(map);
    const auto = scenePlaces(project, texts, EMPTY_TIMELINE, new Set(pos.keys()));
    expect(auto.map((s) => s.place)).toEqual(["vila", null, "porto"]);
    expect(auto[0]!.auto).toBe(true);
    const data: TimelineData = { ...EMPTY_TIMELINE, places: { s2: "vila" } };
    const chosen = scenePlaces(project, texts, data, new Set(pos.keys()));
    expect(chosen[1]).toMatchObject({ place: "vila", auto: false });
    // O local sem data é gravado e relido.
    expect(sanitizeTimeline(JSON.parse(JSON.stringify(data))).places).toEqual({ s2: "vila" });
  });

  it("jornada do personagem: paradas na ordem das datas, distâncias e tempo", () => {
    const pos = placePositions(map);
    const data: TimelineData = {
      ...EMPTY_TIMELINE,
      scenes: { s1: { day: 10, days: 1 }, s3: { day: 3, days: 1 } },
    };
    const scenes = scenePlaces(project, texts, data, new Set(pos.keys()));
    const j = journey("ana", scenes, linksOf, pos);
    // A chegada (dia 3) vem antes da partida (dia 10) na história.
    expect(j.stops.map((s) => s.place)).toEqual(["porto", "vila"]);
    expect(j.legs[0]!.elapsed).toBe(7);
    // 10° de longitude a ~30° de latitude: 10 × 111 km × cos(30°) ≈ 965 km.
    expect(j.km).toBeGreaterThan(930);
    expect(j.km).toBeLessThan(1000);
    expect(distanceKm({ x: 0, y: 90 }, { x: 180, y: 90 })).toBeCloseTo(20015, -2);
  });
});
