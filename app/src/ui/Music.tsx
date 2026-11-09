import { useEffect, useLayoutEffect, useRef, type CSSProperties } from "react";
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

/** Toca alguma coisa agora (biblioteca tocando ou serviço externo ativo)? */
export const useMusicLive = () =>
  useMusic(
    (s) =>
      (s.active === "library" && s.playing) || s.active === "spotify" || s.active === "youtube",
  );

/** Escolha da fonte: a biblioteca embutida ou as contas vinculadas. */
function Sources() {
  const active = useMusic((s) => s.active);
  const links = useMusic((s) => s.links);
  const playLibrary = useMusic((s) => s.playLibrary);
  const playService = useMusic((s) => s.playService);
  const linked = (Object.keys(links) as MusicService[]).filter((k) => links[k]);
  const external = active && active !== "library" ? active : null;
  if (!linked.length) return null;
  return (
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
  );
}

/**
 * O player compacto, para a barra lateral e o cartão do editor: o que está
 * tocando e os controles. As playlists ficam no Rádio, que este botão abre.
 */
export function MusicPlayer({ onSettings }: { onSettings?: () => void }) {
  const active = useMusic((s) => s.active);
  const setRadioOpen = useMusic((s) => s.setRadioOpen);
  const linked = useMusic((s) => !!(s.links.spotify || s.links.youtube));
  const external = active && active !== "library" ? active : null;
  return (
    <div className="mplayer compact">
      {external ? (
        <p className="mplayer-note">
          Tocando pelo {SERVICE_LABEL[external]}. Os controles ficam no player do serviço, dentro do
          Rádio.
        </p>
      ) : (
        <NowPlaying />
      )}
      <div className="mplayer-foot">
        <button type="button" className="mplayer-radio-link" onClick={() => setRadioOpen(true)}>
          <Icon name="radio" size={15} />
          Abrir o Rádio
        </button>
        {onSettings && (
          <button type="button" className="link-btn mplayer-settings" onClick={onSettings}>
            {linked ? "Preferências" : "Vincular Spotify ou YouTube"}
          </button>
        )}
      </div>
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

/** Faixa atual, posição e controles da biblioteca. `large` é a versão do Rádio. */
function NowPlaying({ large = false }: { large?: boolean }) {
  const s = useMusic();
  const track = current(s);
  const list = currentPlaylist(s);
  const isLoop = !!track?.loop && s.prefs.ambientLoop;
  const live = s.active === "library";

  return (
    <div className={"mplayer-lib" + (large ? " large" : "")}>
      <div className="mplayer-now" aria-live="polite">
        <Cover list={list} size={large ? 72 : 40} />
        <div className="mplayer-now-text">
          {large && <span className="mplayer-kicker">{track ? "Tocando agora" : "Rádio"}</span>}
          <b title={track?.title}>{track?.title ?? "Nada tocando"}</b>
          <small>{track ? `${list?.name} · ${track.by}` : "Escolha uma playlist no Rádio"}</small>
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
    </div>
  );
}

/** As playlists da biblioteca e, ao entrar numa, as faixas dela. */
function Playlists() {
  const s = useMusic();
  const track = current(s);
  const shown = findPlaylist(s.browsing);
  const setView = s.setBrowsing;
  const live = s.active === "library";

  if (shown)
    return (
      <div className="mplayer-tracks">
        {/* Voltar só muda a lista mostrada: a música continua de onde está. */}
        <button
          type="button"
          className="mplayer-back"
          title="Voltar às playlists (a música continua)"
          onClick={() => setView(null)}
        >
          <Icon name="back" size={15} />
          <span>Playlists</span>
        </button>
        <div className="mplayer-tracks-head">
          <Cover list={shown} size={44} />
          <span className="mplayer-tracks-title">
            <b>{shown.name}</b>
            <small>{shown.description}</small>
          </span>
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
    );

  return (
    <ul className="radio-grid" aria-label="Playlists">
      {PLAYLISTS.map((p) => {
        const on = live && s.playlistId === p.id;
        return (
          <li key={p.id}>
            <button
              type="button"
              className={"radio-card" + (on ? " on" : "")}
              title={p.description}
              onClick={() => setView(p.id)}
            >
              <Cover list={p} size={36} />
              <span className="mrow-text">
                <b>{p.name}</b>
                <small>
                  {p.tracks.length} {p.tracks.length === 1 ? "faixa" : "faixas"}
                  {on && s.playing ? " · tocando" : ""}
                </small>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Botão do Rádio, ao lado do Elo na tela inicial. */
export function RadioButton() {
  const setRadioOpen = useMusic((s) => s.setRadioOpen);
  const live = useMusicLive();
  return (
    <button
      type="button"
      className="radio-btn"
      title={live ? "Rádio (tocando)" : "Rádio: playlists e música"}
      aria-label={live ? "Abrir o Rádio (tocando)" : "Abrir o Rádio"}
      onClick={() => setRadioOpen(true)}
    >
      <Icon name="radio" size={20} />
      {live && <span className="radio-live" aria-hidden="true" />}
    </button>
  );
}

/**
 * O Rádio: a biblioteca de música livre com as playlists, o player completo e
 * as contas vinculadas. Fica montado no app inteiro (abre da tela inicial e do
 * editor) e usa o mesmo estado do player da barra: tocar aqui atualiza lá.
 */
export function RadioDialog() {
  const open = useMusic((s) => s.radioOpen);
  const setOpen = useMusic((s) => s.setRadioOpen);
  const active = useMusic((s) => s.active);
  const linked = useMusic((s) => !!(s.links.spotify || s.links.youtube));
  const external = active && active !== "library" ? active : null;
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const back = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      back?.focus?.();
    };
  }, [open, setOpen]);

  if (!open) return null;
  return (
    <div
      className="modal-backdrop radio-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      <section
        className="radio"
        role="dialog"
        aria-modal="true"
        aria-labelledby="radio-title"
        data-music-clip
      >
        <header className="radio-head">
          <span className="radio-mark" aria-hidden="true">
            <Icon name="radio" size={20} />
          </span>
          <div className="radio-title">
            <h2 id="radio-title">Rádio</h2>
            <p>Música livre para escrever, embutida no app. Toca em todas as telas.</p>
          </div>
          <button
            ref={closeBtn}
            type="button"
            className="icon-btn"
            aria-label="Fechar o Rádio (a música continua)"
            title="Fechar (a música continua)"
            onClick={() => setOpen(false)}
          >
            <Icon name="close" size={16} />
          </button>
        </header>
        <Sources />
        {external ? (
          <ExternalSlot service={external} />
        ) : (
          <div className="radio-body">
            <div className="radio-now">
              <NowPlaying large />
            </div>
            <div className="radio-lists">
              <Playlists />
            </div>
          </div>
        )}
        {!linked && (
          <p className="radio-hint">
            Também dá para tocar o Spotify ou o YouTube Music: vincule a conta em Configurações →
            Música.
          </p>
        )}
      </section>
    </div>
  );
}

/**
 * Botão de música do espaço de trabalho: abre o player compacto num cartão
 * sobre o pé da barra lateral. Fechar o cartão não para a música.
 */
export function MusicFloating({ onSettings }: { onSettings?: () => void }) {
  const open = useMusic((s) => s.floatingOpen);
  const setOpen = useMusic((s) => s.setFloatingOpen);
  const show = useMusic((s) => s.prefs.showInSidebar);
  const playing = useMusicLive();
  if (!show) return null;
  return (
    <>
      <button
        type="button"
        className={"foot-btn music-foot" + (open ? " on" : "")}
        aria-pressed={open}
        title={playing ? "Música (tocando)" : "Música"}
        onClick={() => setOpen(!open)}
      >
        <Icon name="turntable" size={18} />
        <span className="music-foot-label">Música</span>
        {playing && <span className="music-live" aria-hidden="true" />}
      </button>
      {open && (
        <section className="music-float" aria-label="Música">
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
