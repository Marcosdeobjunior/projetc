import { useState } from "react";
import type { Note } from "../manuscript/types";
import { JOURNEY_COLORS, TRAVEL_MODES, type Journey, type ScenePlace } from "../world/story";
import type { Era } from "../world/worldgen";
import { Icon } from "./Icon";
import { Select } from "./Select";

const km = (n: number) => `${Math.round(n).toLocaleString("pt-BR")} km`;
const daysText = (n: number) => (n === 1 ? "1 dia" : `${n.toLocaleString("pt-BR")} dias`);

/**
 * "História no mapa": onde se passa cada cena (com filtro por capítulo e a
 * escolha do lugar) e o caminho dos personagens, com distâncias e tempos de
 * viagem.
 */
export function StoryPanel({
  scenes,
  places,
  characters,
  journeys,
  chosen,
  era,
  chapter,
  focusScene,
  onChapter,
  onChosen,
  onFocusScene,
  onPlace,
  onOpenScene,
}: {
  scenes: ScenePlace[];
  /** Lugares que estão no mapa (para escolher o lugar de uma cena). */
  places: Note[];
  /** Personagens que aparecem em alguma cena com lugar no mapa. */
  characters: Note[];
  journeys: Map<string, Journey>;
  chosen: string[];
  era: Era;
  chapter: string;
  focusScene: string | null;
  onChapter(id: string): void;
  onChosen(ids: string[]): void;
  onFocusScene(s: ScenePlace): void;
  onPlace(sceneId: string, placeId: string | null): void;
  onOpenScene(sceneId: string): void;
}) {
  const [tab, setTab] = useState<"cenas" | "jornadas">("cenas");
  const placeName = new Map(places.map((p) => [p.id, p.title]));
  const shown = chapter === "all" ? scenes : scenes.filter((s) => s.chapterId === chapter);
  const withPlace = scenes.filter((s) => s.place).length;
  const chapters = [...new Map(scenes.map((s) => [s.chapterId, s.chapterTitle]))];
  const modes = TRAVEL_MODES[era];
  const fastest = Math.max(...modes.map((m) => m.kmPerDay));

  return (
    <section className="profile-card story-panel">
      <h3>História no mapa</h3>
      <div className="segmented wide wm-grid-2" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "cenas"}
          aria-checked={tab === "cenas"}
          onClick={() => setTab("cenas")}
        >
          Cenas
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "jornadas"}
          aria-checked={tab === "jornadas"}
          onClick={() => setTab("jornadas")}
        >
          Jornadas
        </button>
      </div>

      {tab === "cenas" ? (
        <>
          <p className="wm-meta">
            {withPlace} de {scenes.length} cenas têm lugar no mapa. O número sobre cada cidade é
            quantas cenas se passam ali.
          </p>
          <Select
            value={chapter}
            options={[
              { value: "all", label: "Todos os capítulos" },
              ...chapters.map(([id, title]) => ({ value: id, label: title })),
            ]}
            onChange={(v) => v && onChapter(v)}
          />
          <ul className="story-scenes">
            {shown.map((s, i) => (
              <li key={s.sceneId} className={focusScene === s.sceneId ? "on" : ""}>
                {(i === 0 || shown[i - 1]!.chapterId !== s.chapterId) && chapter === "all" && (
                  <span className="story-chapter">{s.chapterTitle}</span>
                )}
                <div className="story-scene">
                  <button
                    type="button"
                    className="story-scene-title"
                    disabled={!s.place}
                    title={s.place ? "Mostrar no mapa" : "Escolha um lugar para a cena"}
                    onClick={() => onFocusScene(s)}
                  >
                    <Icon name="pin" size={13} />
                    {s.title}
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title="Abrir a cena no editor"
                    aria-label={`Abrir a cena ${s.title}`}
                    onClick={() => onOpenScene(s.sceneId)}
                  >
                    <Icon name="edit" size={13} />
                  </button>
                </div>
                <Select
                  value={s.auto || !s.place ? "" : s.place}
                  options={[
                    {
                      value: "",
                      label: s.auto
                        ? `Pelo texto: ${placeName.get(s.place!) ?? ""}`
                        : "Sem lugar (cite um lugar no texto)",
                    },
                    ...places.map((p) => ({ value: p.id, label: p.title })),
                  ]}
                  onChange={(v) => onPlace(s.sceneId, v || null)}
                />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <p className="wm-meta">
            Escolha personagens para ver o caminho deles pelas cenas (na ordem das datas da linha do
            tempo; sem data, na ordem do livro).
          </p>
          {characters.length === 0 ? (
            <p className="field-hint">
              Nenhum personagem aparece em cenas com lugar no mapa ainda. Cite o personagem e um
              lugar do mapa no texto da cena.
            </p>
          ) : (
            <ul className="story-chars">
              {characters.map((c) => {
                const j = journeys.get(c.id);
                const on = chosen.includes(c.id);
                const color = JOURNEY_COLORS[chosen.indexOf(c.id) % JOURNEY_COLORS.length];
                return (
                  <li key={c.id}>
                    <label className="region-check">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) =>
                          onChosen(
                            e.target.checked ? [...chosen, c.id] : chosen.filter((x) => x !== c.id),
                          )
                        }
                      />
                      {on && <span className="state-swatch" style={{ background: color }} />}
                      {c.title}
                      <small>
                        {j
                          ? `${j.stops.length} ${j.stops.length === 1 ? "lugar" : "lugares"} · ${km(j.km)}`
                          : "sem lugares"}
                      </small>
                    </label>
                    {on && j && j.legs.length > 0 && (
                      <ol className="story-legs">
                        <li>
                          <b>1</b> {placeName.get(j.stops[0]!.place)}{" "}
                          <small>— {j.stops[0]!.scene.title}</small>
                        </li>
                        {j.legs.map((l, i) => {
                          const tooFast = l.elapsed !== null && l.elapsed < l.km / fastest;
                          return (
                            <li key={i}>
                              <b>{i + 2}</b> {placeName.get(l.to.place)}{" "}
                              <small>— {l.to.scene.title}</small>
                              <span className="story-leg-info">
                                {km(l.km)}
                                {l.elapsed !== null &&
                                  ` · ${daysText(Math.max(0, l.elapsed))} depois`}
                                {" · "}
                                {modes
                                  .map(
                                    (m) =>
                                      `${m.label} ~${daysText(Math.max(1, Math.ceil(l.km / m.kmPerDay)))}`,
                                  )
                                  .join(", ")}
                              </span>
                              {tooFast && (
                                <span className="story-warn">
                                  Rápido demais: nem {modes[modes.length - 1]!.label} daria tempo.
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
