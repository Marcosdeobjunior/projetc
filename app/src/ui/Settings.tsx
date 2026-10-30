import { useState, type ReactNode } from "react";
import { useSettings, type MinimapPos, type Theme } from "../state/settings";
import { useSync } from "../state/sync";
import { useApp } from "../state/store";
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

        <SyncSection />

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

const SYNC_EVERY = [
  { value: 0, label: "Só quando eu pedir" },
  { value: 5, label: "A cada 5 minutos" },
  { value: 15, label: "A cada 15 minutos" },
  { value: 30, label: "A cada 30 minutos" },
];

const time = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

/** Conta Google e sincronização do projeto aberto com o Google Drive. */
function SyncSection() {
  const sync = useSync();
  const session = useApp((s) => s.session);
  const syncEvery = useSettings((s) => s.syncEvery);
  const setSettings = useSettings((s) => s.set);
  const [editingClient, setEditingClient] = useState(false);

  if (!sync.available) {
    return (
      <Section title="Sincronização">
        <Field
          label="Google Drive"
          hint="A sincronização funciona no app desktop. Nesta prévia no navegador ela fica desligada."
        >
          <span />
        </Field>
      </Section>
    );
  }

  return (
    <Section title="Sincronização">
      {!sync.client || editingClient ? (
        <ClientForm
          onDone={(client) => {
            if (client) sync.setClient(client);
            setEditingClient(false);
          }}
          canCancel={!!sync.client}
        />
      ) : !sync.account ? (
        <Field
          label="Conta Google"
          hint="Os projetos ficam numa pasta “InkFlow” do seu Google Drive. O InkFlow só enxerga os arquivos que ele mesmo criou lá."
        >
          <div className="setting-actions">
            <button type="button" className="link-btn" onClick={() => setEditingClient(true)}>
              Credenciais
            </button>
            <button
              type="button"
              className="btn primary sm"
              disabled={sync.busy}
              onClick={() => void sync.connect()}
            >
              {sync.busy ? "Esperando o login no navegador…" : "Conectar conta Google"}
            </button>
          </div>
        </Field>
      ) : (
        <>
          <Field label="Conta Google" hint={`Conectada: ${sync.account.email || "conta Google"}`}>
            <button type="button" className="btn ghost sm" onClick={() => void sync.disconnect()}>
              Desconectar
            </button>
          </Field>
          {session ? (
            <>
              <Field
                label="Sincronizar este projeto"
                hint={
                  sync.enabled
                    ? `Pasta no Drive: InkFlow/${session.project.title}`
                    : "Liga este projeto a uma pasta no seu Google Drive. Em outro computador, use “Baixar do Google Drive” na tela inicial."
                }
              >
                <Switch
                  label="Sincronizar este projeto"
                  on={sync.enabled}
                  disabled={sync.busy}
                  onChange={(on) => void (on ? sync.enable() : sync.disable())}
                />
              </Field>
              {sync.enabled && (
                <Field
                  label="Sincronizar agora"
                  hint={
                    sync.status === "syncing"
                      ? "Sincronizando…"
                      : sync.lastSync
                        ? `Última sincronização: ${time.format(sync.lastSync)}. Também sincroniza ao abrir e ao fechar o projeto.`
                        : "Ainda não sincronizado."
                  }
                >
                  <div className="setting-actions">
                    <select
                      className="tool-select"
                      aria-label="Frequência da sincronização"
                      value={syncEvery}
                      onChange={(e) => setSettings({ syncEvery: Number(e.target.value) })}
                    >
                      {SYNC_EVERY.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn primary sm"
                      disabled={sync.status === "syncing"}
                      onClick={() => void sync.syncNow()}
                    >
                      <Icon name="sync" size={15} />
                      {sync.status === "syncing" ? "Sincronizando…" : "Sincronizar agora"}
                    </button>
                  </div>
                </Field>
              )}
            </>
          ) : (
            <Field
              label="Projetos no Drive"
              hint="Abra um projeto para ligar a sincronização, ou baixe um projeto do Drive na tela inicial."
            >
              <span />
            </Field>
          )}
        </>
      )}
      {sync.error && (
        <p className="setting-error" role="alert">
          {sync.error}
        </p>
      )}
    </Section>
  );
}

/** ID e chave do app no Google Cloud (veja o README: "Sincronização com o Google Drive"). */
function ClientForm({
  onDone,
  canCancel,
}: {
  onDone(client: { id: string; secret: string } | null): void;
  canCancel: boolean;
}) {
  const current = useSync((s) => s.client);
  const [id, setId] = useState(current?.id ?? "");
  const [secret, setSecret] = useState(current?.secret ?? "");
  return (
    <form
      className="setting client-form"
      onSubmit={(e) => {
        e.preventDefault();
        onDone({ id: id.trim(), secret: secret.trim() });
      }}
    >
      <div className="setting-text">
        <span className="setting-label">Credenciais do Google</span>
        <span className="hint">
          Para conectar ao Drive, o InkFlow precisa de um “ID do cliente OAuth” do tipo “App para
          computador”, criado no Google Cloud Console. O passo a passo está no README do projeto, em
          “Sincronização com o Google Drive”.
        </span>
      </div>
      <label>
        ID do cliente
        <input
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="…apps.googleusercontent.com"
          required
        />
      </label>
      <label>
        Chave secreta do cliente
        <input
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          type="password"
          required
        />
      </label>
      <div className="setting-actions">
        {canCancel && (
          <button type="button" className="btn ghost sm" onClick={() => onDone(null)}>
            Cancelar
          </button>
        )}
        <button type="submit" className="btn primary sm">
          Salvar
        </button>
      </div>
    </form>
  );
}
