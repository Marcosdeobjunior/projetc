import { describe, expect, it } from "vitest";
import { EditorState } from "@tiptap/pm/state";
import type { DecorationSet } from "@tiptap/pm/view";
import { textSchema } from "./extensions";
import { decorate, redecorate, type LinkContext } from "./links";
import { findMentions, mentionMatcher } from "../links/links";
import { addNote, createProject } from "../manuscript/tree";

let project = createProject("x");
project = addNote(project, "personagens", "Helena").project;
const helena = project.notes[0]!.id;
const ctx: LinkContext = {
  currentId: "atual",
  resolve: (t) => (t.toLowerCase() === "helena" ? helena : null),
  mentions: (text) => findMentions(project, text, mentionMatcher(project)),
  open: () => undefined,
  createNote: async () => null,
  suggest: () => [],
};

const specs = (set: DecorationSet) =>
  set
    .find()
    .map(
      (d) =>
        `${d.from}-${d.to}:${(d as unknown as { type: { attrs: { class: string } } }).type.attrs.class}`,
    )
    .sort();

describe("marcação de links ao digitar", () => {
  it("refazer só o que mudou dá o mesmo que refazer tudo", () => {
    const para = (t: string) => textSchema.node("paragraph", null, t ? [textSchema.text(t)] : []);
    let state = EditorState.create({
      doc: textSchema.node("doc", null, [
        para("Helena chegou."),
        para("Nada aqui."),
        para("Ver [[Helena]]."),
      ]),
    });
    let set = decorate(state.doc, ctx);
    const edits = [
      (s: EditorState) => s.tr.insertText(" E [[Lugar]] e Helena", 25),
      (s: EditorState) => s.tr.delete(1, 4),
      (s: EditorState) => s.tr.split(8),
      (s: EditorState) => s.tr.insertText("Helena", 2).insertText("[[", 1),
      (s: EditorState) => s.tr.delete(10, 30),
    ];
    for (const edit of edits) {
      const tr = edit(state);
      state = state.apply(tr);
      set = redecorate(tr, set, ctx);
      expect(specs(set)).toEqual(specs(decorate(state.doc, ctx)));
    }
  });
});
