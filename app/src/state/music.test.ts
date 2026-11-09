import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { PLAYLISTS } from "../music/library";
import { makeOrder, parseMusicLink } from "./music";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("parseMusicLink", () => {
  it("entende links e URIs do Spotify", () => {
    const s = parseMusicLink(
      "https://open.spotify.com/intl-pt/playlist/37i9dQZF1DX8NTLI2TtZa6?si=x",
    );
    expect(s?.service).toBe("spotify");
    expect(s?.kind).toBe("Playlist");
    expect(s?.embed).toBe(
      "https://open.spotify.com/embed/playlist/37i9dQZF1DX8NTLI2TtZa6?utm_source=generator&theme=0",
    );
    expect(parseMusicLink("spotify:album:1A2GTWGtFfWp7KSQTwWOyo")?.kind).toBe("Álbum");
  });

  it("entende YouTube Music e YouTube", () => {
    expect(parseMusicLink("https://music.youtube.com/playlist?list=PLabc_123")?.embed).toBe(
      "https://www.youtube.com/embed/videoseries?list=PLabc_123",
    );
    const v = parseMusicLink("music.youtube.com/watch?v=dQw4w9WgXcQ&list=RDAMVM1");
    expect(v?.service).toBe("youtube");
    expect(v?.embed).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ?list=RDAMVM1");
    expect(parseMusicLink("https://youtu.be/dQw4w9WgXcQ")?.kind).toBe("Faixa");
  });

  it("recusa o que não é desses serviços", () => {
    expect(parseMusicLink("https://example.com/playlist?list=1")).toBeNull();
    expect(parseMusicLink("https://open.spotify.com/user/abc")).toBeNull();
    expect(parseMusicLink("não é link")).toBeNull();
  });
});

describe("makeOrder", () => {
  it("em sequência, começa na faixa pedida e dá a volta", () => {
    expect(makeOrder(5, 2, false)).toEqual([2, 3, 4, 0, 1]);
  });

  it("aleatória, começa na faixa pedida e toca todas uma vez", () => {
    const o = makeOrder(8, 5, true);
    expect(o[0]).toBe(5);
    expect([...o].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});

describe("biblioteca embutida", () => {
  it("tem as playlists por estilo, e cada faixa tem arquivo de verdade", () => {
    expect(PLAYLISTS.map((p) => p.id)).toEqual([
      "barroco",
      "piano",
      "lofi",
      "cinematica",
      "ambiente",
      "chill",
      "foco",
      "ruido-marrom",
      "chuva",
      "natureza",
    ]);
    const ids = new Set<string>();
    for (const p of PLAYLISTS) {
      expect(p.tracks.length).toBeGreaterThan(0);
      for (const t of p.tracks) {
        expect(ids.has(t.id)).toBe(false);
        ids.add(t.id);
        expect(t.src.endsWith(`music/${t.id}.mp3`)).toBe(true);
        const path = join(root, "public", "music", `${t.id}.mp3`);
        expect(existsSync(path)).toBe(true);
        // Um MP3 de verdade (quadro MPEG ou ID3 no começo), com pelo menos ~20 s.
        const head = readFileSync(path).subarray(0, 3);
        expect(head[0] === 0xff || head.toString("latin1") === "ID3").toBe(true);
        expect(statSync(path).size).toBeGreaterThan(200_000);
        expect(t.title.trim()).toBeTruthy();
        expect(t.by.trim()).toBeTruthy();
        expect(t.license).toBeTruthy();
      }
    }
  });

  it("marca os sons contínuos para repetir sem emenda", () => {
    for (const id of ["ruido-marrom", "chuva", "natureza"])
      expect(PLAYLISTS.find((p) => p.id === id)!.tracks.every((t) => t.loop)).toBe(true);
    for (const id of ["barroco", "piano", "lofi", "cinematica", "ambiente", "chill", "foco"])
      expect(PLAYLISTS.find((p) => p.id === id)!.tracks.some((t) => t.loop)).toBe(false);
  });
});

describe("preferências salvas", () => {
  it("leva o link da versão anterior para a conta do serviço certo", async () => {
    const old = {
      source: { url: "https://open.spotify.com/playlist/37i9dQZF1DX8NTLI2TtZa6" },
      recent: [{ url: "https://music.youtube.com/playlist?list=PLabc" }],
    };
    const store = new Map([["talia.music", JSON.stringify(old)]]);
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    vi.resetModules();
    const { useMusic } = await import("./music");
    const s = useMusic.getState();
    expect(s.links.spotify?.service).toBe("spotify");
    expect(s.links.youtube?.embed).toContain("videoseries?list=PLabc");
    expect(s.active).toBeNull(); // nada toca sozinho ao abrir
    expect(s.prefs.showInSidebar).toBe(true);
    vi.unstubAllGlobals();
  });
});
