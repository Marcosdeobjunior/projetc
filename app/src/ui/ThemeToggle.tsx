import { useEffect, useState } from "react";
import { Icon } from "./Icon";

type Theme = "system" | "light" | "dark";
const KEY = "inkflow.theme";

function readTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

const OPTIONS: { id: Theme; label: string; icon: string }[] = [
  { id: "system", label: "Tema do sistema", icon: "monitor" },
  { id: "light", label: "Tema claro", icon: "sun" },
  { id: "dark", label: "Tema escuro", icon: "moon" },
];

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") delete root.dataset.theme;
    else root.dataset.theme = theme;
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      // sem armazenamento: vale só nesta sessão
    }
  }, [theme]);

  return (
    <div className="segmented" role="radiogroup" aria-label="Tema">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={theme === o.id}
          title={o.label}
          aria-label={o.label}
          onClick={() => setTheme(o.id)}
        >
          <Icon name={o.icon} size={15} />
        </button>
      ))}
    </div>
  );
}
