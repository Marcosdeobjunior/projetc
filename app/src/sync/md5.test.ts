import { describe, expect, it } from "vitest";
import { md5 } from "./md5";

const text = (s: string) => new TextEncoder().encode(s);

describe("md5", () => {
  it("bate com os valores de referência", () => {
    expect(md5(text(""))).toBe("d41d8cd98f00b204e9800998ecf8427e");
    expect(md5(text("abc"))).toBe("900150983cd24fb0d6963f7d28e17f72");
    expect(md5(text("The quick brown fox jumps over the lazy dog"))).toBe(
      "9e107d9d372bb6826bd81d3542a419d6",
    );
    // Mais de um bloco de 64 bytes e acentos (UTF-8).
    expect(md5(text("a".repeat(1000)))).toBe("cabe45dcc9ae5b66ba86600cca6b8ba8");
    expect(md5(text("João"))).toBe("b2478a4a0e4b1dc878f0bd0fb09c72f4");
  });
});
