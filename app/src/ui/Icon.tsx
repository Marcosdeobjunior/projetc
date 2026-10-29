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
  restore: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5",
  save: "M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6",
  target: "M12 3v3M12 18v3M3 12h3M18 12h3M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  expand: "M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7",
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

export function Quill({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="quillGrad" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#5b8cff" />
          <stop offset=".55" stopColor="#8b6dff" />
          <stop offset="1" stopColor="#c79bff" />
        </linearGradient>
      </defs>
      <path
        fill="url(#quillGrad)"
        d="M29 2.5c-8.6.6-15.7 5.4-19.3 12.8-1.4 2.9-2.1 5.9-2.3 8.6l2.1-1.9c.9-3.7 2.8-7.4 6.2-10.4-2.6 3.3-4.3 6.5-5.1 9.8 7.4-.9 13.6-5.6 16.6-12.4 1.1-2.4 1.7-4.4 1.8-6.5z"
      />
      <path d="M8.5 25.5 4 30" stroke="#8b6dff" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
