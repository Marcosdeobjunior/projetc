import { useEffect, useRef, useState } from "react";

interface Props {
  value: string;
  label: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
  className?: string;
}

/** Campo de texto para renomear. Enter ou sair do campo confirma; Esc cancela. */
export function InlineEdit({ value, label, onCommit, onCancel, className }: Props) {
  const [text, setText] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const commit = () => {
    if (done.current) return;
    done.current = true;
    const t = text.trim();
    if (t && t !== value) onCommit(t);
    else onCancel();
  };

  return (
    <input
      ref={ref}
      className={"inline-edit " + (className ?? "")}
      aria-label={label}
      value={text}
      maxLength={120}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          done.current = true;
          onCancel();
        }
      }}
    />
  );
}
