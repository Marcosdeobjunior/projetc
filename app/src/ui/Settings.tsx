import { useEffect, useState, type ReactNode } from "react";
import { PALETTES, useSettings, type MinimapPos } from "../state/settings";
import { useSync } from "../state/sync";
import { useApp } from "../state/store";
import { Icon } from "./Icon";
import { BookDesignView } from "./BookDesignView";
import { ExportView } from "./ExportView";
import { BgImageError, cssUrl, imageFromUrl, imageSource, shrinkImage } from "./bgImage";

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

export type SettingsTab = "geral" | "sync" | "diagramacao" | "exportar";

const TABS: { id: SettingsTab; label: string; icon: string; project?: boolean }[] = [
  { id: "geral", label: "Geral", icon: "settings" },
  { id: "sync", label: "Sincronização", icon: "cloud" },
  { id: "diagramacao", label: "Diagramação", icon: "book", project: true },
  { id: "exportar", label: "Exportação", icon: "export", project: true },
];

/** Aba aberta por último (volta nela ao reabrir as Configurações). */
const TAB_KEY = "inkflow.settingsTab";
function lastTab(): SettingsTab {
  try {
    return (sessionStorage.getItem(TAB_KEY) as SettingsTab | null) ?? "geral";
  } catch {
    return "geral";
  }
}

/** Configurações, em abas: Geral, Sincronização e, com um projeto aberto, Diagramação e Exportar. */
export function Settings() {
  const session = useApp((s) => s.session);
  const tabs = TABS.filter((t) => !t.project || session);
  const [tab, setTab] = useState<SettingsTab>(() => {
    const last = lastTab();
    return tabs.some((t) => t.id === last) ? last : "geral";
  });
  const choose = (t: SettingsTab) => {
    try {
      sessionStorage.setItem(TAB_KEY, t);
    } catch {
      // sem armazenamento: só não lembra a aba
    }
    setTab(t);
  };
  const wide = tab === "diagramacao" || tab === "exportar";

  return (
    <div className={"settings" + (wide ? " wide" : "")}>
      <div className="settings-tabs" role="tablist" aria-label="Seções das configurações">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => choose(t.id)}
          >
            <Icon name={t.icon} size={15} />
            {t.label}
          </button>
        ))}
      </div>
      {tab === "diagramacao" && session ? (
        <BookDesignView session={session} />
      ) : tab === "exportar" && session ? (
        <ExportView session={session} />
      ) : (
        <div className="settings-scroll" role="tabpanel">
          <div className="settings-inner">{tab === "sync" ? <SyncSection /> : <General />}</div>
        </div>
      )}
    </div>
  );
}

function General() {
  const s = useSettings();
  return (
    <>
      <Section title="Perfil">
        <Field label="Seu nome" hint="Aparece no topo da tela de projetos.">
          <input
            className="text-input"
            type="text"
            value={s.userName}
            maxLength={60}
            placeholder="Como você assina"
            aria-label="Seu nome"
            autoComplete="name"
            onChange={(e) => s.set({ userName: e.target.value })}
          />
        </Field>
      </Section>

      <Section title="Aparência">
        <Field
          label="Paleta"
          hint="Define as cores do app inteiro: editor, barra lateral e tela de projetos."
        >
          <div className="palette-picker" role="radiogroup" aria-label="Paleta">
            {PALETTES.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={s.palette === p.id}
                className="palette-option"
                onClick={() => s.set({ palette: p.id })}
              >
                <span className="palette-swatch" aria-hidden="true">
                  {p.swatch.map((c, i) => (
                    <i key={i} style={{ background: c }} />
                  ))}
                </span>
                <span className="palette-text">
                  <b>{p.label}</b>
                  <small>
                    {p.hint} · {p.theme === "dark" ? "escura" : "clara"}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </Field>
      </Section>

      <HomeBackground />

      <Section title="Minimapa">
        <Field
          label="Mostrar minimapa nos textos"
          hint="Um Elo pequeno com o texto aberto e tudo o que se liga a ele."
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
    </>
  );
}

function HomeBackground() {
  const s = useSettings();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [address, setAddress] = useState("");
  const [over, setOver] = useState(false);
  const image = s.homeBg === "imagem" && s.homeBgImage;

  /** Guarda a imagem (já reduzida) e passa a usá-la. */
  const apply = async (load: () => Promise<string>) => {
    setError(null);
    setLoading(true);
    try {
      const data = await load();
      if (!useSettings.getState().setHomeBgImage(data)) {
        setError("A imagem é grande demais para guardar. Tente uma menor.");
        return false;
      }
      useSettings.getState().set({ homeBg: "imagem" });
      return true;
    } catch (err) {
      setError(err instanceof BgImageError ? err.message : "Não foi possível usar essa imagem.");
      return false;
    } finally {
      setLoading(false);
    }
  };
  const applySource = (src: ReturnType<typeof imageSource>) => {
    if (!src) return false;
    void apply(() => ("file" in src ? shrinkImage(src.file) : imageFromUrl(src.url)));
    return true;
  };

  // Ctrl+V com uma imagem (ou um endereço) copiada, fora dos campos de texto.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, [contenteditable='true']")) return;
      if (applySource(imageSource(e.clipboardData))) e.preventDefault();
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  });

  return (
    <Section title="Tela de projetos">
      <Field
        label="Fundo"
        hint="O fundo da paleta ou uma imagem sua. A barra lateral e o topo são transparentes e mostram o fundo."
      >
        <div
          className={"bg-picker" + (over ? " over" : "")}
          role="radiogroup"
          aria-label="Fundo da tela de projetos"
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            if (!applySource(imageSource(e.dataTransfer)))
              setError("Solte um arquivo de imagem ou o endereço de uma imagem.");
          }}
        >
          <button
            type="button"
            role="radio"
            className="bg-swatch bg-paleta"
            aria-checked={s.homeBg === "paleta"}
            aria-label="Fundo da paleta"
            title="Fundo da paleta"
            onClick={() => s.set({ homeBg: "paleta" })}
          />
          <label
            className={"bg-swatch bg-imagem" + (loading ? " loading" : "")}
            title={
              s.homeBgImage
                ? "Usar a imagem (clique de novo para escolher outro arquivo)"
                : "Escolher uma imagem do computador"
            }
            data-checked={s.homeBg === "imagem"}
            style={s.homeBgImage ? { backgroundImage: cssUrl(s.homeBgImage) } : undefined}
            onClick={(e) => {
              // Já existe imagem e ela não está em uso: o primeiro clique só volta a usá-la.
              if (s.homeBgImage && s.homeBg !== "imagem") {
                e.preventDefault();
                s.set({ homeBg: "imagem" });
              }
            }}
          >
            {!s.homeBgImage && <Icon name="plus" size={16} />}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              aria-label="Escolher imagem do computador"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void apply(() => shrinkImage(file));
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </Field>
      <form
        className="setting bg-url"
        onSubmit={(e) => {
          e.preventDefault();
          void apply(() => imageFromUrl(address)).then((done) => done && setAddress(""));
        }}
      >
        <div className="setting-text">
          <span className="setting-label">Imagem da internet</span>
          <span className="hint">
            Cole o endereço de uma imagem. Também dá para copiar uma imagem e apertar Ctrl+V aqui,
            ou arrastar um arquivo até as amostras acima.
          </span>
        </div>
        <div className="bg-url-row">
          <input
            className="text-input"
            type="url"
            inputMode="url"
            value={address}
            placeholder="https://…/imagem.jpg"
            aria-label="Endereço da imagem"
            onChange={(e) => {
              setAddress(e.target.value);
              setError(null);
            }}
          />
          <button type="submit" className="btn ghost sm" disabled={loading || !address.trim()}>
            {loading ? "Baixando…" : "Usar"}
          </button>
        </div>
      </form>
      {error && (
        <p className="setting-error bg-error" role="alert">
          {error}
        </p>
      )}
      {image && (
        <Field
          label="Suavizar a imagem"
          hint="Cobre a imagem com a cor do tema, para os textos continuarem fáceis de ler."
        >
          <div className="bg-dim">
            <input
              type="range"
              min={0}
              max={85}
              step={5}
              value={s.homeBgDim}
              aria-label="Suavizar a imagem"
              onChange={(e) => s.set({ homeBgDim: Number(e.target.value) })}
            />
            <span>{s.homeBgDim}%</span>
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                s.setHomeBgImage(null);
                s.set({ homeBg: "paleta" });
              }}
            >
              Remover imagem
            </button>
          </div>
        </Field>
      )}
    </Section>
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
                    ? `Pasta no Drive: dentro de “InkFlow” (com o nome que o projeto tinha quando a sincronização foi ligada).`
                    : "Liga este projeto a uma pasta no seu Google Drive. Em outro computador, conecte a mesma conta e, na tela inicial, use “Ver projetos no Drive” e depois “Baixar”."
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
          computador”, criado no Google Cloud Console. O passo a passo está no Guia do usuário
          (pasta docs do projeto), em “Sincronização com o Google Drive”.
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
