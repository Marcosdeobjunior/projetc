import type { ReactNode } from "react";
import { useSettings, type MinimapPos, type Theme } from "../state/settings";
import { Icon } from "./Icon";

const THEMES: { id: Theme; label: string; icon: string }[] = [
  { id: "system", label: "Sistema", icon: "monitor" },
  { id: "light", label: "Claro", icon: "sun" },
  { id: "dark", label: "Escuro", icon: "moon" },
];

export const POS_LABEL: Record<MinimapPos, string> = {
  "top-left": "Canto superior esquerdo",
  top: "Faixa no topo",
  "top-right": "Canto superior direito",
  left: "Faixa à esquerda",
  right: "Faixa à direita",
  "bottom-left": "Canto inferior esquerdo",
  bottom: "Faixa embaixo",
  "bottom-right": "Canto inferior direito",
};

/** Grade 3×3 do seletor de posição; o meio é a página. */
const GRID: (MinimapPos | null)[] = [
  "top-left",
  "top",
  "top-right",
  "left",
  null,
  "right",
  "bottom-left",
  "bottom",
  "bottom-right",
];

/** Configurações gerais do app. */
export function Settings() {
  const s = useSettings();

  return (
    <div className="settings">
      <div className="settings-inner">
        <Section title="Aparência">
          <Field label="Tema" hint="“Sistema” segue o modo claro ou escuro do computador.">
            <div className="segmented wide" role="radiogroup" aria-label="Tema">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={s.theme === t.id}
                  onClick={() => s.set({ theme: t.id })}
                >
                  <Icon name={t.icon} size={15} /> {t.label}
                </button>
              ))}
            </div>
          </Field>
        </Section>

        <Section title="Minimapa">
          <Field
            label="Mostrar minimapa nos textos"
            hint="Um grafo pequeno com o texto aberto e tudo o que se liga a ele."
          >
            <Switch
              label="Mostrar minimapa nos textos"
              on={s.minimap}
              onChange={(minimap) => s.set({ minimap })}
            />
          </Field>
          <Field
            label="Posição"
            hint="Nos cantos ele flutua sobre a página. No topo e embaixo ocupa a largura toda; nas laterais, a altura toda. Também dá para arrastar o minimapa pela barra dele."
          >
            <div className="pos-picker" role="radiogroup" aria-label="Posição do minimapa">
              {GRID.map((pos, i) =>
                pos ? (
                  <button
                    key={pos}
                    type="button"
                    role="radio"
                    className={"pos-" + pos}
                    aria-checked={s.minimapPos === pos}
                    aria-label={POS_LABEL[pos]}
                    title={POS_LABEL[pos]}
                    disabled={!s.minimap}
                    onClick={() => s.set({ minimapPos: pos })}
                  >
                    <i />
                  </button>
                ) : (
                  <span key={i} className="pos-page" aria-hidden="true">
                    Página
                  </span>
                ),
              )}
            </div>
          </Field>
          <Field
            label="Incluir menções automáticas"
            hint="Liga também os textos em que o nome de uma nota aparece, mesmo sem [[link]]."
          >
            <Switch
              label="Incluir menções automáticas"
              on={s.minimapMentions}
              disabled={!s.minimap}
              onChange={(minimapMentions) => s.set({ minimapMentions })}
            />
          </Field>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-section">
      <h2 className="section-title">{title}</h2>
      <div className="settings-card">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="setting">
      <div className="setting-text">
        <span className="setting-label">{label}</span>
        {hint && <span className="hint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Switch({
  label,
  on,
  disabled,
  onChange,
}: {
  label: string;
  on: boolean;
  disabled?: boolean;
  onChange(on: boolean): void;
}) {
  return (
    <button
      type="button"
      role="switch"
      className="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
    >
      <i />
    </button>
  );
}
