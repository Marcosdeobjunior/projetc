import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import { useSettings } from "../state/settings";
import {
  DEFAULT_TEXT_STYLE,
  TEXT_FONTS,
  TEXT_RANGES,
  type TextFont,
  type TextStyle,
} from "./textStyle";

const SLIDERS: {
  key: Exclude<keyof TextStyle, "font">;
  label: string;
  show(v: number): string;
}[] = [
  { key: "size", label: "Tamanho da letra", show: (v) => `${v} px` },
  { key: "line", label: "Espaço entre as linhas", show: (v) => v.toFixed(2).replace(".", ",") },
  { key: "letter", label: "Espaço entre as letras", show: (v) => pct(v) },
  { key: "word", label: "Espaço entre as palavras", show: (v) => pct(v) },
  {
    key: "indent",
    label: "Recuo da primeira linha",
    show: (v) => (v === 0 ? "sem recuo" : `${String(v).replace(".", ",")} em`),
  },
];

/** Espaçamento extra (em em) como porcentagem do tamanho da letra. */
const pct = (v: number) => (v === 0 ? "normal" : `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`);

/**
 * Botão "Aparência do texto" da barra do editor e o painel com fonte, tamanho
 * e espaçamentos. Vale para todos os textos, só na tela (não muda o arquivo
 * nem o livro exportado).
 */
export function TextStyleButton() {
  const style = useSettings((s) => s.textStyle);
  const set = useSettings((s) => s.set);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const update = (patch: Partial<TextStyle>) => set({ textStyle: { ...style, ...patch } });

  // O painel fica fixo na tela: a barra rola na horizontal e cortaria um painel dentro dela.
  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const r = button.current.getBoundingClientRect();
    const width = 300;
    setPos({
      top: r.bottom + 6,
      left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !button.current?.contains(t)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const changed = JSON.stringify(style) !== JSON.stringify(DEFAULT_TEXT_STYLE);

  return (
    <>
      <button
        ref={button}
        type="button"
        className="tool"
        title="Aparência do texto: fonte, tamanho e espaçamentos"
        aria-label="Aparência do texto"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-pressed={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="type" />
      </button>
      {open && pos && (
        <div
          ref={panel}
          className="text-style-panel"
          role="dialog"
          aria-label="Aparência do texto"
          style={{ top: pos.top, left: pos.left }}
        >
          <label className="ts-row">
            <span>Fonte</span>
            <select
              className="tool-select"
              value={style.font}
              onChange={(e) => update({ font: e.target.value as TextFont })}
            >
              {TEXT_FONTS.map((f) => (
                <option key={f.id} value={f.id} style={{ fontFamily: f.css }}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          {SLIDERS.map((s) => {
            const r = TEXT_RANGES[s.key];
            return (
              <label key={s.key} className="ts-row">
                <span>
                  {s.label} <b>{s.show(style[s.key])}</b>
                </span>
                <input
                  type="range"
                  min={r.min}
                  max={r.max}
                  step={r.step}
                  value={style[s.key]}
                  onChange={(e) => update({ [s.key]: Number(e.target.value) })}
                />
              </label>
            );
          })}
          <p className="ts-note">
            Vale para todos os textos, só aqui no editor. O arquivo e o livro exportado não mudam
            (para o livro, use a Diagramação).
          </p>
          <button
            type="button"
            className="btn ghost sm"
            disabled={!changed}
            onClick={() => set({ textStyle: DEFAULT_TEXT_STYLE })}
          >
            Voltar ao padrão
          </button>
        </div>
      )}
    </>
  );
}
