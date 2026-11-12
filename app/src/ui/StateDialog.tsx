import { useMemo, useRef, useState, type PointerEvent } from "react";
import type { Note } from "../manuscript/types";
import {
  BIOMES,
  cellOf,
  COLS,
  ROWS,
  type Derived,
  type WorldMap,
  type WorldState,
} from "../world/worldgen";
import { MARKER_TYPES, type Society } from "../world/society";
import { bigNumber, cellPopulation, metres } from "../world/settlement";
import { KM_PER_CELL, type BurgMeta } from "./worldDraw";
import { PlaceFlag } from "./PlaceFlag";
import { Icon } from "./Icon";

/** Parcela de cada item (por contagem de células), dos maiores aos menores. */
function shares(counts: Map<number, number>, total: number, top = 4) {
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([k, n]) => ({ k, pct: Math.round((n / Math.max(1, total)) * 100) }))
    .filter((s) => s.pct > 0);
}

/** Barras de porcentagem (paisagens, povos, religiões). */
function Bars({ items }: { items: { label: string; pct: number; color?: string }[] }) {
  return (
    <ul className="state-bars">
      {items.map((it) => (
        <li key={it.label}>
          <span className="state-bar-label">{it.label}</span>
          <span className="state-bar">
            <i style={{ width: `${it.pct}%`, background: it.color }} />
          </span>
          <span className="state-bar-pct">{it.pct}%</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Ficha de um estado sobre o mapa-múndi: números gerais (área, população,
 * clima, relevo), povos, religiões, biomas, vizinhos, províncias, marcadores e
 * a lista das cidades.
 */
export function StateDialog({
  state,
  fullName,
  map,
  derived,
  society,
  meta,
  capitals,
  note,
  attachments,
  onClose,
  onOpenBurg,
  onOpenState,
  onOpenNote,
}: {
  state: WorldState;
  fullName: string;
  map: WorldMap;
  derived: Derived;
  society: Society;
  meta: Map<string, BurgMeta>;
  capitals: Set<string>;
  note: Note | undefined;
  attachments: string[];
  onClose(): void;
  onOpenBurg(id: string): void;
  onOpenState(id: string): void;
  onOpenNote(): void;
}) {
  const [pos, setPos] = useState({ x: 140, y: 12 });
  const [min, setMin] = useState(false);
  const [tab, setTab] = useState<"geral" | "cidades">("geral");
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const k = map.states.indexOf(state);

  const info = useMemo(() => {
    const d = derived;
    let cells = 0;
    let area = 0;
    let rural = 0;
    let tSum = 0;
    let tMin = Infinity;
    let tMax = -Infinity;
    let hMax = 0;
    let peak = -1;
    let coast = 0;
    const biomes = new Map<number, number>();
    const cults = new Map<number, number>();
    const rels = new Map<number, number>();
    const neighbours = new Map<number, number>();
    const lakes = new Set<number>();
    for (let i = 0; i < COLS * ROWS; i++) {
      if (d.owner[i] !== k) continue;
      cells++;
      const y = (i / COLS) | 0;
      area += Math.cos(((y + 0.5) / ROWS - 0.5) * Math.PI) * KM_PER_CELL * KM_PER_CELL;
      rural += cellPopulation(d, i);
      const t = d.tempC[i]!;
      tSum += t;
      tMin = Math.min(tMin, t);
      tMax = Math.max(tMax, t);
      if (map.heights[i]! > hMax) {
        hMax = map.heights[i]!;
        peak = i;
      }
      if (d.oceanDist[i]! <= 1) coast++;
      biomes.set(d.biome[i]!, (biomes.get(d.biome[i]!) ?? 0) + 1);
      if (d.culture[i]! >= 0) cults.set(d.culture[i]!, (cults.get(d.culture[i]!) ?? 0) + 1);
      const r = society.religion[i]!;
      if (r >= 0) rels.set(r, (rels.get(r) ?? 0) + 1);
      const x = i % COLS;
      for (const j of [
        y * COLS + ((x + 1) % COLS),
        y * COLS + ((x + COLS - 1) % COLS),
        i + COLS,
        i - COLS,
      ]) {
        if (j < 0 || j >= COLS * ROWS) continue;
        const o = d.owner[j]!;
        if (o >= 0 && o !== k) neighbours.set(o, (neighbours.get(o) ?? 0) + 1);
        if (d.lake[j]! >= 0) lakes.add(d.lake[j]!);
      }
    }
    let landTotal = 0;
    for (let i = 0; i < COLS * ROWS; i++) if (d.land[i]) landTotal++;
    const rivers = d.rivers.filter((r) => r.cells.some((c) => d.owner[c] === k)).length;
    const cities = map.burgs
      .filter((b) => d.owner[cellOf(b.x, b.y)] === k)
      .map((b) => ({
        b,
        pop: meta.get(b.id)?.population ?? 0,
        port: meta.get(b.id)?.port ?? false,
        capital: capitals.has(b.id),
        province: society.provinces[society.province[cellOf(b.x, b.y)]!]?.name ?? "",
      }))
      .sort((a, b) => Number(b.capital) - Number(a.capital) || b.pop - a.pop);
    const urban = cities.reduce((s, c) => s + c.pop, 0);
    const markers = society.markers.filter((m) => d.owner[cellOf(m.x, m.y)] === k);
    return {
      cells,
      area,
      landPct: Math.round((cells / Math.max(1, landTotal)) * 100),
      pop: Math.round(rural) + urban,
      urban,
      tAvg: cells ? tSum / cells : 0,
      tMin,
      tMax,
      peak: metres(hMax),
      peakCell: peak,
      coastal: coast > 0,
      biomes: shares(biomes, cells),
      cultures: shares(cults, cells, 3),
      religions: shares(rels, cells, 3),
      neighbours: [...neighbours].sort((a, b) => b[1] - a[1]).map(([o]) => o),
      rivers,
      lakes: [...lakes].map((l) => d.lakes[l]!.name),
      cities,
      provinces: society.provinces.filter((p) => p.state === k),
      markers,
    };
  }, [derived, society, map, k, meta, capitals]);

  const onDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
  };
  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (d)
      setPos({ x: Math.max(0, d.px + e.clientX - d.x), y: Math.max(0, d.py + e.clientY - d.y) });
  };
  const cap = map.burgs.find((b) => b.id === state.capital);
  const km2 = Math.round(info.area).toLocaleString("pt-BR");
  const density = info.area ? info.pop / info.area : 0;

  return (
    <div
      className="burg-dialog state-dialog"
      style={{ left: pos.x, top: pos.y }}
      role="dialog"
      aria-label={fullName}
    >
      <header
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={() => (drag.current = null)}
      >
        <h2>{fullName}</h2>
        <button
          type="button"
          aria-label={min ? "Mostrar" : "Minimizar"}
          title={min ? "Mostrar" : "Minimizar"}
          onClick={() => setMin((v) => !v)}
        >
          <Icon name={min ? "plus" : "minus"} size={14} />
        </button>
        <button type="button" aria-label="Fechar" title="Fechar" onClick={onClose}>
          <Icon name="close" size={14} />
        </button>
      </header>
      {!min && (
        <div className="burg-body">
          <div className="state-top">
            <div className="state-flag">
              <PlaceFlag note={note} attachments={attachments} title={state.name} />
            </div>
            <div className="state-id">
              <p className="state-form">
                <span className="state-swatch" style={{ background: state.color }} />
                {state.form ?? "Reino"}
              </p>
              {cap && (
                <button type="button" className="link-btn" onClick={() => onOpenBurg(cap.id)}>
                  <Icon name="pin" size={13} /> Capital: {cap.name}
                </button>
              )}
              <p className="state-sub">
                {info.coastal ? "Com litoral" : "Sem saída para o mar"} · {info.landPct}% das terras
                do mundo
              </p>
            </div>
          </div>

          <div className="region-tabs state-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "geral"}
              onClick={() => setTab("geral")}
            >
              Visão geral
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "cidades"}
              onClick={() => setTab("cidades")}
            >
              Cidades ({info.cities.length})
            </button>
          </div>

          {tab === "geral" ? (
            <>
              <dl className="wm-stats state-stats">
                <div>
                  <dd>{bigNumber(info.pop)}</dd>
                  <dt>habitantes</dt>
                </div>
                <div>
                  <dd>{km2}</dd>
                  <dt>km²</dt>
                </div>
                <div>
                  <dd>
                    {density.toLocaleString("pt-BR", {
                      maximumFractionDigits: density < 10 ? 1 : 0,
                    })}
                  </dd>
                  <dt>hab./km²</dt>
                </div>
                <div>
                  <dd>{info.provinces.length}</dd>
                  <dt>províncias</dt>
                </div>
                <div>
                  <dd>{Math.round(info.tAvg)}°C</dd>
                  <dt>
                    média ({Math.round(info.tMin)}° a {Math.round(info.tMax)}°)
                  </dt>
                </div>
                <div>
                  <dd>{info.peak.toLocaleString("pt-BR")} m</dd>
                  <dt>ponto mais alto</dt>
                </div>
                <div>
                  <dd>{info.rivers}</dd>
                  <dt>rios</dt>
                </div>
                <div>
                  <dd>{info.lakes.length}</dd>
                  <dt>lagos</dt>
                </div>
              </dl>
              <p className="state-note">
                {bigNumber(info.urban)} vivem nas {info.cities.length} cidades do mapa (
                {info.urban / Math.max(1, info.pop) < 0.01
                  ? "menos de 1%"
                  : `${Math.round((info.urban / Math.max(1, info.pop)) * 100)}%`}
                ); o resto, no campo.
              </p>

              <section className="state-block">
                <h4>Paisagens</h4>
                <Bars
                  items={info.biomes.map((s) => ({
                    label: BIOMES[s.k]?.name ?? "",
                    pct: s.pct,
                    color: BIOMES[s.k]?.color,
                  }))}
                />
              </section>
              {info.cultures.length > 0 && (
                <section className="state-block">
                  <h4>Povos</h4>
                  <Bars
                    items={info.cultures.map((s) => ({
                      label: map.cultures?.[s.k]?.name ?? "",
                      pct: s.pct,
                      color: map.cultures?.[s.k]?.color,
                    }))}
                  />
                </section>
              )}
              {info.religions.length > 0 && (
                <section className="state-block">
                  <h4>Religiões</h4>
                  <Bars
                    items={info.religions.map((s) => ({
                      label: society.religions[s.k]?.name ?? "",
                      pct: s.pct,
                      color: society.religions[s.k]?.color,
                    }))}
                  />
                </section>
              )}
              {info.neighbours.length > 0 && (
                <section className="state-block">
                  <h4>Vizinhos</h4>
                  <div className="state-chips">
                    {info.neighbours.map((o) => {
                      const s = map.states[o]!;
                      return (
                        <button key={s.id} type="button" onClick={() => onOpenState(s.id)}>
                          <span className="state-swatch" style={{ background: s.color }} />
                          {s.name}
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}
              {info.provinces.length > 0 && (
                <section className="state-block">
                  <h4>Províncias</h4>
                  <div className="state-chips">
                    {info.provinces.map((p) => (
                      <button key={p.seat} type="button" onClick={() => onOpenBurg(p.seat)}>
                        {p.name}
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {(info.lakes.length > 0 || info.markers.length > 0) && (
                <section className="state-block">
                  <h4>Lugares notáveis</h4>
                  <ul className="state-places">
                    {info.lakes.map((l) => (
                      <li key={l}>
                        <span>💧</span> {l}
                      </li>
                    ))}
                    {info.markers.map((m) => (
                      <li key={m.name} title={m.legend}>
                        <span>{MARKER_TYPES[m.type].icon}</span> {m.name}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          ) : (
            <table className="state-cities">
              <thead>
                <tr>
                  <th>Cidade</th>
                  <th>Província</th>
                  <th className="num">População</th>
                </tr>
              </thead>
              <tbody>
                {info.cities.map((c) => (
                  <tr key={c.b.id}>
                    <td>
                      <button type="button" className="link-btn" onClick={() => onOpenBurg(c.b.id)}>
                        {c.capital && <Icon name="star" size={12} />}
                        {c.b.name}
                      </button>
                      {c.port && <small> · porto</small>}
                    </td>
                    <td>{c.province}</td>
                    <td className="num">{c.pop.toLocaleString("pt-BR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <footer>
            <button type="button" className="btn ghost sm" onClick={onOpenNote}>
              <Icon name="file" size={14} /> Abrir ficha
            </button>
          </footer>
        </div>
      )}
    </div>
  );
}
