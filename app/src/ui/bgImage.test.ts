import { describe, expect, it } from "vitest";
import { cssUrl, looksLikeImageUrl } from "./bgImage";

describe("imagem de fundo", () => {
  it("reconhece endereços que dá para baixar", () => {
    expect(looksLikeImageUrl("https://site.com/a.jpg")).toBe(true);
    expect(looksLikeImageUrl("  http://site.com/a?x=1  ")).toBe(true);
    expect(looksLikeImageUrl("data:image/png;base64,AAAA")).toBe(true);
    expect(looksLikeImageUrl("file:///c:/a.png")).toBe(false);
    expect(looksLikeImageUrl("javascript:alert(1)")).toBe(false);
    expect(looksLikeImageUrl("um texto qualquer")).toBe(false);
    expect(looksLikeImageUrl("https://site.com/a b.jpg")).toBe(false);
  });

  it("escapa o endereço dentro de url() do CSS", () => {
    expect(cssUrl("data:image/jpeg;base64,AB")).toBe('url("data:image/jpeg;base64,AB")');
    expect(cssUrl('x");background:red;("')).toBe('url("x%22);background:red;(%22")');
    expect(cssUrl("a\\b\nc")).toBe('url("a%5Cb%0Ac")');
  });
});
