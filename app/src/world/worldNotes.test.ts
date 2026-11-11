import { describe, expect, it } from "vitest";
import { KeyValueFs, MemoryStore } from "../platform/kvFs";
import { createSampleVault } from "../vault/sample";
import { removeNote, renameNote } from "../manuscript/tree";
import { DEFAULT_OPTIONS, generateWorld, parseWorld, serializeWorld } from "./worldgen";
import { applyWorldFields, retireNotes, syncWorldNotes } from "./worldNotes";

async function setup() {
  const fs = new KeyValueFs(new MemoryStore(), "browser:teste");
  const project = await createSampleVault(fs);
  const map = generateWorld({ ...DEFAULT_OPTIONS, seed: 9, states: 3, burgs: 12 });
  return { project, map };
}

describe("mapa-múndi e Mundo", () => {
  it("cria um lugar para cada estado e cidade, e liga tudo", async () => {
    const { project, map } = await setup();
    const r = syncWorldNotes(map, project);
    expect(r.projectChanged).toBe(true);
    const lugares = r.project.notes.filter((n) => n.kind === "lugares");
    expect(lugares.length).toBe(
      project.notes.filter((n) => n.kind === "lugares").length +
        map.states.length +
        map.burgs.length,
    );
    expect(r.map.burgs.every((b) => b.noteId)).toBe(true);
    expect(r.map.states.every((s) => s.noteId)).toBe(true);
    // Rodar de novo não muda nada.
    const again = syncWorldNotes(r.map, r.project);
    expect(again.projectChanged).toBe(false);
    expect(again.mapChanged).toBe(false);
    // O noteId do estado sobrevive à gravação.
    expect(parseWorld(serializeWorld(r.map))!.states[0]!.noteId).toBe(r.map.states[0]!.noteId);
  });

  it("aproveita um lugar que já tem o mesmo nome", async () => {
    const { project, map } = await setup();
    const vila = project.notes.find((n) => n.title === "Vila Serena")!;
    const m = {
      ...map,
      burgs: map.burgs.map((b, i) => (i === 0 ? { ...b, name: "vila serena" } : b)),
    };
    const r = syncWorldNotes(m, project);
    expect(r.map.burgs[0]!.noteId).toBe(vila.id);
    expect(r.map.burgs[0]!.name).toBe("Vila Serena");
  });

  it("renomear no Mundo renomeia no mapa; apagar no Mundo tira do mapa", async () => {
    const { project, map } = await setup();
    const r = syncWorldNotes(map, project);
    const burg = r.map.burgs.find((b) => !r.map.states.some((s) => s.capital === b.id))!;
    const renamed = renameNote(r.project, burg.noteId!, "Porto Novo").project;
    const r2 = syncWorldNotes(r.map, renamed);
    expect(r2.map.burgs.find((b) => b.id === burg.id)!.name).toBe("Porto Novo");
    const removed = removeNote(r2.project, burg.noteId!).project;
    const r3 = syncWorldNotes(r2.map, removed);
    expect(r3.map.burgs.some((b) => b.id === burg.id)).toBe(false);
    // Apagar a capital tira o estado junto.
    const cap = r3.map.states[0]!;
    const capNote = r3.map.burgs.find((b) => b.id === cap.capital)!.noteId!;
    const r4 = syncWorldNotes(r3.map, removeNote(r3.project, capNote).project);
    expect(r4.map.states.some((s) => s.id === cap.id)).toBe(false);
  });

  it("preenche tipo e 'Fica em' sem apagar o que o usuário escreveu", async () => {
    const { project, map } = await setup();
    const r = syncWorldNotes(map, project);
    const cap = r.map.states[0]!;
    const other = r.map.burgs.find((b) => !r.map.states.some((s) => s.capital === b.id))!;
    const f = applyWorldFields(r.map, r.project, (id) =>
      id === other.id || id === cap.capital ? 0 : -1,
    );
    const note = (id: string) => f.project.notes.find((n) => n.id === id)!;
    expect(note(cap.noteId!).fields?.tipo).toBe("Reino");
    expect(note(r.map.burgs.find((b) => b.id === cap.capital)!.noteId!).fields?.tipo).toBe(
      "Capital",
    );
    expect(note(other.noteId!).fields).toMatchObject({ tipo: "Cidade", regiao: cap.noteId });
    // Tipo escrito pela pessoa fica.
    const custom = {
      ...f.project,
      notes: f.project.notes.map((n) =>
        n.id === other.noteId ? { ...n, fields: { ...n.fields, tipo: "Porto" } } : n,
      ),
    };
    const g = applyWorldFields(r.map, custom, () => 0);
    expect(g.project.notes.find((n) => n.id === other.noteId)!.fields?.tipo).toBe("Porto");
  });

  it("ao sair do mapa, só lugares nunca mexidos vão para a lixeira", async () => {
    const { project, map } = await setup();
    const r = syncWorldNotes(map, project);
    const [a, b] = r.map.burgs;
    const edited = {
      ...r.project,
      notes: r.project.notes.map((n) =>
        n.id === b!.noteId ? { ...n, fields: { clima: "Frio" } } : n,
      ),
    };
    const out = retireNotes(edited, [a!.noteId!, b!.noteId!], {});
    expect(out.project.notes.some((n) => n.id === a!.noteId)).toBe(false);
    expect(out.project.notes.some((n) => n.id === b!.noteId)).toBe(true);
    expect(out.ops).toHaveLength(1);
  });
});
