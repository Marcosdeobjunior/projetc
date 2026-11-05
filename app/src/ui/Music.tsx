import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SERVICE_LABEL, parseMusicLink, useMusic, type MusicSource } from "../state/music";
import { Icon } from "./Icon";

/** Altura do player de cada serviço (px). */
const HEIGHT: Record<MusicSource["service"], number> = { spotify: 152, youtube: 124 };

/**
 * O player em si. Fica montado no app inteiro (não some ao abrir um projeto,
 * então a música continua) e se posiciona por cima do espaço reservado na
 * barra lateral. Sem espaço na tela, ele sai da vista mas continua tocando.
 */
export function MusicDock() {
  const source = useMusic((s) => s.source);
  const slot = useMusic((s) => s.slot);
  const frame = useRef<HTMLDivElement>(null);

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
        (r.width < 120 || top + bottom >= r.height ? "visibility:hidden;" : "");
      if (css !== last) el.style.cssText = last = css;
      raf = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(raf);
  }, [slot]);

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

/** Espaço do player na barra lateral, com o link e os botões de trocar e desvincular. */
export function MusicPanel() {
  const source = useMusic((s) => s.source);
  const recent = useMusic((s) => s.recent);
  const play = useMusic((s) => s.play);
  const stop = useMusic((s) => s.stop);
  const setSlot = useMusic((s) => s.setSlot);
  const [changing, setChanging] = useState(false);
  const slot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!source || changing) return;
    const el = slot.current;
    setSlot(el);
    return () => {
      if (useMusic.getState().slot === el) setSlot(null);
    };
  }, [source, changing, setSlot]);

  if (!source || changing)
    return (
      <LinkForm
        recent={recent}
        onPlay={(s) => {
          play(s);
          setChanging(false);
        }}
        onCancel={source ? () => setChanging(false) : undefined}
      />
    );

  return (
    <div className="music">
      <div
        ref={slot}
        className={"music-slot " + source.service}
        style={{ height: HEIGHT[source.service] }}
      />
      <div className="music-bar">
        <span className={"music-service " + source.service}>
          {SERVICE_LABEL[source.service]} · {source.kind}
        </span>
        <button type="button" className="link-btn" onClick={() => setChanging(true)}>
          Trocar
        </button>
        <button type="button" className="link-btn" title="Desvincular e parar" onClick={stop}>
          Desvincular
        </button>
      </div>
    </div>
  );
}

function LinkForm(props: {
  recent: MusicSource[];
  onPlay(s: MusicSource): void;
  onCancel?: () => void;
}) {
  const [link, setLink] = useState("");
  const [error, setError] = useState(false);
  return (
    <form
      className="music-form"
      onSubmit={(e) => {
        e.preventDefault();
        const s = parseMusicLink(link);
        if (!s) return setError(true);
        props.onPlay(s);
      }}
    >
      <p className="music-help">
        Cole o link de uma playlist, álbum ou música do <b>Spotify</b> ou do <b>YouTube Music</b>.
      </p>
      <div className="music-input">
        <input
          type="url"
          inputMode="url"
          value={link}
          placeholder="https://open.spotify.com/playlist/…"
          aria-label="Link do Spotify ou do YouTube Music"
          aria-invalid={error}
          onChange={(e) => {
            setLink(e.target.value);
            setError(false);
          }}
        />
        <button type="submit" className="music-go" aria-label="Tocar" disabled={!link.trim()}>
          <Icon name="play" size={14} />
        </button>
      </div>
      {error && (
        <p className="music-error" role="alert">
          Esse link não é do Spotify nem do YouTube Music.
        </p>
      )}
      {props.recent.length > 0 && (
        <ul className="music-recent" aria-label="Tocadas antes">
          {props.recent.map((r) => (
            <li key={r.embed}>
              <button type="button" title={r.url} onClick={() => props.onPlay(r)}>
                <span className={"music-dot " + r.service} aria-hidden="true" />
                {SERVICE_LABEL[r.service]} · {r.kind}
              </button>
            </li>
          ))}
        </ul>
      )}
      {props.onCancel && (
        <button type="button" className="link-btn" onClick={props.onCancel}>
          Cancelar
        </button>
      )}
    </form>
  );
}

/**
 * Botão de música do espaço de trabalho: abre o player num cartão flutuante
 * sobre o pé da barra lateral. Fechar o cartão não para a música.
 */
export function MusicFloating() {
  const open = useMusic((s) => s.floatingOpen);
  const setOpen = useMusic((s) => s.setFloatingOpen);
  const playing = useMusic((s) => !!s.source);
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
        <Icon name="audio" size={17} />
        {playing && <span className="music-live" aria-hidden="true" />}
      </button>
      {open && (
        <section className="music-float panel" aria-label="Música" data-music-clip>
          <div className="row-title">
            <h2 className="kicker">Música</h2>
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
          <MusicPanel />
        </section>
      )}
    </>
  );
}
