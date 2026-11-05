import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { PLAYLISTS, findPlaylist, type Playlist } from "../music/library";
import {
  SERVICE_LABEL,
  current,
  currentPlaylist,
  useMusic,
  type MusicService,
} from "../state/music";
import { Icon } from "./Icon";

/** Altura do player de cada serviço externo (px). */
const HEIGHT: Record<MusicService, number> = { spotify: 152, youtube: 124 };

/**
 * Player externo (Spotify, YouTube Music). Fica montado no app inteiro (não
 * some ao abrir um projeto, então a música continua) e se posiciona por cima
 * do espaço reservado no player. Sem espaço na tela, sai da vista mas continua.
 */
export function MusicDock() {
  const active = useMusic((s) => s.active);
  const links = useMusic((s) => s.links);
  const slot = useMusic((s) => s.slot);
  const frame = useRef<HTMLDivElement>(null);
  const source = active && active !== "library" ? links[active] : null;

  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    if (!slot) {
      el.style.cssText = "left:-10000px;top:0;width:280px;height:160px;";
      return;
    }
    let raf = 0;
    let last = "";
    // Acompanha o espaço reservado (a barra rola, recolhe, vira gaveta).
    const follow = () => {
      const r = slot.getBoundingClientRect();
      const clip = slot.closest("[data-music-clip]")?.getBoundingClientRect();
      const top = clip ? Math.max(0, clip.top - r.top) : 0;
      const bottom = clip ? Math.max(0, r.bottom - clip.bottom) : 0;
      const css =
        `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;` +
        `clip-path:inset(${top}px 0 ${bottom}px 0);` +
        (r.width < 120 || r.height < 40 || top + bottom >= r.height ? "visibility:hidden;" : "");
      if (css !== last) el.style.cssText = last = css;
      raf = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(raf);
  }, [slot, source]);

  if (!source) return null;
  return (
    <div ref={frame} className="music-dock">
      <iframe
        key={source.embed}
        title={`Player do ${SERVICE_LABEL[source.service]}`}
        src={source.embed}
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}

export function formatTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

function Cover({ list, size = 40 }: { list: Playlist | undefined; size?: number }) {
  const style = { "--hue": list?.hue ?? 30, width: size, height: size } as CSSProperties;
  return (
    <span className="music-cover" style={style} aria-hidden="true">
      <Icon name={list?.icon ?? "music"} size={Math.round(size * 0.48)} />
    </span>
  );
}

/**
 * O player: fonte (biblioteca ou conta vinculada), faixa atual, controles e
 * as playlists. Só reprodução: as preferências ficam nas Configurações.
 */
export function MusicPlayer({ onSettings }: { onSettings?: () => void }) {
  const active = useMusic((s) => s.active);
  const links = useMusic((s) => s.links);
  const playLibrary = useMusic((s) => s.playLibrary);
  const playService = useMusic((s) => s.playService);
  const linked = (Object.keys(links) as MusicService[]).filter((k) => links[k]);
  const external = active && active !== "library" ? active : null;

  return (
    <div className="mplayer">
      {linked.length > 0 && (
        <div className="mplayer-sources" role="tablist" aria-label="Tocar de">
          <button
            type="button"
            role="tab"
            aria-selected={!external}
            className="mchip"
            onClick={playLibrary}
          >
            Biblioteca
          </button>
          {linked.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={external === k}
              className="mchip"
              onClick={() => playService(k)}
            >
              <span className={"music-dot " + k} aria-hidden="true" />
              {SERVICE_LABEL[k]}
            </button>
          ))}
        </div>
      )}
      {external ? <ExternalSlot service={external} /> : <Library />}
      {onSettings && (
        <button type="button" className="link-btn mplayer-settings" onClick={onSettings}>
          {linked.length ? "Preferências do player" : "Vincular Spotify ou YouTube Music"}
        </button>
      )}
    </div>
  );
}

function ExternalSlot({ service }: { service: MusicService }) {
  const source = useMusic((s) => s.links[service]);
  const setSlot = useMusic((s) => s.setSlot);
  const slot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = slot.current;
    setSlot(el);
    return () => {
      if (useMusic.getState().slot === el) setSlot(null);
    };
  }, [setSlot]);
  return (
    <div className="mplayer-external">
      <div ref={slot} className={"music-slot " + service} style={{ height: HEIGHT[service] }} />
      <p className="mplayer-note">
        {SERVICE_LABEL[service]} · {source?.kind}. Use os controles do próprio player; a conta é a
        que estiver logada nele.
      </p>
    </div>
  );
}

function Library() {
  const s = useMusic();
  const track = current(s);
  const list = currentPlaylist(s);
  const [view, setView] = useState<string | null>(null);
  const shown = findPlaylist(view);
  const isLoop = !!track?.loop && s.prefs.ambientLoop;
  const live = s.active === "library";

  return (
    <div className="mplayer-lib">
      <div className="mplayer-now" aria-live="polite">
        <Cover list={list} />
        <div className="mplayer-now-text">
          <b title={track?.title}>{track?.title ?? "Nada tocando"}</b>
          <small>{track ? `${list?.name} · ${track.by}` : "Escolha uma playlist abaixo"}</small>
        </div>
      </div>

      <div className="mplayer-progress">
        <input
          type="range"
          min={0}
          max={Math.max(1, s.duration)}
          step={0.5}
          value={live ? Math.min(s.time, s.duration || 0) : 0}
          disabled={!live || !s.duration}
          aria-label="Posição na faixa"
          aria-valuetext={`${formatTime(s.time)} de ${formatTime(s.duration)}`}
          onChange={(e) => s.seek(Number(e.target.value))}
          style={{ "--p": `${s.duration ? (s.time / s.duration) * 100 : 0}%` } as CSSProperties}
        />
        <span className="mplayer-times">
          <span>{formatTime(live ? s.time : 0)}</span>
          <span>{isLoop ? "contínuo" : formatTime(s.duration)}</span>
        </span>
      </div>

      <div className="mplayer-controls">
        <button
          type="button"
          className="mbtn"
          aria-label="Anterior"
          onClick={s.prev}
          disabled={!track}
        >
          <Icon name="prev" size={16} />
        </button>
        <button
          type="button"
          className="mbtn play"
          aria-label={live && s.playing ? "Pausar" : "Tocar"}
          onClick={s.toggle}
        >
          <Icon name={live && s.playing ? "pause" : "play"} size={18} />
          {live && s.loading && <span className="mspin" aria-hidden="true" />}
        </button>
        <button
          type="button"
          className="mbtn"
          aria-label="Próxima"
          onClick={s.next}
          disabled={!track}
        >
          <Icon name="next" size={16} />
        </button>
        <label className="mplayer-volume" title={`Volume ${Math.round(s.prefs.volume * 100)}%`}>
          <Icon name={s.prefs.volume === 0 ? "mute" : "volume"} size={15} />
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={s.prefs.volume}
            aria-label="Volume"
            onChange={(e) => s.setPrefs({ volume: Number(e.target.value) })}
            style={{ "--p": `${s.prefs.volume * 100}%` } as CSSProperties}
          />
        </label>
      </div>
      {s.error && (
        <p className="music-error" role="alert">
          {s.error}
        </p>
      )}

      {shown ? (
        <div className="mplayer-tracks">
          <div className="mplayer-tracks-head">
            <button
              type="button"
              className="mbtn sm"
              aria-label="Voltar às playlists"
              onClick={() => setView(null)}
            >
              <Icon name="chevron-left" size={14} />
            </button>
            <b>{shown.name}</b>
            <button
              type="button"
              className="link-btn"
              onClick={() => s.playPlaylist(shown.id)}
              title={s.prefs.shuffle ? "Tocar em ordem aleatória" : "Tocar desde o começo"}
            >
              Tocar tudo
            </button>
          </div>
          <ol className="mplayer-list">
            {shown.tracks.map((t, i) => {
              const on = live && s.playlistId === shown.id && track?.id === t.id;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    className={"mrow" + (on ? " on" : "")}
                    aria-current={on ? "true" : undefined}
                    onClick={() => (on ? s.toggle() : s.playPlaylist(shown.id, i))}
                  >
                    <span className="mrow-num" aria-hidden="true">
                      {on && s.playing ? <span className="mbars" /> : i + 1}
                    </span>
                    <span className="mrow-text">
                      <b>{t.title}</b>
                      <small>{t.by}</small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      ) : (
        <ul className="mplayer-list" aria-label="Playlists">
          {PLAYLISTS.map((p) => {
            const on = live && s.playlistId === p.id;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className={"mrow" + (on ? " on" : "")}
                  title={p.description}
                  onClick={() => setView(p.id)}
                >
                  <Cover list={p} size={28} />
                  <span className="mrow-text">
                    <b>{p.name}</b>
                    <small>
                      {p.tracks.length} {p.tracks.length === 1 ? "faixa" : "faixas"}
                      {on && s.playing ? " · tocando" : ""}
                    </small>
                  </span>
                  <Icon name="chevron" size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Botão de música do espaço de trabalho: abre o player num cartão flutuante
 * sobre o pé da barra lateral. Fechar o cartão não para a música.
 */
export function MusicFloating({ onSettings }: { onSettings?: () => void }) {
  const open = useMusic((s) => s.floatingOpen);
  const setOpen = useMusic((s) => s.setFloatingOpen);
  const show = useMusic((s) => s.prefs.showInSidebar);
  const playing = useMusic(
    (s) =>
      (s.active === "library" && s.playing) || s.active === "spotify" || s.active === "youtube",
  );
  if (!show) return null;
  return (
    <>
      <button
        type="button"
        className={"foot-btn music-foot" + (open ? " on" : "")}
        aria-pressed={open}
        aria-label="Música"
        title={playing ? "Música (tocando)" : "Música"}
        onClick={() => setOpen(!open)}
      >
        <Icon name="turntable" size={18} />
        {playing && <span className="music-live" aria-hidden="true" />}
      </button>
      {open && (
        <section className="music-float" aria-label="Música" data-music-clip>
          <div className="row-title">
            <h2 className="music-float-title">
              <Icon name="turntable" size={16} /> Música
            </h2>
            <button
              type="button"
              className="icon-btn"
              aria-label="Fechar (a música continua)"
              title="Fechar (a música continua)"
              onClick={() => setOpen(false)}
            >
              <Icon name="close" size={15} />
            </button>
          </div>
          <MusicPlayer
            onSettings={
              onSettings &&
              (() => {
                setOpen(false);
                onSettings();
              })
            }
          />
        </section>
      )}
    </>
  );
}
