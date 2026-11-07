import { create } from "zustand";
import { PLAYLISTS, findPlaylist, type Playlist, type Track } from "../music/library";

/*
 * Música do app. Duas fontes, um só estado:
 *  - a biblioteca embutida (arquivos do próprio app), tocada aqui por dois
 *    elementos <audio> — o segundo serve para emendar sons contínuos;
 *  - contas vinculadas (Spotify, YouTube Music), tocadas pelos players
 *    oficiais embutidos (veja MusicDock), com a conta logada neles.
 * Tocar uma fonte para a outra. O motor vive fora dos componentes, então a
 * música continua ao trocar de tela.
 */

// ---------------------------------------------------------------- links externos

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

// ---------------------------------------------------------------- estado

export type Repeat = "off" | "all" | "one";
export type MusicActive = "library" | MusicService | null;

export interface MusicPrefs {
  /** 0 a 1. Só vale para a biblioteca (os players externos têm o próprio volume). */
  volume: number;
  shuffle: boolean;
  repeat: Repeat;
  /** Sons contínuos (chuva, ruído, natureza) repetem sem emenda até parar. */
  ambientLoop: boolean;
  /** Mostra o player na barra lateral (e o botão no espaço de trabalho). */
  showInSidebar: boolean;
}

interface Saved {
  prefs: MusicPrefs;
  links: Record<MusicService, MusicSource | null>;
  /** Última faixa da biblioteca, para retomar. */
  playlistId: string | null;
  trackId: string | null;
  /** Player aberto na barra lateral. */
  panelOpen: boolean;
}

interface MusicState extends Saved {
  active: MusicActive;
  /** Ordem de reprodução da playlist (índices das faixas). */
  order: number[];
  /** Posição em `order`. */
  pos: number;
  playing: boolean;
  loading: boolean;
  error: string | null;
  time: number;
  duration: number;
  /** Espaço na tela onde o player externo aparece (null: fora da vista). */
  slot: HTMLElement | null;
  /** Cartão do player no espaço de trabalho. */
  floatingOpen: boolean;
  /**
   * Playlist aberta na lista do player (só a navegação: não mexe no que está
   * tocando). Fica aqui, e não no componente, para o player lembrar dela ao
   * recolher a barra ou trocar de tela. null = lista de playlists.
   */
  browsing: string | null;
  /** A janela do Rádio (playlists, biblioteca e player completo) está aberta. */
  radioOpen: boolean;

  playPlaylist(playlistId: string, trackIndex?: number): void;
  toggle(): void;
  pause(): void;
  next(): void;
  prev(): void;
  seek(seconds: number): void;
  playService(service: MusicService): void;
  playLibrary(): void;
  link(source: MusicSource): void;
  unlink(service: MusicService): void;
  setPrefs(patch: Partial<MusicPrefs>): void;
  setPanelOpen(open: boolean): void;
  setSlot(el: HTMLElement | null): void;
  setFloatingOpen(open: boolean): void;
  setBrowsing(playlistId: string | null): void;
  setRadioOpen(open: boolean): void;
}

const KEY = "inkflow.music";

const DEFAULT_PREFS: MusicPrefs = {
  volume: 0.7,
  shuffle: false,
  repeat: "all",
  ambientLoop: true,
  showInSidebar: true,
};

function load(): Saved {
  const empty: Saved = {
    prefs: DEFAULT_PREFS,
    links: { spotify: null, youtube: null },
    playlistId: null,
    trackId: null,
    panelOpen: false,
  };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as
      (Partial<Saved> & { source?: MusicSource | null; recent?: MusicSource[] }) | null;
    if (!raw) return empty;
    // Refaz cada player a partir do link: se o formato do endereço mudar, vale o novo.
    const fix = (s: MusicSource | null | undefined) => (s?.url ? parseMusicLink(s.url) : null);
    const links: Saved["links"] = {
      spotify: fix(raw.links?.spotify),
      youtube: fix(raw.links?.youtube),
    };
    // Versão anterior: um link tocando e uma lista dos últimos; cada serviço fica com o seu.
    for (const s of [raw.source, ...(raw.recent ?? [])].map(fix))
      if (s && !links[s.service]) links[s.service] = s;
    const prefs = { ...DEFAULT_PREFS, ...raw.prefs };
    prefs.volume = Math.min(1, Math.max(0, Number(prefs.volume) || 0));
    if (!["off", "all", "one"].includes(prefs.repeat)) prefs.repeat = "all";
    return {
      prefs,
      links,
      playlistId: findPlaylist(raw.playlistId) ? raw.playlistId! : null,
      trackId: raw.trackId ?? null,
      panelOpen: !!raw.panelOpen,
    };
  } catch {
    return empty;
  }
}

const saved = load();
const startList = findPlaylist(saved.playlistId);
const startIndex = Math.max(0, startList?.tracks.findIndex((t) => t.id === saved.trackId) ?? 0);

export const useMusic = create<MusicState>((set, get) => ({
  ...saved,
  active: null,
  order: startList ? startList.tracks.map((_, i) => i) : [],
  pos: startIndex,
  playing: false,
  loading: false,
  error: null,
  time: 0,
  duration: 0,
  slot: null,
  floatingOpen: false,
  browsing: null,
  radioOpen: false,

  playPlaylist(playlistId, trackIndex) {
    const list = findPlaylist(playlistId);
    if (!list) return;
    const first = trackIndex ?? (get().prefs.shuffle ? randomIndex(list.tracks.length) : 0);
    const order = makeOrder(list.tracks.length, first, get().prefs.shuffle);
    set({ active: "library", playlistId, order, pos: 0, error: null });
    engine.load(list.tracks[first]!, true);
  },
  toggle() {
    const s = get();
    if (s.active !== "library") {
      // Nada carregado ainda: continua de onde parou, ou começa pela primeira playlist.
      if (current()) {
        set({ active: "library" });
        engine.load(current()!, true);
      } else s.playPlaylist(s.playlistId ?? PLAYLISTS[0]!.id);
      return;
    }
    if (s.playing) engine.pause();
    else engine.resume();
  },
  pause() {
    engine.pause();
  },
  next() {
    step(+1, true);
  },
  prev() {
    if (get().time > 3) return engine.seek(0);
    step(-1, true);
  },
  seek(seconds) {
    engine.seek(seconds);
  },
  playService(service) {
    if (!get().links[service]) return;
    engine.pause();
    set({ active: service });
  },
  playLibrary() {
    if (get().active === "library") return;
    set({ active: "library" });
    const t = current();
    if (t) engine.load(t, false);
  },
  link(source) {
    set({ links: { ...get().links, [source.service]: source } });
  },
  unlink(service) {
    const s = get();
    set({
      links: { ...s.links, [service]: null },
      ...(s.active === service ? { active: null } : {}),
    });
  },
  setPrefs(patch) {
    const prefs = { ...get().prefs, ...patch };
    set({ prefs });
    if (patch.volume !== undefined) engine.volume(prefs.volume);
    if (patch.shuffle !== undefined) {
      // Refaz a ordem mantendo a faixa atual onde está.
      const s = get();
      const list = findPlaylist(s.playlistId);
      const at = s.order[s.pos];
      if (list && at !== undefined)
        set({ order: makeOrder(list.tracks.length, at, prefs.shuffle), pos: 0 });
    }
  },
  setPanelOpen(panelOpen) {
    set({ panelOpen });
  },
  setSlot(slot) {
    set({ slot });
  },
  setFloatingOpen(floatingOpen) {
    set({ floatingOpen });
  },
  setRadioOpen(radioOpen) {
    set({ radioOpen });
  },
  setBrowsing(browsing) {
    set({ browsing: findPlaylist(browsing) ? browsing : null });
  },
}));

/** A playlist e a faixa da biblioteca que estão (ou estariam) tocando. */
export function current(s = useMusic.getState()): Track | undefined {
  const list = findPlaylist(s.playlistId);
  const i = s.order[s.pos];
  return list && i !== undefined ? list.tracks[i] : undefined;
}

export function currentPlaylist(s = useMusic.getState()): Playlist | undefined {
  return findPlaylist(s.playlistId);
}

function randomIndex(n: number) {
  return Math.floor(Math.random() * n);
}

/** Ordem de reprodução: começa em `first`; o resto em sequência ou embaralhado. */
export function makeOrder(n: number, first: number, shuffle: boolean): number[] {
  const rest = Array.from({ length: n }, (_, i) => i).filter((i) => i !== first);
  if (shuffle)
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j]!, rest[i]!];
    }
  else rest.sort((a, b) => ((a - first + n) % n) - ((b - first + n) % n));
  return [first, ...rest];
}

/**
 * Anda na playlist. `manual`: pedido pelo usuário (próxima/anterior), que
 * sempre dá a volta; no fim natural, só dá a volta com "repetir a playlist".
 */
function step(dir: 1 | -1, manual: boolean) {
  const s = useMusic.getState();
  if (!s.order.length) return;
  let pos = s.pos + dir;
  if (pos >= s.order.length || pos < 0) {
    if (!manual && s.prefs.repeat === "off") {
      engine.stop();
      return;
    }
    pos = (pos + s.order.length) % s.order.length;
  }
  useMusic.setState({ pos, active: "library" });
  engine.load(current()!, true);
}

// ---------------------------------------------------------------- motor de áudio

/** Duração da emenda dos sons contínuos (s). */
const XFADE = 4;

const engine = (() => {
  let els: [HTMLAudioElement, HTMLAudioElement] | null = null;
  let cur: 0 | 1 = 0;
  const alt = (): 0 | 1 => (cur === 0 ? 1 : 0);
  let fading: number | null = null;
  let track: Track | null = null;
  let lastTick = 0;

  const set = (patch: Partial<MusicState>) => useMusic.setState(patch);
  const vol = () => useMusic.getState().prefs.volume;
  const a = () => audio()[cur];

  function audio() {
    if (els) return els;
    els = [new Audio(), new Audio()];
    for (const el of els) {
      el.preload = "auto";
      const mine = () => el === els![cur];
      el.addEventListener("playing", () => mine() && set({ playing: true, loading: false }));
      el.addEventListener("pause", () => mine() && fading === null && set({ playing: false }));
      el.addEventListener("waiting", () => mine() && set({ loading: true }));
      el.addEventListener("canplay", () => mine() && set({ loading: false }));
      el.addEventListener("durationchange", () => mine() && set({ duration: el.duration || 0 }));
      el.addEventListener("timeupdate", () => mine() && tick(el));
      el.addEventListener("ended", () => mine() && ended());
      el.addEventListener("error", () => {
        if (!mine() || !el.getAttribute("src")) return;
        set({ playing: false, loading: false, error: "Não foi possível tocar esta faixa." });
      });
    }
    return els;
  }

  function tick(el: HTMLAudioElement) {
    const now = performance.now();
    if (now - lastTick > 250) {
      lastTick = now;
      set({ time: el.currentTime });
    }
    // Som contínuo: perto do fim, começa de novo no outro <audio> e cruza os volumes.
    const p = useMusic.getState().prefs;
    if (track?.loop && p.ambientLoop && p.repeat !== "one" && fading === null) {
      if (el.duration && el.duration - el.currentTime < XFADE + 0.3) crossfadeLoop();
    }
  }

  function crossfadeLoop() {
    const [from, to] = [audio()[cur], audio()[alt()]];
    to.src = from.src;
    to.currentTime = 0;
    to.volume = 0;
    void to.play().catch(() => undefined);
    const start = performance.now();
    cur = alt();
    fading = window.setInterval(() => {
      const k = Math.min(1, (performance.now() - start) / (XFADE * 1000));
      from.volume = vol() * Math.cos((k * Math.PI) / 2);
      to.volume = vol() * Math.sin((k * Math.PI) / 2);
      if (k >= 1) {
        from.pause();
        from.removeAttribute("src");
        from.load();
        window.clearInterval(fading!);
        fading = null;
      }
    }, 50);
  }

  function cancelFade() {
    if (fading === null) return;
    window.clearInterval(fading);
    fading = null;
    const other = audio()[alt()];
    other.pause();
    other.removeAttribute("src");
    other.load();
  }

  function ended() {
    const s = useMusic.getState();
    if (s.prefs.repeat === "one" || (track?.loop && s.prefs.ambientLoop)) {
      a().currentTime = 0;
      void a()
        .play()
        .catch(() => undefined);
      return;
    }
    step(+1, false);
  }

  function load(t: Track, play: boolean) {
    cancelFade();
    track = t;
    const el = a();
    el.src = t.src;
    el.volume = vol();
    set({
      time: 0,
      duration: 0,
      error: null,
      loading: play,
      trackId: t.id,
    });
    mediaSession(t);
    if (play) void el.play().catch(onPlayError);
  }

  function onPlayError(err: unknown) {
    // Pausado antes de começar (o usuário trocou de faixa): não é erro.
    if (err instanceof DOMException && err.name === "AbortError") return;
    set({ playing: false, loading: false, error: "Não foi possível tocar esta faixa." });
  }

  function mediaSession(t: Track) {
    if (!("mediaSession" in navigator)) return;
    const list = currentPlaylist();
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title,
      artist: t.by,
      album: list ? `Tália · ${list.name}` : "Tália",
    });
    const s = useMusic.getState();
    navigator.mediaSession.setActionHandler("play", () => engine.resume());
    navigator.mediaSession.setActionHandler("pause", () => engine.pause());
    navigator.mediaSession.setActionHandler("nexttrack", () => s.next());
    navigator.mediaSession.setActionHandler("previoustrack", () => s.prev());
  }

  return {
    load,
    resume() {
      if (!track) return;
      if (!a().getAttribute("src")) return load(track, true);
      void a().play().catch(onPlayError);
    },
    pause() {
      if (!els) return;
      cancelFade();
      a().pause();
      set({ playing: false });
    },
    stop() {
      if (!els) return;
      cancelFade();
      a().pause();
      a().currentTime = 0;
      set({ playing: false, time: 0 });
    },
    seek(seconds: number) {
      if (!els || !track) return;
      cancelFade();
      a().currentTime = Math.max(0, Math.min(seconds, a().duration || seconds));
      set({ time: a().currentTime });
    },
    volume(v: number) {
      if (!els || fading !== null) return;
      a().volume = v;
    },
  };
})();

useMusic.subscribe((s, prev) => {
  if (
    s.prefs === prev.prefs &&
    s.links === prev.links &&
    s.playlistId === prev.playlistId &&
    s.trackId === prev.trackId &&
    s.panelOpen === prev.panelOpen
  )
    return;
  const data: Saved = {
    prefs: s.prefs,
    links: s.links,
    playlistId: s.playlistId,
    trackId: s.trackId,
    panelOpen: s.panelOpen,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // sem armazenamento: vale só nesta sessão
  }
});
