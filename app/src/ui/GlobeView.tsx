import { useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { COLS, ROWS } from "../world/worldgen";
import { drawWorld } from "./worldDraw";
import { GlobeCpu, type GlobeProps } from "./GlobeCpu";

/*
 * O planeta como globo, na placa de vídeo (WebGL): um shader desenha a esfera
 * com o mapa plano como textura, luz e atmosfera; nomes, cidades e
 * linhas de latitude/longitude ficam numa camada 2D por cima. O giro fica em
 * refs e é desenhado uma vez por quadro (sem re-render do React ao arrastar).
 * Sem WebGL, cai na versão em canvas 2D (`GlobeCpu`).
 */

const TEX = 4; // pixels de textura por célula
const DEG = Math.PI / 180;
const toLonLat = (x: number, y: number) =>
  [(x / COLS) * 2 * Math.PI - Math.PI, Math.PI / 2 - (y / ROWS) * Math.PI] as const;

const VERT = `
attribute vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform sampler2D tex;
uniform vec2 size;     // pixels do canvas
uniform float radius;  // raio do globo em pixels
uniform float lon0;
uniform float lat0;
const float PI = 3.14159265;


void main() {
  vec2 c = size * 0.5;
  vec2 p = (gl_FragCoord.xy - c) / radius;   // y para cima
  float r2 = dot(p, p);
  // Fundo: espaço escuro, liso (sem estrelas).
  vec3 col = mix(vec3(0.051, 0.086, 0.149), vec3(0.016, 0.027, 0.051), clamp(length(gl_FragCoord.xy - c) / max(size.x, size.y) * 1.4, 0.0, 1.0));
  if (r2 > 1.0) {
    // Atmosfera em volta do disco.
    float d = sqrt(r2);
    float a = clamp((1.14 - d) / 0.14, 0.0, 1.0);
    col = mix(col, vec3(0.47, 0.70, 1.0), a * a * 0.55);
    gl_FragColor = vec4(col, 1.0);
    return;
  }
  float z = sqrt(1.0 - r2);
  float sl = sin(lat0);
  float cl = cos(lat0);
  float lat = asin(clamp(z * sl + p.y * cl, -1.0, 1.0));
  float lon = lon0 + atan(p.x, z * cl - p.y * sl);
  vec2 uv = vec2(fract((lon + PI) / (2.0 * PI)), (PI * 0.5 - lat) / PI);
  vec3 t = texture2D(tex, uv).rgb;
  // Luz de cima à esquerda, um pouco à frente; borda azulada (atmosfera de lado).
  float light = clamp(0.35 + 0.85 * dot(vec3(p, z), normalize(vec3(-0.45, 0.5, 0.74))), 0.28, 1.15);
  float rim = pow(1.0 - z, 3.0) * 0.6;
  gl_FragColor = vec4(t * light * (1.0 - rim) + vec3(0.55, 0.75, 1.0) * rim, 1.0);
}
`;

function makeGl(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext("webgl", { antialias: false, preserveDrawingBuffer: false });
  if (!gl) return null;
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "");
    return s;
  };
  try {
    const prog = gl.createProgram()!;
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const u = (n: string) => gl.getUniformLocation(prog, n);
    return { gl, size: u("size"), radius: u("radius"), lon0: u("lon0"), lat0: u("lat0") };
  } catch {
    return null;
  }
}

export function GlobeView(p: GlobeProps) {
  const [fallback, setFallback] = useState(false);
  if (fallback) return <GlobeCpu {...p} />;
  return <GlobeGpu {...p} onFail={() => setFallback(true)} />;
}

function GlobeGpu(p: GlobeProps & { onFail(): void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const glCanvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<ReturnType<typeof makeGl>>(null);
  const size = useRef({ w: 0, h: 0 });
  const rot = useRef(
    (() => {
      const f = p.focus;
      const [lon, lat] = f ? toLonLat(f.x, f.y) : [0, 15 * DEG];
      return { lon, lat, zoom: 0.42 };
    })(),
  );
  const [spin, setSpin] = useState(false);
  const drag = useRef<{ x: number; y: number; lon: number; lat: number; moved: boolean } | null>(
    null,
  );
  const frame = useRef(0);
  // Último p (as funções de desenho são chamadas fora do render).
  const props = useRef(p);
  useEffect(() => {
    props.current = p;
  });

  // Textura: o mapa plano com rios, fronteiras e estradas (sem nomes nem cidades).
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = COLS * TEX;
    c.height = ROWS * TEX;
    drawWorld(c.getContext("2d")!, {
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
    return c;
  }, [p.map, p.derived, p.base, p.vectors, p.layers, p.capitals, p.meta]);

  const geom = () => {
    const { w, h } = size.current;
    return { R: Math.min(w, h) * rot.current.zoom, cx: w / 2, cy: h / 2 };
  };
  const project = (lon: number, lat: number) => {
    const { R, cx, cy } = geom();
    const r = rot.current;
    const dl = lon - r.lon;
    const cosc = Math.sin(r.lat) * Math.sin(lat) + Math.cos(r.lat) * Math.cos(lat) * Math.cos(dl);
    if (cosc < 0) return null;
    const x = R * Math.cos(lat) * Math.sin(dl);
    const y =
      R * (Math.cos(r.lat) * Math.sin(lat) - Math.sin(r.lat) * Math.cos(lat) * Math.cos(dl));
    return { x: cx + x, y: cy - y, depth: cosc };
  };
  const unproject = (sx: number, sy: number) => {
    const { R, cx, cy } = geom();
    const r = rot.current;
    const x = (sx - cx) / R;
    const y = -(sy - cy) / R;
    const rho = Math.hypot(x, y);
    if (rho > 1) return null;
    const c = Math.asin(rho);
    const sinc = Math.sin(c);
    const cosc = Math.cos(c);
    const lat = rho
      ? Math.asin(cosc * Math.sin(r.lat) + (y * sinc * Math.cos(r.lat)) / rho)
      : r.lat;
    const lon =
      r.lon + Math.atan2(x * sinc, rho * cosc * Math.cos(r.lat) - y * sinc * Math.sin(r.lat));
    const u = ((((lon + Math.PI) / (2 * Math.PI)) % 1) + 1) % 1;
    const v = (Math.PI / 2 - lat) / Math.PI;
    return [u * COLS, Math.max(0, Math.min(ROWS - 0.001, v * ROWS))] as const;
  };

  /** Desenha um quadro: a esfera no WebGL e os textos na camada 2D. */
  const draw = () => {
    frame.current = 0;
    const g = glRef.current;
    const o = overlay.current;
    const { w, h } = size.current;
    if (!g || !o || w < 10) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const { gl } = g;
    const W = Math.round(w * dpr);
    const H = Math.round(h * dpr);
    const c = gl.canvas as HTMLCanvasElement;
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
      o.width = W;
      o.height = H;
    }
    gl.viewport(0, 0, W, H);
    gl.uniform2f(g.size, W, H);
    gl.uniform1f(g.radius, Math.min(w, h) * rot.current.zoom * dpr);
    gl.uniform1f(g.lon0, rot.current.lon);
    gl.uniform1f(g.lat0, rot.current.lat);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    const q = props.current;
    const ctx = o.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    // Linhas de latitude e longitude.
    ctx.strokeStyle = "rgba(255,255,255,0.13)";
    ctx.lineWidth = 0.8;
    const line = (pts: [number, number][]) => {
      ctx.beginPath();
      let pen = false;
      for (const [lon, lat] of pts) {
        const s = project(lon, lat);
        if (!s) {
          pen = false;
          continue;
        }
        if (pen) ctx.lineTo(s.x, s.y);
        else ctx.moveTo(s.x, s.y);
        pen = true;
      }
      ctx.stroke();
    };
    for (let lat = -60; lat <= 60; lat += 30)
      line(Array.from({ length: 73 }, (_, i) => [(i * 5 - 180) * DEG, lat * DEG]));
    for (let lon = -180; lon < 180; lon += 30)
      line(Array.from({ length: 37 }, (_, i) => [lon * DEG, (i * 5 - 90) * DEG]));
    if (q.layers.rotulos) {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      q.map.states.forEach((s, k) => {
        const l = q.vectors.labels[k];
        if (!l) return;
        const pt = project(...toLonLat(l.x, l.y));
        if (!pt || pt.depth < 0.25) return;
        ctx.globalAlpha = Math.min(1, (pt.depth - 0.25) * 3);
        ctx.font = `600 ${Math.round(11 + Math.sqrt(l.area) * 0.12 * rot.current.zoom * 2)}px Georgia, serif`;
        const text = s.name.toUpperCase().split("").join(" ");
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(245,238,220,0.75)";
        ctx.strokeText(text, pt.x, pt.y);
        ctx.fillStyle = "#2e2222";
        ctx.fillText(text, pt.x, pt.y);
      });
      ctx.globalAlpha = 1;
    }
    if (q.layers.cidades) {
      for (const b of q.map.burgs) {
        const pt = project(...toLonLat(b.x, b.y));
        if (!pt || pt.depth < 0.08) continue;
        const cap = q.capitals.has(b.id);
        const sel = q.selectedBurg === b.id;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, cap ? 4 : 2.6, 0, Math.PI * 2);
        ctx.fillStyle = cap ? "#2b2a26" : "#fffaf0";
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = cap ? "#fffaf0" : "#2b2a26";
        ctx.stroke();
        if (sel) {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 10, 0, Math.PI * 2);
          ctx.strokeStyle = "#e0a52c";
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
        if (q.layers.rotulos && (cap || sel || rot.current.zoom > 0.9) && pt.depth > 0.3) {
          ctx.font = `${cap ? "700 12.5px" : "500 11px"} Georgia, serif`;
          ctx.textAlign = "left";
          ctx.lineWidth = 3;
          ctx.strokeStyle = "rgba(255,250,235,0.85)";
          ctx.strokeText(b.name, pt.x + 7, pt.y - 6);
          ctx.fillStyle = "#24201b";
          ctx.fillText(b.name, pt.x + 7, pt.y - 6);
        }
      }
    }
  };
  const request = () => {
    if (!frame.current) frame.current = requestAnimationFrame(draw);
  };

  // Liga o WebGL uma vez.
  useEffect(() => {
    const c = glCanvas.current;
    if (!c) return;
    const g = makeGl(c);
    if (!g) {
      p.onFail();
      return;
    }
    glRef.current = g;
    const el = wrap.current!;
    const ro = new ResizeObserver(() => {
      size.current = { w: el.clientWidth, h: el.clientHeight };
      request();
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Textura nova (o mapa mudou) → sobe para a placa de vídeo e redesenha.
  useEffect(() => {
    const g = glRef.current;
    if (!g) return;
    g.gl.texImage2D(g.gl.TEXTURE_2D, 0, g.gl.RGBA, g.gl.RGBA, g.gl.UNSIGNED_BYTE, texture);
    request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texture]);

  // Seleção, camadas ou nomes mudaram → só a camada 2D muda, mas redesenha tudo (é barato).
  useEffect(() => {
    request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.selectedBurg, p.layers, p.map]);

  // Gira devagar sozinho.
  useEffect(() => {
    if (!spin) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      rot.current.lon += ((now - last) / 1000) * 0.18;
      last = now;
      draw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spin]);

  const onDown = (e: PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      lon: rot.current.lon,
      lat: rot.current.lat,
      moved: false,
    };
    setSpin(false);
  };
  const onMove = (e: PointerEvent) => {
    const r = overlay.current!.getBoundingClientRect();
    const d = drag.current;
    if (d) {
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      const { R } = geom();
      rot.current.lon = d.lon - dx / R;
      rot.current.lat = Math.max(-85 * DEG, Math.min(85 * DEG, d.lat + dy / R));
      request();
      return;
    }
    const cell = unproject(e.clientX - r.left, e.clientY - r.top);
    p.onHover(cell?.[0] ?? null, cell?.[1] ?? null);
  };
  const onUp = (e: PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) {
      const r = overlay.current!.getBoundingClientRect();
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
  const zoom = (f: number) => {
    rot.current.zoom = Math.max(0.25, Math.min(4, rot.current.zoom * f));
    request();
  };
  const onWheel = (e: WheelEvent) => zoom(e.deltaY > 0 ? 0.9 : 1.1);

  return (
    <div className="globe" ref={wrap}>
      <canvas ref={glCanvas} className="globe-gl" aria-hidden="true" />
      <canvas
        ref={overlay}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={() => p.onHover(null, null)}
        onWheel={onWheel}
        aria-label="Globo do planeta. Arraste para girar, roda do mouse para aproximar."
      />
      <div className="globe-tools">
        <button type="button" aria-label="Aproximar" onClick={() => zoom(1.25)}>
          +
        </button>
        <button type="button" aria-label="Afastar" onClick={() => zoom(1 / 1.25)}>
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
