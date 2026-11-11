import { useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { COLS, ROWS, type Derived, type WorldMap } from "../world/worldgen";
import type { buildVectors } from "../world/worldRender";
import { drawWorld, type BurgMeta, type DrawOptions } from "./worldDraw";

/*
 * O planeta como globo: projeção ortográfica feita à mão num canvas. O mapa
 * plano (equirretangular) vira uma textura; cada pixel do disco é convertido
 * em latitude/longitude e busca a cor nela, com luz e atmosfera. Nomes e
 * cidades são projetados por cima, só no lado visível.
 */

const TEX = 4; // pixels de textura por célula
const DEG = Math.PI / 180;

/** Célula (x, y) → longitude/latitude em radianos. */
const toLonLat = (x: number, y: number) =>
  [(x / COLS) * 2 * Math.PI - Math.PI, Math.PI / 2 - (y / ROWS) * Math.PI] as const;

export interface GlobeProps {
  map: WorldMap;
  derived: Derived;
  base: HTMLCanvasElement;
  vectors: ReturnType<typeof buildVectors>;
  layers: DrawOptions["layers"];
  capitals: Set<string>;
  meta: Map<string, BurgMeta>;
  selectedBurg: string | null;
  /** Clique num ponto do planeta (em células) ou numa cidade. */
  onPick(x: number, y: number): void;
  onHover(x: number | null, y: number | null): void;
  /** Centro inicial (em células), ex.: a cidade selecionada. */
  focus?: { x: number; y: number } | null;
}

export function GlobeView(p: GlobeProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // Centro da vista (longitude/latitude, em radianos) e zoom (raio relativo).
  const [rot, setRot] = useState(() => {
    const f = p.focus;
    const [lon, lat] = f ? toLonLat(f.x, f.y) : [0, 15 * DEG];
    return { lon, lat, zoom: 0.42 };
  });
  const [moving, setMoving] = useState(false);
  const table = useRef<{
    key: string;
    at: Int32Array;
    u: Float32Array;
    row: Int32Array;
    light: Float32Array;
    rim: Float32Array;
  } | null>(null);
  const [spin, setSpin] = useState(false);
  const drag = useRef<{ x: number; y: number; lon: number; lat: number; moved: boolean } | null>(
    null,
  );

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Textura: o mapa plano com rios, fronteiras e estradas (sem nomes nem cidades).
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = COLS * TEX;
    c.height = ROWS * TEX;
    const ctx = c.getContext("2d")!;
    drawWorld(ctx, {
      map: p.map,
      derived: p.derived,
      base: p.base,
      vectors: p.vectors,
      view: { s: TEX, x: 0, y: 0 },
      size: { w: c.width, h: c.height },
      layers: { ...p.layers, cidades: false, rotulos: false },
      capitals: p.capitals,
      meta: p.meta,
    });
    return new Uint32Array(ctx.getImageData(0, 0, c.width, c.height).data.buffer.slice(0));
  }, [p.map, p.derived, p.base, p.vectors, p.layers, p.capitals, p.meta]);

  // Estrelas fixas do fundo.
  const stars = useMemo(
    () =>
      Array.from({ length: 220 }, (_, i) => {
        const r = Math.sin(i * 12.9898) * 43758.5453;
        const s = Math.sin(i * 78.233) * 12543.123;
        return { x: r - Math.floor(r), y: s - Math.floor(s), a: 0.25 + ((i * 37) % 70) / 100 };
      }),
    [],
  );

  // Gira devagar sozinho.
  useEffect(() => {
    if (!spin) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setRot((r) => ({ ...r, lon: r.lon + dt * 0.18 }));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [spin]);

  const geom = () => {
    const R = Math.min(size.w, size.h) * rot.zoom;
    return { R, cx: size.w / 2, cy: size.h / 2 };
  };

  /** Longitude/latitude → tela (ou null se estiver do outro lado). */
  const project = (lon: number, lat: number) => {
    const { R, cx, cy } = geom();
    const dl = lon - rot.lon;
    const cosc =
      Math.sin(rot.lat) * Math.sin(lat) + Math.cos(rot.lat) * Math.cos(lat) * Math.cos(dl);
    if (cosc < 0) return null;
    const x = R * Math.cos(lat) * Math.sin(dl);
    const y =
      R * (Math.cos(rot.lat) * Math.sin(lat) - Math.sin(rot.lat) * Math.cos(lat) * Math.cos(dl));
    return { x: cx + x, y: cy - y, depth: cosc };
  };

  /** Tela → célula do mapa (ou null fora do planeta). */
  const unproject = (sx: number, sy: number) => {
    const { R, cx, cy } = geom();
    const x = (sx - cx) / R;
    const y = -(sy - cy) / R;
    const rho = Math.hypot(x, y);
    if (rho > 1) return null;
    const c = Math.asin(rho);
    const sinc = Math.sin(c);
    const cosc = Math.cos(c);
    const lat = rho
      ? Math.asin(cosc * Math.sin(rot.lat) + (y * sinc * Math.cos(rot.lat)) / rho)
      : rot.lat;
    const lon =
      rot.lon + Math.atan2(x * sinc, rho * cosc * Math.cos(rot.lat) - y * sinc * Math.sin(rot.lat));
    const u = ((((lon + Math.PI) / (2 * Math.PI)) % 1) + 1) % 1;
    const v = (Math.PI / 2 - lat) / Math.PI;
    return [u * COLS, Math.max(0, Math.min(ROWS - 0.001, v * ROWS))] as const;
  };

  useEffect(() => {
    const c = canvas.current;
    if (!c || size.w < 10) return;
    // Enquanto gira, desenha em meia resolução (fica fluido); parado, em resolução cheia.
    const dpr = moving || spin ? 0.5 : Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(size.w * dpr);
    const H = Math.round(size.h * dpr);
    if (c.width !== W) c.width = W;
    if (c.height !== H) c.height = H;
    const ctx = c.getContext("2d")!;
    // Espaço com estrelas.
    const bg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
    bg.addColorStop(0, "#0d1626");
    bg.addColorStop(1, "#04070d");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    for (const s of stars) {
      ctx.fillStyle = `rgba(255,255,255,${s.a})`;
      ctx.fillRect(s.x * W, s.y * H, dpr, dpr);
    }
    const R = Math.min(size.w, size.h) * rot.zoom * dpr;
    const cx = W / 2;
    const cy = H / 2;
    // Atmosfera.
    const glow = ctx.createRadialGradient(cx, cy, R * 0.96, cx, cy, R * 1.14);
    glow.addColorStop(0, "rgba(120,180,255,0.55)");
    glow.addColorStop(1, "rgba(120,180,255,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.14, 0, Math.PI * 2);
    ctx.fill();

    // Disco: cada pixel vira latitude/longitude e busca a cor na textura.
    const x0 = Math.max(0, Math.floor(cx - R));
    const y0 = Math.max(0, Math.floor(cy - R));
    const x1 = Math.min(W, Math.ceil(cx + R));
    const y1 = Math.min(H, Math.ceil(cy + R));
    const img = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
    const out = new Uint32Array(img.data.buffer);
    const TW = COLS * TEX;
    const TH = ROWS * TEX;
    // Tabela por pixel (latitude → linha da textura, longitude sem o giro, luz e borda),
    // refeita só quando muda o tamanho, o zoom ou a inclinação; girar para os lados
    // só desloca a longitude.
    const bw = x1 - x0;
    const key = `${W}x${H}:${R.toFixed(2)}:${rot.lat.toFixed(5)}`;
    let tab = table.current;
    if (!tab || tab.key !== key) {
      const sinL = Math.sin(rot.lat);
      const cosL = Math.cos(rot.lat);
      // Luz vinda de cima à esquerda, um pouco à frente.
      const lx = -0.45;
      const ly = 0.5;
      const lz = 0.74;
      const at: number[] = [];
      const us: number[] = [];
      const rows: number[] = [];
      const lights: number[] = [];
      const rims: number[] = [];
      for (let py = y0; py < y1; py++) {
        const y = -(py + 0.5 - cy) / R;
        for (let px = x0; px < x1; px++) {
          const x = (px + 0.5 - cx) / R;
          const rr = x * x + y * y;
          if (rr > 1) continue;
          const z = Math.sqrt(1 - rr);
          const lat = Math.asin(z * sinL + y * cosL);
          const lon = Math.atan2(x, z * cosL - y * sinL);
          at.push((py - y0) * bw + (px - x0));
          us.push(((lon + Math.PI) / (2 * Math.PI)) * TW);
          rows.push(Math.min(TH - 1, Math.max(0, (((Math.PI / 2 - lat) / Math.PI) * TH) | 0)) * TW);
          lights.push(Math.max(0.28, Math.min(1.15, 0.35 + 0.85 * (x * lx + y * ly + z * lz))));
          rims.push(Math.pow(1 - z, 3) * 0.6);
        }
      }
      tab = table.current = {
        key,
        at: Int32Array.from(at),
        u: Float32Array.from(us),
        row: Int32Array.from(rows),
        light: Float32Array.from(lights),
        rim: Float32Array.from(rims),
      };
    }
    const shift = (rot.lon / (2 * Math.PI)) * TW;
    const { at, u, row, light, rim } = tab;
    for (let k = 0; k < at.length; k++) {
      let tx = (u[k]! + shift) % TW;
      if (tx < 0) tx += TW;
      const col = texture[row[k]! + (tx | 0)]!;
      const l = light[k]!;
      const m = rim[k]!;
      const keep = l * (1 - m);
      const r = (col & 0xff) * keep + 140 * m;
      const g = ((col >> 8) & 0xff) * keep + 190 * m;
      const b = ((col >> 16) & 0xff) * keep + 255 * m;
      out[at[k]!] =
        0xff000000 | (Math.min(255, b) << 16) | (Math.min(255, g) << 8) | Math.min(255, r);
    }
    ctx.putImageData(img, x0, y0);

    // Linhas de latitude e longitude.
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = "rgba(255,255,255,0.13)";
    ctx.lineWidth = 0.8;
    const line = (pts: [number, number][]) => {
      ctx.beginPath();
      let pen = false;
      for (const [lon, lat] of pts) {
        const q = project(lon, lat);
        if (!q) {
          pen = false;
          continue;
        }
        if (pen) ctx.lineTo(q.x, q.y);
        else ctx.moveTo(q.x, q.y);
        pen = true;
      }
      ctx.stroke();
    };
    for (let lat = -60; lat <= 60; lat += 30)
      line(Array.from({ length: 73 }, (_, i) => [(i * 5 - 180) * DEG, lat * DEG]));
    for (let lon = -180; lon < 180; lon += 30)
      line(Array.from({ length: 37 }, (_, i) => [lon * DEG, (i * 5 - 90) * DEG]));

    // Nomes de reinos e cidades no lado visível.
    if (p.layers.rotulos) {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      p.map.states.forEach((s, k) => {
        const l = p.vectors.labels[k];
        if (!l) return;
        const q = project(...toLonLat(l.x, l.y));
        if (!q || q.depth < 0.25) return;
        ctx.globalAlpha = Math.min(1, (q.depth - 0.25) * 3);
        ctx.font = `600 ${Math.round(11 + Math.sqrt(l.area) * 0.12 * rot.zoom * 2)}px Georgia, serif`;
        const text = s.name.toUpperCase().split("").join(" ");
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(245,238,220,0.75)";
        ctx.strokeText(text, q.x, q.y);
        ctx.fillStyle = "#2e2222";
        ctx.fillText(text, q.x, q.y);
      });
      ctx.globalAlpha = 1;
    }
    if (p.layers.cidades) {
      for (const b of p.map.burgs) {
        const q = project(...toLonLat(b.x, b.y));
        if (!q || q.depth < 0.08) continue;
        const cap = p.capitals.has(b.id);
        const sel = p.selectedBurg === b.id;
        ctx.beginPath();
        ctx.arc(q.x, q.y, cap ? 4 : 2.6, 0, Math.PI * 2);
        ctx.fillStyle = cap ? "#2b2a26" : "#fffaf0";
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = cap ? "#fffaf0" : "#2b2a26";
        ctx.stroke();
        if (sel) {
          ctx.beginPath();
          ctx.arc(q.x, q.y, 10, 0, Math.PI * 2);
          ctx.strokeStyle = "#e0a52c";
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
        if (p.layers.rotulos && (cap || sel || rot.zoom > 0.9) && q.depth > 0.3) {
          ctx.font = `${cap ? "700 12.5px" : "500 11px"} Georgia, serif`;
          ctx.textAlign = "left";
          ctx.lineWidth = 3;
          ctx.strokeStyle = "rgba(255,250,235,0.85)";
          ctx.strokeText(b.name, q.x + 7, q.y - 6);
          ctx.fillStyle = "#24201b";
          ctx.fillText(b.name, q.x + 7, q.y - 6);
        }
      }
    }
    ctx.restore();
    // Só redesenha quando a vista ou o mapa mudam (não a cada movimento do mouse).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    rot,
    size,
    texture,
    moving,
    spin,
    p.layers,
    p.selectedBurg,
    p.map,
    p.capitals,
    p.vectors,
    stars,
  ]);

  const onDown = (e: PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, lon: rot.lon, lat: rot.lat, moved: false };
    setSpin(false);
  };
  const onMove = (e: PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    const d = drag.current;
    if (d) {
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) {
        d.moved = true;
        setMoving(true);
      }
      const { R } = geom();
      setRot((v) => ({
        ...v,
        lon: d.lon - dx / R,
        lat: Math.max(-85 * DEG, Math.min(85 * DEG, d.lat + dy / R)),
      }));
      return;
    }
    const cell = unproject(e.clientX - r.left, e.clientY - r.top);
    p.onHover(cell?.[0] ?? null, cell?.[1] ?? null);
  };
  const onUp = (e: PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setMoving(false);
    if (d && !d.moved) {
      const r = canvas.current!.getBoundingClientRect();
      // Cidade mais perto do clique (na tela), senão o ponto do planeta.
      let best: { x: number; y: number; d: number } | null = null;
      for (const b of p.map.burgs) {
        const q = project(...toLonLat(b.x, b.y));
        if (!q) continue;
        const dist = Math.hypot(q.x - (e.clientX - r.left), q.y - (e.clientY - r.top));
        if (dist < 9 && (!best || dist < best.d)) best = { x: b.x, y: b.y, d: dist };
      }
      if (best) return p.onPick(best.x, best.y);
      const cell = unproject(e.clientX - r.left, e.clientY - r.top);
      if (cell) p.onPick(cell[0], cell[1]);
    }
  };
  const onWheel = (e: WheelEvent) =>
    setRot((v) => ({
      ...v,
      zoom: Math.max(0.25, Math.min(4, v.zoom * (e.deltaY > 0 ? 0.9 : 1.1))),
    }));

  return (
    <div className="globe" ref={wrap}>
      <canvas
        ref={canvas}
        style={{ width: size.w, height: size.h }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={() => p.onHover(null, null)}
        onWheel={onWheel}
        aria-label="Globo do planeta. Arraste para girar, roda do mouse para aproximar."
      />
      <div className="globe-tools">
        <button
          type="button"
          aria-label="Aproximar"
          onClick={() => setRot((v) => ({ ...v, zoom: Math.min(4, v.zoom * 1.25) }))}
        >
          +
        </button>
        <button
          type="button"
          aria-label="Afastar"
          onClick={() => setRot((v) => ({ ...v, zoom: Math.max(0.25, v.zoom / 1.25) }))}
        >
          −
        </button>
        <button
          type="button"
          aria-pressed={spin}
          title={spin ? "Parar de girar" : "Girar o planeta"}
          className={spin ? "on" : ""}
          onClick={() => setSpin((v) => !v)}
        >
          ⟳
        </button>
      </div>
    </div>
  );
}
