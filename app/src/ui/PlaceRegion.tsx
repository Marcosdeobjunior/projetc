import { useCallback, useMemo, useRef, useState } from "react";
import type { Note } from "../manuscript/types";
import { setNoteFields } from "../manuscript/tree";
import { useApp } from "../state/store";
import { hashSeed, type Pt } from "../world/geom";
import {
  defaultMapOptions,
  generateVillage,
  MAP_SIZES,
  parseMapOptions,
  type MapOptions,
  type VillageMap,
} from "../world/village";
import {
  generateEmblem,
  parseEmblemOptions,
  type EmblemKind,
  type EmblemOptions,
} from "../world/heraldry";
import { validNoteImage } from "../vault/vault";
import { PlaceMap, type Viewer } from "./PlaceMap";
import { buildScene, StreetView, walkable } from "./StreetView";
import { EmblemArt } from "./EmblemArt";
import { Icon } from "./Icon";
import { useAttachmentImage } from "./NoteProfile";
import { useWorldMap } from "../state/worldMap";
import { deriveWorld } from "../world/worldgen";
import { settlementInfo } from "../world/settlement";

/** Grava um campo da nota (o mapa e o brasão ficam em `fields`, e vão no sync). */
function useSaveField(note: Note) {
  const change = useApp((s) => s.change);
  return (key: string, value: string) =>
    void change((p) => {
      const cur = p.notes.find((n) => n.id === note.id)?.fields ?? {};
      return setNoteFields(p, note.id, { ...cur, [key]: value });
    });
}

const newSeed = () => Math.floor(Math.random() * 2 ** 32);

/** Ponto inicial da vista de rua: no centro, na rua principal, olhando ao longo dela. */
function startViewer(map: VillageMap): Viewer {
  const road = map.roads[0]!.points;
  let best = 0;
  let bestD = Infinity;
  road.forEach((p, i) => {
    const d = Math.hypot(p[0] - map.center[0], p[1] - map.center[1]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  const a = road[Math.max(0, best - 1)]!;
  const b = road[Math.min(road.length - 1, best + 1)]!;
  return { x: road[best]![0], y: road[best]![1], yaw: Math.atan2(b[1] - a[1], b[0] - a[0]) };
}

/** Mapa da região de um lugar (gerado), com a vista de rua. */
export function PlaceRegion({ note }: { note: Note }) {
  const save = useSaveField(note);
  const raw = note.fields?.mapa;
  // Cidade do mapa-múndi sem mapa próprio: usa o mesmo povoado da prévia do "Editar povoado".
  const world = useWorldMap((w) => w.map);
  const noteFields = note.fields;
  const opts = useMemo(() => {
    const own = parseMapOptions(raw);
    if (own) return own;
    const burg = world?.burgs.find((b) => b.noteId === note.id);
    if (!world || !burg) return null;
    const capital = world.states.some((s) => s.capital === burg.id);
    return settlementInfo(burg, capital, world.heights, deriveWorld(world), noteFields ?? {})
      .preview;
  }, [raw, world, note.id, noteFields]);
  const [tab, setTab] = useState<"mapa" | "rua">("mapa");
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const map = useMemo(() => (opts ? generateVillage(opts) : null), [opts]);
  const scene = useMemo(() => (map ? buildScene(map) : []), [map]);
  const onMove = useCallback((v: Viewer) => setViewer(v), []);
  const streetRef = useRef<HTMLDivElement>(null);

  const update = (o: Partial<MapOptions>) => {
    const next = { ...(opts ?? defaultMapOptions(hashSeed(note.title))), ...o };
    save("mapa", JSON.stringify(next));
    setViewer(null);
  };

  if (!opts || !map) {
    return (
      <section className="profile-card region-card">
        <h3>Mapa da região</h3>
        <div className="region-empty">
          <Icon name="globe" size={28} />
          <p>
            Gere um mapa para {note.title}: estrada, rio, casas e campos, e passeie pelas ruas na
            vista de rua.
          </p>
          <button type="button" className="btn primary sm" onClick={() => update({})}>
            Gerar mapa
          </button>
        </div>
      </section>
    );
  }

  const v = viewer ?? startViewer(map);
  const pick = (p: Pt) => {
    if (!walkable(map, p)) return;
    // Olha para o centro do lugar (ou ao longo da rua, se já estiver no centro).
    const dx = map.center[0] - p[0];
    const dy = map.center[1] - p[1];
    setViewer({ x: p[0], y: p[1], yaw: Math.hypot(dx, dy) > 8 ? Math.atan2(dy, dx) : v.yaw });
    setTab("rua");
    requestAnimationFrame(() => streetRef.current?.querySelector("canvas")?.focus());
  };

  return (
    <section className="profile-card region-card">
      <div className="region-head">
        <h3>Mapa da região</h3>
        <div className="region-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "mapa"}
            onClick={() => setTab("mapa")}
          >
            Mapa
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "rua"}
            onClick={() => {
              setTab("rua");
              requestAnimationFrame(() => streetRef.current?.querySelector("canvas")?.focus());
            }}
          >
            Vista de rua
          </button>
        </div>
      </div>

      {tab === "mapa" ? (
        <>
          <PlaceMap map={map} name={note.title} viewer={viewer} onPick={pick} />
          <p className="region-hint">
            Roda do mouse aproxima, arrastar move. Clique numa rua para abrir a vista de rua ali.
          </p>
        </>
      ) : (
        <div className="region-street" ref={streetRef}>
          <StreetView map={map} scene={scene} viewer={v} onMove={onMove} />
          <div className="region-minimap" aria-hidden="true">
            <PlaceMap map={map} name={note.title} viewer={v} />
          </div>
          <p className="region-hint">
            Clique na imagem e use as setas (ou W A S D) para andar e virar; Shift corre; arraste
            para olhar em volta.
          </p>
        </div>
      )}

      <div className="region-options">
        <div className="segmented wide" role="radiogroup" aria-label="Tamanho">
          {MAP_SIZES.map((s) => (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={opts.size === s.value}
              onClick={() => update({ size: s.value })}
            >
              {s.label}
            </button>
          ))}
        </div>
        {(
          [
            ["road", "Estrada"],
            ["river", "Rio"],
            ["fields", "Campos"],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="region-check">
            <input
              type="checkbox"
              checked={opts[k]}
              onChange={(e) => update({ [k]: e.target.checked })}
            />
            {label}
          </label>
        ))}
        <button type="button" className="btn ghost sm" onClick={() => update({ seed: newSeed() })}>
          <Icon name="refresh" size={14} /> Gerar outro
        </button>
      </div>
    </section>
  );
}

/** Brasão ou bandeira do lugar/organização: gerado, ou uma imagem própria. */
export function EmblemPanel({
  note,
  attachments,
  addImage,
}: {
  note: Note;
  attachments: string[];
  addImage(file: File): Promise<string | null>;
}) {
  const save = useSaveField(note);
  const input = useRef<HTMLInputElement>(null);
  const fields = note.fields ?? {};
  // Brasão e bandeira são independentes: cada um tem a sua semente e a sua imagem.
  // `brasao.kind` só lembra qual dos dois está à vista.
  const shield = parseEmblemOptions(fields.brasao);
  const kind: EmblemKind = shield?.kind ?? "brasao";
  const imageKey = kind === "bandeira" ? "bandeiraImagem" : "brasaoImagem";
  const seed =
    kind === "bandeira"
      ? (parseEmblemOptions(fields.bandeira)?.seed ?? hashSeed(note.title + "#bandeira"))
      : (shield?.seed ?? hashSeed(note.title));
  const custom = fields[imageKey];
  const customOk =
    validNoteImage(custom) && attachments.includes(custom.slice("anexos/".length))
      ? custom
      : undefined;
  const url = useAttachmentImage(customOk);
  const emblem = useMemo(() => generateEmblem({ seed, kind }), [seed, kind]);
  const label = kind === "bandeira" ? "Bandeira" : "Brasão";
  const shieldSeed = shield?.seed ?? hashSeed(note.title);
  const setKind = (k: EmblemKind) =>
    save("brasao", JSON.stringify({ seed: shieldSeed, kind: k } satisfies EmblemOptions));
  const reroll = () =>
    kind === "bandeira"
      ? save("bandeira", JSON.stringify({ seed: newSeed(), kind: "bandeira" }))
      : save("brasao", JSON.stringify({ seed: newSeed(), kind: "brasao" }));

  return (
    <section className="emblem-panel">
      <div className="emblem-head">
        <h3>{label}</h3>
        <div className="segmented wide" role="radiogroup" aria-label="Brasão ou bandeira">
          <button
            type="button"
            role="radio"
            aria-checked={kind === "brasao"}
            onClick={() => setKind("brasao")}
          >
            Brasão
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={kind === "bandeira"}
            onClick={() => setKind("bandeira")}
          >
            Bandeira
          </button>
        </div>
      </div>
      <div className={"emblem-frame " + kind}>
        {customOk ? (
          url && <img src={url} alt={`${label} de ${note.title}`} />
        ) : (
          <EmblemArt emblem={emblem} title={note.title} />
        )}
      </div>
      <div className="profile-photo-actions">
        {!customOk && (
          <button type="button" className="btn ghost sm" onClick={reroll}>
            <Icon name="refresh" size={14} /> Gerar outro
          </button>
        )}
        <button type="button" className="btn ghost sm" onClick={() => input.current?.click()}>
          <Icon name="image" size={14} /> {customOk ? "Trocar imagem" : "Usar imagem"}
        </button>
        {customOk && (
          <button type="button" className="btn ghost sm" onClick={() => save(imageKey, "")}>
            Voltar ao gerado
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          // A chave é a da aba de agora: a imagem vale só para o brasão ou só para a bandeira.
          const key = imageKey;
          if (file) void addImage(file).then((src) => src && save(key, src));
        }}
      />
    </section>
  );
}
