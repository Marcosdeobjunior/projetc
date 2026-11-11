/* Geometria 2D pequena para o mapa e a vista de rua. */

export type Pt = [number, number];

/** Gerador pseudoaleatório com semente (mulberry32): o mesmo número gera o mesmo mapa. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Semente a partir de um texto (ex.: o nome do lugar). */
export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

export function distToPolyline(p: Pt, line: Pt[]): number {
  let d = Infinity;
  for (let i = 1; i < line.length; i++) d = Math.min(d, distToSegment(p, line[i - 1]!, line[i]!));
  return d;
}

/** Retângulo girado: cantos em volta de (cx, cy), largura ao longo de `angle`. */
export function rect(cx: number, cy: number, w: number, d: number, angle: number): Pt[] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [w / 2, d / 2],
    [-w / 2, d / 2],
  ].map(([x, y]) => [cx + x! * c - y! * s, cy + x! * s + y! * c] as Pt);
}

/** Dois polígonos convexos se sobrepõem? (teorema do eixo separador) */
export function overlaps(a: Pt[], b: Pt[], margin = 0): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      const nx = q[1] - p[1];
      const ny = p[0] - q[0];
      const len = Math.hypot(nx, ny) || 1;
      let minA = Infinity,
        maxA = -Infinity,
        minB = Infinity,
        maxB = -Infinity;
      for (const v of a) {
        const d = (v[0] * nx + v[1] * ny) / len;
        minA = Math.min(minA, d);
        maxA = Math.max(maxA, d);
      }
      for (const v of b) {
        const d = (v[0] * nx + v[1] * ny) / len;
        minB = Math.min(minB, d);
        maxB = Math.max(maxB, d);
      }
      if (maxA + margin < minB || maxB + margin < minA) return false;
    }
  }
  return true;
}

export function insidePoly(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

/** Suaviza uma linha (Chaikin), mantendo as pontas. */
export function smooth(line: Pt[], passes = 2): Pt[] {
  let out = line;
  for (let k = 0; k < passes; k++) {
    const next: Pt[] = [out[0]!];
    for (let i = 0; i < out.length - 1; i++) {
      const [ax, ay] = out[i]!;
      const [bx, by] = out[i + 1]!;
      next.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25]);
      next.push([ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    next.push(out[out.length - 1]!);
    out = next;
  }
  return out;
}
