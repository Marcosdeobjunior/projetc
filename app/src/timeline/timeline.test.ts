import { describe, expect, it } from "vitest";
import { KeyValueFs, MemoryStore } from "../platform/kvFs";
import { createSampleVault } from "../vault/sample";
import {
  buildTimeline,
  gapLabel,
  readTimeline,
  sanitizeTimeline,
  writeTimeline,
  type TimelineData,
} from "./timeline";

async function sample() {
  const fs = new KeyValueFs(new MemoryStore(), "browser:teste");
  const project = await createSampleVault(fs);
  const ids = project.chapters.flatMap((c) => c.scenes.map((s) => s.id));
  return { fs, project, ids };
}

describe("linha do tempo", () => {
  it("grava e lê as datas e os eventos", async () => {
    const { fs, ids } = await sample();
    const data: TimelineData = {
      scenes: { [ids[0]!]: { day: 1, days: 1 } },
      events: [{ id: "e1", title: "O pai some", day: -2555, days: 1, notes: [] }],
    };
    await writeTimeline(fs, data);
    expect(await readTimeline(fs)).toEqual(data);
  });

  it("ignora valores inválidos sem perder o resto", () => {
    const d = sanitizeTimeline({
      scenes: { a: { day: 3 }, b: { day: "x" }, c: { day: 2.5 }, d: { day: 4, days: 0 } },
      events: [
        { id: "e", title: "ok", day: 1 },
        { id: "e", day: 2 },
        { title: "sem id", day: 1 },
      ],
    });
    expect(d.scenes).toEqual({ a: { day: 3, days: 1 }, d: { day: 4, days: 1 } });
    expect(d.events.map((e) => e.id)).toEqual(["e"]);
  });

  it("ordena pelo dia, conta o tempo entre os grupos e acha cenas fora de ordem", async () => {
    const { project, ids } = await sample();
    const [a, b, c] = ids;
    // O livro conta a, b, c; na história, c acontece antes de b (flashback).
    const data: TimelineData = {
      scenes: { [a!]: { day: 1, days: 3 }, [b!]: { day: 10, days: 1 }, [c!]: { day: 5, days: 1 } },
      events: [{ id: "e", title: "Tempestade", day: 5, days: 1, notes: [] }],
    };
    const t = buildTimeline(project, data);
    expect(t.groups.map((g) => [g.day, g.gap, g.items.map((i) => i.id)])).toEqual([
      [1, null, [a]],
      [5, 2, [c, "e"]], // a termina no dia 3; dia 5 = 2 dias depois
      [10, 5, [b]],
    ]);
    expect([...t.outOfOrder]).toEqual([c]);
    expect(t.undated).toEqual([]);
  });

  it("filtra pelo que está ligado a uma nota e lista as cenas sem data", async () => {
    const { project, ids } = await sample();
    const data: TimelineData = {
      scenes: { [ids[0]!]: { day: 1, days: 1 } },
      events: [
        { id: "x", title: "com", day: 2, days: 1, notes: ["n1"] },
        { id: "y", title: "sem", day: 3, days: 1, notes: [] },
      ],
    };
    const t = buildTimeline(project, data, { noteId: "n1", linked: new Set([ids[1]!]) });
    expect(t.groups.flatMap((g) => g.items.map((i) => i.id))).toEqual(["x"]);
    expect(t.undated.map((u) => u.id)).toEqual([ids[1]]);
  });

  it("descreve o tempo decorrido", () => {
    expect(gapLabel(-1)).toBe("ao mesmo tempo que o anterior");
    expect(gapLabel(0)).toBe("no mesmo dia");
    expect(gapLabel(1)).toBe("no dia seguinte");
    expect(gapLabel(3)).toBe("3 dias depois");
  });
});
