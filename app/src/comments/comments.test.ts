import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { KeyValueFs, MemoryStore } from "../platform/kvFs";
import { readComments, sanitizeComments, writeComments, type Comment } from "./comments";
import { commentsPath } from "../vault/paths";

const fsFor = () => new KeyValueFs(new MemoryStore(), "browser:teste");

const sample = (id: string): Comment => ({
  id,
  text: "Reescrever",
  quote: "frio",
  from: "AAA=",
  to: "BBB=",
  createdAt: 1,
  resolved: false,
});

describe("comentários", () => {
  it("grava e lê os comentários de uma cena", async () => {
    const fs = fsFor();
    await writeComments(fs, "c1", [sample("a"), sample("b")]);
    expect((await readComments(fs, "c1")).map((c) => c.id)).toEqual(["a", "b"]);
    expect(await readComments(fs, "outra")).toEqual([]);
  });

  it("remove o arquivo quando não sobra comentário", async () => {
    const fs = fsFor();
    await writeComments(fs, "c1", [sample("a")]);
    await writeComments(fs, "c1", []);
    expect(await fs.exists(commentsPath("c1"))).toBe(false);
  });

  it("ignora arquivo danificado e entradas inválidas", async () => {
    const fs = fsFor();
    await fs.writeText(commentsPath("c1"), "{ não é json");
    expect(await readComments(fs, "c1")).toEqual([]);
    const ok = sanitizeComments({
      comments: [sample("a"), { id: "x" }, sample("a"), null, { ...sample("b"), resolved: "sim" }],
    });
    expect(ok.map((c) => [c.id, c.resolved])).toEqual([
      ["a", false],
      ["b", false],
    ]);
  });

  it("a âncora acompanha o texto editado antes do trecho", () => {
    // O mesmo mecanismo usado no editor: posições relativas do Yjs.
    const doc = new Y.Doc();
    const text = doc.getText("t");
    text.insert(0, "O vento soprava frio");
    const from = Y.createRelativePositionFromTypeIndex(text, 16);
    const to = Y.createRelativePositionFromTypeIndex(text, 20);
    const enc = (r: Y.RelativePosition) =>
      btoa(String.fromCharCode(...Y.encodeRelativePosition(r)));
    const dec = (s: string) =>
      Y.decodeRelativePosition(Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0)));
    const saved = { from: enc(from), to: enc(to) };
    text.insert(0, "Naquela manhã, ");
    const a = Y.createAbsolutePositionFromRelativePosition(dec(saved.from), doc)!.index;
    const b = Y.createAbsolutePositionFromRelativePosition(dec(saved.to), doc)!.index;
    expect(text.toString().slice(a, b)).toBe("frio");
  });
});
