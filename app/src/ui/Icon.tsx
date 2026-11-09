import { useId } from "react";

const PATHS: Record<string, string> = {
  bold: "M7 5h6a3.5 3.5 0 0 1 0 7H7zm0 7h7a3.5 3.5 0 0 1 0 7H7z",
  italic: "M10 5h8M6 19h8M14 5l-4 14",
  heading: "M6 5v14M18 5v14M6 12h12",
  quote: "M7 7h4v4c0 3-1.5 5-4 6M15 7h4v4c0 3-1.5 5-4 6",
  separator: "M5 12h.01M12 12h.01M19 12h.01",
  undo: "M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3",
  redo: "m15 14 5-5-5-5M20 9H9a5 5 0 0 0 0 10h3",
  plus: "M12 5v14M5 12h14",
  chevron: "m9 6 6 6-6 6",
  globe:
    "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z",
  type: "M5 7V5h14v2M12 5v14M9 19h6",
  "collapse-all": "m7 11 5-5 5 5M7 18l5-5 5 5",
  "expand-all": "m7 6 5 5 5-5M7 13l5 5 5-5",
  "chevron-left": "m15 6-6 6 6 6",
  play: "M7 5v14l11-7z",
  pause: "M8 5v14M16 5v14",
  next: "M6 5l9 7-9 7zM18 5v14",
  prev: "M18 5 9 12l9 7zM6 5v14",
  volume: "M4 9.5h3.5L12 6v12l-4.5-3.5H4zM15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10",
  mute: "M4 9.5h3.5L12 6v12l-4.5-3.5H4zM16 10l4 4M20 10l-4 4",
  music:
    "M9 18V6l11-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM9 10l11-2",
  /* Toca-discos antigo: caixa, prato com o disco e o braço da agulha. */
  turntable:
    "M3 7h18v12H3zM5.5 13a4.5 4.5 0 1 0 9 0 4.5 4.5 0 1 0-9 0M8.5 13a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0M18 9v5.5l-3.2 2.2M17 17.5h2M5 21h1.5M17.5 21H19",
  lyre: "M8 4c-3.5 3-3.5 10 0 13M16 4c3.5 3 3.5 10 0 13M7.5 17h9M10 7v10M12 6v11M14 7v10M9 21h6M12 17v4",
  wave: "M2 12c2-5 4-5 6 0s4 5 6 0 4-5 6 0c.7 1.7 1.4 2.6 2 3",
  rain: "M7 15a4 4 0 0 1-.6-8 5.5 5.5 0 0 1 10.6 1.5A3.5 3.5 0 0 1 17 15zM8 18l-1 2.5M12 18l-1 2.5M16 18l-1 2.5",
  leaf: "M5 19c0-8.5 6-14 15-14 0 9-5.5 15-14 15M5 19l8-8",
  up: "m6 15 6-6 6 6",
  down: "m6 9 6 6 6-6",
  edit: "M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  sun: "M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  moon: "M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z",
  monitor: "M3 5h18v11H3zM8 20h8M12 16v4",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "M6 6l12 12M18 6 6 18",
  file: "M6 3h8l4 4v14H6zM14 3v4h4",
  check: "m5 12 5 5 9-10",
  person: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  pin: "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  bulb: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.4 1.1 2.2h5c0-.8.5-1.7 1.1-2.2A6 6 0 0 0 12 3z",
  graph:
    "M4 6a2 2 0 1 0 4 0a2 2 0 1 0-4 0M16 8a2 2 0 1 0 4 0a2 2 0 1 0-4 0M10 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0M7.4 7.8l3.6 8.4M16.8 9.8l-3.6 6.4M8 6.3l8 1.4",
  swap: "M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7",
  chevronDown: "m6 9 6 6 6-6",
  strike:
    "M5 12h14M16 6.5C15.2 5.6 13.8 5 12 5c-2.5 0-4.5 1.3-4.5 3.4 0 1.3.8 2.2 2 2.8M8 17.5c.9 1 2.3 1.5 4.2 1.5 2.6 0 4.5-1.3 4.5-3.5 0-.9-.3-1.6-.9-2.2",
  highlight: "m9 11-5 5v3h3l5-5M9 11l6-6 4 4-6 6M9 11l4 4M14 21h7",
  list: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
  listOrdered:
    "M10 6h10M10 12h10M10 18h10M4 4.5l1.5-.5v5M4 14.5a1.5 1.5 0 0 1 3 .3c0 1.2-3 2.2-3 3.7h3",
  clear: "M4 7V5h12v2M10 5l-3 14M5 19h5M15 14l5 5M20 14l-5 5",
  cut: "M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.1 7.9 20 20M8.1 16.1 20 4",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  link: "M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1",
  sidebar: "M4 5h16v14H4zM9 5v14",
  back: "M19 12H5M11 6l-6 6 6 6",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  minus: "M5 12h14",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  history: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2",
  paperclip:
    "M20 11.5 12.2 19.3a5 5 0 0 1-7.1-7.1l8.1-8.1a3.3 3.3 0 0 1 4.7 4.7l-8.2 8.1a1.7 1.7 0 0 1-2.4-2.4l7.6-7.5",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  video: "M3 6h12v12H3zM15 10l6-3v10l-6-3",
  audio: "M9 18V6l10-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM19 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  export: "M12 3v12M7 10l5 5 5-5M5 21h14",
  print: "M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z",
  book: "M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5zM4 21.5A2.5 2.5 0 0 1 6.5 19H20v3H6.5",
  sync: "M20 11a8 8 0 0 0-14.3-4.9L4 8M4 3v5h5M4 13a8 8 0 0 0 14.3 4.9L20 16M20 21v-5h-5",
  cloud: "M7 18a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 9.5a4 4 0 0 1-.5 8.5z",
  cloudOff: "M7 18a4.5 4.5 0 0 1-.5-9M10 6.2A6 6 0 0 1 18 9.5a4 4 0 0 1 2.2 7.2M3 3l18 18",
  restore: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5",
  save: "M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6",
  target: "M12 3v3M12 18v3M3 12h3M18 12h3M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  expand: "M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7",
  /* Planeta com anel: o anel passa na frente do planeta embaixo e some atrás dele em cima. */
  planet:
    "M17.5 12a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0zM2.94 16.23A10 3.6 -25 0 0 21.06 7.77M21.06 7.77A10 3.6 -25 0 0 14.68 7.2M6.6 10.96A10 3.6 -25 0 0 2.94 16.23",
  piano: "M3 5h18v14H3zM3 13h18M8 13v6M13 13v6M18 13v6M6.5 5v8M11 5v8M15.5 5v8",
  headphones:
    "M4 15v-3a8 8 0 0 1 16 0v3M4 15a2 2 0 0 1 2-2h1v7H6a2 2 0 0 1-2-2zM20 15a2 2 0 0 0-2-2h-1v7h1a2 2 0 0 0 2-2z",
  film: "M4 4h16v16H4zM8 4v16M16 4v16M4 8h4M4 12h4M4 16h4M16 8h4M16 12h4M16 16h4",
  sparkle:
    "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z",
  /* Rádio antigo: caixa de cantos suaves, antena, alto-falante e dial. */
  radio:
    "M4.5 9h15a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5v-8A1.5 1.5 0 0 1 4.5 9zM7 9l9-5M6.5 14.5a3 3 0 1 0 6 0 3 3 0 1 0-6 0M15.5 13h2.5M15.5 16h2.5",
  home: "M4 10.5 12 4l8 6.5V20h-5.5v-5.5h-5V20H4z",
  star: "M12 2v20M2 12h20M6.5 6.5l11 11M17.5 6.5l-11 11",
  refresh: "M20 11a8 8 0 0 0-14.8-4M4 4v4h4M4 13a8 8 0 0 0 14.8 4M20 20v-4h-4",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  grip: "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01",
};

export function Icon({ name, size = 18 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === "separator" || name === "grip" ? 3.2 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/**
 * O símbolo da Tália: a árvore branca no círculo amarelo, com as cores da marca
 * (não muda com a paleta). Mesmo desenho de `src-tauri/icons/source/talia-mark.svg`.
 */
export function TaliaMark({ size = 28 }: { size?: number }) {
  const id = useId();
  return (
    <svg
      height={size}
      width={(size * 850) / 1050}
      viewBox="219 120 850 1050"
      aria-hidden="true"
      className="talia-mark"
    >
      <defs>
        <clipPath id={id}>
          <circle cx="644" cy="544" r="424" />
        </clipPath>
      </defs>
      <g fill="none" strokeLinecap="round" strokeWidth="79">
        <path d="M644 300V1130" stroke="#ECBF1F" />
        <circle cx="644" cy="544" r="424" fill="#ECBF1F" stroke="none" />
        <path
          d="M644 300V1130M482 628l162 162M854 503 644 713"
          stroke="#fff"
          clipPath={`url(#${id})`}
        />
      </g>
    </svg>
  );
}
