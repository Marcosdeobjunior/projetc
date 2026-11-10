import { describe, expect, it } from "vitest";
import { KeyValueFs, MemoryStore } from "../platform/kvFs";
import { createSampleVault } from "../vault/sample";
import {
  EMPTY_TIMELINE,
  ageOn,
  buildLanes,
  continuity,
  sanitizeTimeline,
  setTravel,
  travelDays,
  type TimelineData,
} from "./timeline";

async function setup() {
  const fs = new KeyValueFs(new MemoryStore(), "browser:teste");
  const project = await createSampleVault(fs);
  const scenes = project.chapters.flatMap((c) => c.scenes.map((s) => s.id));
  const by = (kind: string) => project.notes.filter((n) => n.kind === kind).map((n) => n.id);
  const [hero] = by("personagens");
  const [vila] = by("lugares");
  // Um segundo lugar só para o teste.
  const capital = "nt_capital";
  project.notes.push({ id: capital, title: "Capital", kind: "lugares", file: "capital.md" });
  return { project, scenes, hero: hero!, vila: vila!, capital };
}

describe("continuidade", () => {
  it("idade em anos completos", () => {
    expect(ageOn(-17 * 365, 1, 365)).toBe(17);
    expect(ageOn(2, 1, 365)).toBe(-1);
    expect(ageOn(-364, 1, 365)).toBe(1);
    expect(ageOn(-363, 1, 365)).toBe(0);
  });

  it("guarda tempos de viagem nos dois sentidos", () => {
    const t = setTravel([], "a", "b", 2);
    expect(travelDays({ travel: t }, "b", "a")).toBe(2);
    expect(travelDays({ travel: setTravel(t, "b", "a", null) }, "a", "b")).toBeNull();
    const d = sanitizeTimeline({
      travel: [
        { from: "a", to: "b", days: 1 },
        { from: "b", to: "a", days: 5 },
        { from: "a", to: "a", days: 1 },
      ],
      births: { x: -100, y: 1.5 },
    });
    expect(d.travel).toEqual([{ from: "a", to: "b", days: 1 }]);
    expect(d.births).toEqual({ x: -100 });
  });

  it("mostra idades e avisa só quando a chegada é cedo demais", async () => {
    const { project, scenes, hero, vila, capital } = await setup();
    const [s1, s2, s3] = scenes;
    const linksOf = new Map<string, string[]>([
      [s1!, [hero, vila]],
      [s2!, [hero, capital]],
      [s3!, [hero, capital]],
    ]);
    const data: TimelineData = {
      ...EMPTY_TIMELINE,
      scenes: {
        [s1!]: { day: 1, days: 1 },
        [s2!]: { day: 1, days: 1 }, // chega à Capital no mesmo dia: rápido demais
        [s3!]: { day: 9, days: 1 },
      },
      births: { [hero]: -17 * 365 },
      travel: [{ from: vila, to: capital, days: 2 }],
    };
    const c = continuity({ project, data, linksOf, yearLength: 365 });
    expect(c.ages.get(s1!)).toEqual([{ noteId: hero, age: 17 }]);
    expect(c.places.get(s1!)).toEqual({ place: vila, auto: true });
    expect(c.warnings.get(s2!)).toEqual([
      { noteId: hero, from: vila, to: capital, needs: 2, had: 0, prevScene: s1 },
    ]);
    expect(c.warnings.has(s3!)).toBe(false); // mesmo lugar: nada a avisar

    // Viagem mais longa que o necessário nunca é erro.
    const slow = { ...data, scenes: { ...data.scenes, [s2!]: { day: 8, days: 1 } } };
    expect(continuity({ project, data: slow, linksOf, yearLength: 365 }).warnings.size).toBe(0);

    // O autor pode ignorar o aviso naquela cena.
    const ignored = {
      ...data,
      scenes: { ...data.scenes, [s2!]: { day: 1, days: 1, ignore: true } },
    };
    expect(continuity({ project, data: ignored, linksOf, yearLength: 365 }).warnings.size).toBe(0);

    // Sem tempo de viagem cadastrado, não há aviso (nada de adivinhar distâncias).
    const unknown = { ...data, travel: [] };
    expect(continuity({ project, data: unknown, linksOf, yearLength: 365 }).warnings.size).toBe(0);
  });

  it("o local escolhido vale mais que o deduzido do texto", async () => {
    const { project, scenes, hero, vila, capital } = await setup();
    const linksOf = new Map([[scenes[0]!, [hero, vila, capital]]]);
    const data: TimelineData = {
      ...EMPTY_TIMELINE,
      scenes: { [scenes[0]!]: { day: 1, days: 1 } },
    };
    // Dois lugares citados e nenhum escolhido: não dá para saber onde é.
    expect(continuity({ project, data, linksOf, yearLength: 365 }).places.has(scenes[0]!)).toBe(
      false,
    );
    data.scenes[scenes[0]!]!.place = capital;
    expect(continuity({ project, data, linksOf, yearLength: 365 }).places.get(scenes[0]!)).toEqual({
      place: capital,
      auto: false,
    });
  });
});

describe("faixas por personagem", () => {
  it("põe cada personagem numa linha, nos dias em que aparece", async () => {
    const { project, scenes, hero } = await setup();
    const other = project.notes.find((n) => n.kind === "personagens" && n.id !== hero)!.id;
    const linksOf = new Map([
      [scenes[0]!, [hero]],
      [scenes[1]!, [hero, other]],
    ]);
    const data: TimelineData = {
      ...EMPTY_TIMELINE,
      scenes: { [scenes[0]!]: { day: 1, days: 2 }, [scenes[1]!]: { day: 10, days: 1 } },
      events: [{ id: "e", title: "Festa", day: 5, days: 1, notes: [other] }],
    };
    const l = buildLanes(project, data, linksOf);
    expect(l.days).toEqual([1, 2, 5, 10]);
    const row = (id: string) => l.rows.find((r) => r.noteId === id)!;
    expect([...row(hero).cells.keys()]).toEqual([1, 2, 10]);
    expect(row(other).cells.get(5)).toEqual([{ id: "e", title: "Festa", kind: "event" }]);
  });
});

describe("datas fictícias de teste", () => {
  it("preenchem a linha do tempo de um jeito que mostra tudo", async () => {
    const { project } = await setup();
    const { exampleTimeline } = await import("./example");
    const data = exampleTimeline(project, EMPTY_TIMELINE);
    const scenes = project.chapters.flatMap((c) => c.scenes.map((s) => s.id));
    expect(scenes.every((id) => data.scenes[id])).toBe(true);
    expect(Object.keys(data.births).length).toBeGreaterThan(0);
    expect(data.events).toHaveLength(2);
    // A terceira cena volta no tempo.
    const { buildTimeline } = await import("./timeline");
    expect(buildTimeline(project, data).outOfOrder.size).toBe(1);
  });

  it("geram semanas de escrita com meta", async () => {
    const { exampleWriting } = await import("./example");
    const log = exampleWriting(new Date(2026, 10, 9));
    expect(log.dailyGoal).toBe(500);
    expect(Object.keys(log.days).length).toBeGreaterThan(20);
    expect(log.days["2026-11-09"]).toBeUndefined(); // hoje fica para escrever de verdade
  });
});
