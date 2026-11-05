import { useEffect, useRef, useState, type CSSProperties } from "react";

interface Props {
  front: string;
  back: string;
  spine: string;
  /** Medidas do livro (mm). */
  widthMm: number;
  heightMm: number;
  spineMm: number;
}

const VIEWS = {
  front: { y: -28, x: 8 },
  spine: { y: 62, x: 6 },
  back: { y: 152, x: 8 },
};

/** O livro em 3D (CSS): arraste para girar. */
export function Book3D({ front, back, spine, widthMm, heightMm, spineMm }: Props) {
  const [rot, setRot] = useState(VIEWS.front);
  const [spin, setSpin] = useState(false);
  const drag = useRef<{ x: number; y: number; rx: number; ry: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // O livro ocupa a altura disponível.
  useEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setScale(Math.max(0.4, Math.min((r.height * 0.62) / heightMm, (r.width * 0.5) / widthMm)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [widthMm, heightMm]);

  useEffect(() => {
    if (!spin) return;
    let frame = 0;
    const tick = () => {
      setRot((r) => ({ ...r, y: r.y + 0.35 }));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [spin]);

  const w = widthMm * scale;
  const h = heightMm * scale;
  const t = Math.max(3, spineMm * scale);
  const face = (style: CSSProperties, src?: string, cls = "") => (
    <div className={"b3d-face " + cls} style={style}>
      {src && <img src={src} alt="" draggable={false} />}
    </div>
  );

  return (
    <div
      ref={box}
      className="b3d"
      onPointerDown={(e) => {
        setSpin(false);
        drag.current = { x: e.clientX, y: e.clientY, rx: rot.x, ry: rot.y };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        setRot({
          y: d.ry + (e.clientX - d.x) * 0.45,
          x: Math.max(-35, Math.min(35, d.rx - (e.clientY - d.y) * 0.3)),
        });
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
    >
      <div className="b3d-stage">
        <div
          className="b3d-book"
          style={{ width: w, height: h, transform: `rotateX(${rot.x}deg) rotateY(${rot.y}deg)` }}
        >
          {face({ width: w, height: h, transform: `translateZ(${t / 2}px)` }, front, "front")}
          {face(
            { width: w, height: h, transform: `rotateY(180deg) translateZ(${t / 2}px)` },
            back,
            "back",
          )}
          {face(
            {
              width: t,
              height: h,
              left: (w - t) / 2,
              transform: `rotateY(-90deg) translateZ(${w / 2}px)`,
            },
            spine,
            "spine",
          )}
          {face(
            {
              width: t,
              height: h,
              left: (w - t) / 2,
              transform: `rotateY(90deg) translateZ(${w / 2 - 1}px)`,
            },
            undefined,
            "pages pages-side",
          )}
          {face(
            {
              width: w - 2,
              height: t,
              top: (h - t) / 2,
              transform: `rotateX(90deg) translateZ(${h / 2 - 1}px)`,
            },
            undefined,
            "pages pages-top",
          )}
          {face(
            {
              width: w - 2,
              height: t,
              top: (h - t) / 2,
              transform: `rotateX(-90deg) translateZ(${h / 2 - 1}px)`,
            },
            undefined,
            "pages pages-top",
          )}
        </div>
        <div className="b3d-shadow" style={{ width: w * 1.1 }} />
      </div>
      <div className="b3d-tools" onPointerDown={(e) => e.stopPropagation()}>
        {(
          [
            ["front", "Capa"],
            ["spine", "Lombada"],
            ["back", "Quarta capa"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            className="chip"
            onClick={() => {
              setSpin(false);
              setRot(VIEWS[k]);
            }}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className="chip"
          aria-pressed={spin}
          onClick={() => setSpin((s) => !s)}
        >
          Girar
        </button>
      </div>
      <p className="b3d-hint">Arraste para girar o livro</p>
    </div>
  );
}
