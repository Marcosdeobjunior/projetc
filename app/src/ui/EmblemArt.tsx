import { useId } from "react";
import type { Charge, Emblem } from "../world/heraldry";

const SHIELD = "M6 6h88v52c0 30-22 48-44 56C28 106 6 88 6 58z";
const FLAG = "M2 2h146v96H2z";

/** Figura central, desenhada num quadrado de 40 com centro em (0,0). */
function ChargeShape({ charge, color }: { charge: Charge; color: string }) {
  const stroke = { stroke: "#1d1a16", strokeWidth: 1.2, strokeLinejoin: "round" as const };
  switch (charge) {
    case "estrela": {
      const pts = Array.from({ length: 10 }, (_, i) => {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 ? 7.5 : 18;
        return `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`;
      }).join(" ");
      return <polygon points={pts} fill={color} {...stroke} />;
    }
    case "besante":
      return <circle r={13} fill={color} {...stroke} />;
    case "crescente":
      return <path d="M-6-15a16 16 0 1 0 0 30a12 12 0 1 1 0-30z" fill={color} {...stroke} />;
    case "torre":
      return (
        <path
          d="M-12 16v-22h-3v-8h5v4h4v-4h5v4h4v-4h5v8h-3v22zM-3 16v-8a3 3 0 0 1 6 0v8z"
          fill={color}
          fillRule="evenodd"
          {...stroke}
        />
      );
    case "cruz":
      return <path d="M-4-17h8v13h13v8h-13v13h-8v-13h-13v-8h13z" fill={color} {...stroke} />;
    default:
      return null;
  }
}

/** Brasão (escudo) ou bandeira desenhados a partir das opções geradas. */
export function EmblemArt({ emblem, title }: { emblem: Emblem; title: string }) {
  const clip = useId();
  const flag = emblem.kind === "bandeira";
  const w = flag ? 150 : 100;
  const h = flag ? 100 : 120;
  const outline = flag ? FLAG : SHIELD;
  const [a, b] = emblem.field;
  // Retângulo grande que cobre a forma; as divisões pintam uma parte com a 2ª cor.
  const second = (() => {
    switch (emblem.division) {
      case "partido":
        return <rect x={w / 2} y={0} width={w / 2} height={h} fill={b} />;
      case "cortado":
        return <rect x={0} y={flag ? h / 2 : 50} width={w} height={h} fill={b} />;
      case "banda":
        return <polygon points={`0,0 ${w},${h} 0,${h}`} fill={b} />;
      case "esquartelado":
        return (
          <>
            <rect x={w / 2} y={0} width={w / 2} height={flag ? h / 2 : 50} fill={b} />
            <rect x={0} y={flag ? h / 2 : 50} width={w / 2} height={h} fill={b} />
          </>
        );
      case "chaveirao":
        return (
          <polygon
            points={`0,${h * 0.78} ${w / 2},${h * 0.32} ${w},${h * 0.78} ${w},${h * 0.98} ${w / 2},${h * 0.52} 0,${h * 0.98}`}
            fill={b}
          />
        );
      default:
        return null;
    }
  })();
  const cx = w / 2;
  const cy = flag ? h / 2 : 52;
  return (
    <svg
      className="emblem-art"
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={`${flag ? "Bandeira" : "Brasão"} de ${title}`}
    >
      <defs>
        <clipPath id={clip}>
          <path d={outline} />
        </clipPath>
        <linearGradient id={`${clip}-shine`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.18" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width={w} height={h} fill={a} />
        {second}
        <g transform={`translate(${cx} ${cy})`}>
          <ChargeShape charge={emblem.charge} color={emblem.chargeColor} />
        </g>
        <rect width={w} height={h} fill={`url(#${clip}-shine)`} />
      </g>
      <path d={outline} fill="none" stroke="#1d1a16" strokeWidth={2.5} />
    </svg>
  );
}
