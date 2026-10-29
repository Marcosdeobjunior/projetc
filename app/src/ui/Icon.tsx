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
  back: "M15 6l-6 6 6 6",
  sun: "M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  moon: "M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z",
  monitor: "M3 5h18v11H3zM8 20h8M12 16v4",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "M6 6l12 12M18 6 6 18",
  file: "M6 3h8l4 4v14H6zM14 3v4h4",
  check: "m5 12 5 5 9-10",
};

export function Icon({ name, size = 18 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === "separator" ? 3.2 : 1.8}
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
