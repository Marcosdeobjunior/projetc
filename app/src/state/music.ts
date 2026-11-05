import { create } from "zustand";

/*
 * Player de música da barra lateral. Toca pelos players oficiais do Spotify e
 * do YouTube (que também toca as playlists do YouTube Music), embutidos na
 * janela: a conta usada é a que estiver logada neles.
 */

export type MusicService = "spotify" | "youtube";

export interface MusicSource {
  service: MusicService;
  /** Link que o usuário colou. */
  url: string;
  /** Endereço do player embutido. */
  embed: string;
  /** O que é: playlist, álbum, faixa… */
  kind: string;
}

export const SERVICE_LABEL: Record<MusicService, string> = {
  spotify: "Spotify",
  youtube: "YouTube Music",
};

const SPOTIFY_KINDS: Record<string, string> = {
  track: "Faixa",
  album: "Álbum",
  playlist: "Playlist",
  artist: "Artista",
  episode: "Episódio",
  show: "Podcast",
};

const ID = /^[A-Za-z0-9_-]+$/;

/** Entende um link (ou URI) do Spotify, do YouTube Music ou do YouTube. */
export function parseMusicLink(input: string): MusicSource | null {
  const text = input.trim();
  const uri = /^spotify:([a-z]+):([A-Za-z0-9]+)$/.exec(text);
  if (uri && SPOTIFY_KINDS[uri[1]!]) return spotify(text, uri[1]!, uri[2]!);

  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(text) ? text : "https://" + text);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\.|^m\./, "");
  if (host === "open.spotify.com") {
    // /intl-pt/playlist/ID, /playlist/ID, /embed/playlist/ID
    const parts = url.pathname
      .split("/")
      .filter((p) => p && !p.startsWith("intl-") && p !== "embed");
    const [kind, id] = parts;
    if (kind && id && SPOTIFY_KINDS[kind] && ID.test(id)) return spotify(text, kind, id);
    return null;
  }
  if (host === "music.youtube.com" || host === "youtube.com" || host === "youtu.be") {
    const list = url.searchParams.get("list");
    const video =
      host === "youtu.be" ? url.pathname.slice(1) : (url.searchParams.get("v") ?? undefined);
    if (video && ID.test(video)) {
      const q = list && ID.test(list) ? `?list=${list}` : "";
      return youtube(
        text,
        `https://www.youtube.com/embed/${video}${q}`,
        list ? "Playlist" : "Faixa",
      );
    }
    if (list && ID.test(list))
      return youtube(text, `https://www.youtube.com/embed/videoseries?list=${list}`, "Playlist");
  }
  return null;
}

function spotify(url: string, kind: string, id: string): MusicSource {
  return {
    service: "spotify",
    url,
    embed: `https://open.spotify.com/embed/${kind}/${id}?utm_source=generator&theme=0`,
    kind: SPOTIFY_KINDS[kind]!,
  };
}

function youtube(url: string, embed: string, kind: string): MusicSource {
  return { service: "youtube", url, embed, kind };
}

const KEY = "inkflow.music";

interface Saved {
  source: MusicSource | null;
  /** Links usados antes, para trocar rápido (o mais recente primeiro). */
  recent: MusicSource[];
}

function load(): Saved {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Saved> | null;
    // Refaz o player a partir do link: se o formato do endereço mudar, vale o novo.
    const fix = (s: MusicSource | null | undefined) => (s ? parseMusicLink(s.url) : null);
    return {
      source: fix(saved?.source),
      recent: (saved?.recent ?? []).map(fix).filter((s): s is MusicSource => !!s),
    };
  } catch {
    return { source: null, recent: [] };
  }
}

interface MusicState extends Saved {
  /** Espaço na barra lateral onde o player aparece (null: fora da tela de projetos). */
  slot: HTMLElement | null;
  /** Fora da tela de projetos, o player flutua; aqui ele pode ficar escondido. */
  floatingOpen: boolean;
  play(source: MusicSource): void;
  stop(): void;
  setSlot(el: HTMLElement | null): void;
  setFloatingOpen(open: boolean): void;
}

export const useMusic = create<MusicState>((set, get) => ({
  ...load(),
  slot: null,
  floatingOpen: false,
  play(source) {
    const recent = [source, ...get().recent.filter((r) => r.embed !== source.embed)].slice(0, 5);
    set({ source, recent });
  },
  stop() {
    set({ source: null });
  },
  setSlot(slot) {
    set({ slot });
  },
  setFloatingOpen(floatingOpen) {
    set({ floatingOpen });
  },
}));

useMusic.subscribe((s, prev) => {
  if (s.source === prev.source && s.recent === prev.recent) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ source: s.source, recent: s.recent }));
  } catch {
    // sem armazenamento: vale só nesta sessão
  }
});
