import { useEffect, useMemo, useState } from "react";
import { useApp, type Session } from "../state/store";
import { addNote } from "../manuscript/tree";
import { NOTE_KINDS, type NoteKind } from "../manuscript/types";
import { buildGraph } from "../links/links";
import { DOC_ICON, KIND_LABEL } from "../links/context";
import { Icon } from "./Icon";
import { NoteProfile, useAttachmentImage } from "./NoteProfile";
import { TimelineView } from "./TimelineView";
import { useWorldNav } from "../state/worldNav";
import { WritingView } from "./WritingView";
import { EmblemArt } from "./EmblemArt";
import { generateEmblem, parseEmblemOptions } from "../world/heraldry";
import { hashSeed } from "../world/geom";
import { validNoteImage } from "../vault/vault";
import type { Note } from "../manuscript/types";

const KIND_ICON = DOC_ICON;

const TAB_KEY = "talia.worldTab";

/** Abas do Mundo: um tipo de nota cada. A Linha do tempo fica dentro de Calendários. */
type WorldTab = NoteKind;
const TABS: WorldTab[] = [...NOTE_KINDS];
const SUB_KEY = "talia.calendarView";
type CalendarView = "timeline" | "calendars" | "writing";

function readTab(): WorldTab {
  try {
    const t = localStorage.getItem(TAB_KEY);
    // A antiga aba "Linha do tempo" agora mora em Calendários.
    if (t === "timeline") return "calendarios";
    return t && (TABS as string[]).includes(t) ? (t as WorldTab) : TABS[0]!;
  } catch {
    return TABS[0]!;
  }
}

function readSub(): CalendarView {
  try {
    const v = localStorage.getItem(SUB_KEY);
    return v === "calendars" || v === "writing" ? v : "timeline";
  } catch {
    return "timeline";
  }
}

/** Miniatura da imagem da ficha no cartão. */
/** Imagem da ficha no cartão; sem imagem, o ícone do tipo no lugar. */
function CardImage({ src, icon }: { src?: string; icon: string }) {
  const url = useAttachmentImage(src);
  return (
    <span className={"world-card-image" + (url ? "" : " empty")}>
      {url ? <img src={url} alt="" /> : <Icon name={icon} size={34} />}
    </span>
  );
}

/**
 * Bandeira do lugar (ou organização): a imagem que o autor enviou, ou a bandeira
 * padrão gerada pelo mapa (a mesma da ficha e do mapa-múndi).
 */
function CardFlag({ note, attachments }: { note: Note; attachments: string[] }) {
  const fields = note.fields ?? {};
  const custom = fields.bandeiraImagem;
  const ok =
    validNoteImage(custom) && attachments.includes(custom.slice("anexos/".length))
      ? custom
      : undefined;
  const url = useAttachmentImage(ok);
  const seed = parseEmblemOptions(fields.bandeira)?.seed ?? hashSeed(note.title + "#bandeira");
  const emblem = useMemo(() => generateEmblem({ seed, kind: "bandeira" }), [seed]);
  return ok ? (
    url ? (
      <img src={url} alt={`Bandeira de ${note.title}`} />
    ) : null
  ) : (
    <EmblemArt emblem={emblem} title={note.title} />
  );
}

/** Cartão de lugar: a foto com a bandeira no canto, ou só a bandeira. */
function PlaceCardImage({ note, attachments }: { note: Note; attachments: string[] }) {
  const photo = useAttachmentImage(note.image);
  return (
    <span className={"world-card-image" + (photo ? "" : " flag")}>
      {photo ? <img src={photo} alt="" /> : <CardFlag note={note} attachments={attachments} />}
      {photo && (
        <span className="world-card-flag">
          <CardFlag note={note} attachments={attachments} />
        </span>
      )}
    </span>
  );
}

/**
 * Mundo: o universo do projeto num lugar só. Personagens, lugares e ideias
 * em cartões (imagem e nome); clicar abre a ficha completa.
 */
export function WorldView({ session }: { session: Session }) {
  const change = useApp((s) => s.change);
  const { project, texts } = session;
  /** Aba aberta (Personagens, Lugares ou Ideias), lembrada neste computador. */
  const [tab, setTabState] = useState<WorldTab>(readTab);
  const setTab = (k: WorldTab) => {
    setTabState(k);
    try {
      localStorage.setItem(TAB_KEY, k);
    } catch {
      // sem armazenamento: vale só agora
    }
  };
  const count = (k: NoteKind) => project.notes.filter((n) => n.kind === k).length;

  /** Textos ligados a cada nota (links [[…]], menções e campos da ficha). */
  const linksOf = useMemo(() => {
    const g = buildGraph(project, texts, { mentions: true });
    const linksOf = new Map<string, string[]>();
    const add = (a: string, b: string) => linksOf.set(a, [...(linksOf.get(a) ?? []), b]);
    for (const e of g.edges) {
      add(e.source, e.target);
      add(e.target, e.source);
    }
    return linksOf;
  }, [project, texts]);
  /** Nota aberta na sua página própria (null = lista da aba). */
  // A ficha aberta mora num estado compartilhado: o cartão de uma menção no
  // editor também pode pedir para abrir uma ficha.
  const openId = useWorldNav((s) => s.openId);
  const setOpenId = useWorldNav((s) => s.setOpenId);
  const opened = openId ? project.notes.find((n) => n.id === openId) : undefined;
  // Saindo do Mundo, a próxima visita começa pela lista.
  useEffect(() => () => setOpenId(null), [setOpenId]);

  const create = (kind: NoteKind) => {
    let id: string | null = null;
    void change(
      (p) => {
        const r = addNote(p, kind, KIND_LABEL[kind].new);
        id = r.note.id;
        return r;
      },
      async () => {
        if (id) setOpenId(id);
      },
    );
  };

  // Uma ficha aberta de fora (cartão da menção) mostra a aba do tipo dela.
  const shownTab: NoteKind = opened ? opened.kind : tab;
  const kind: NoteKind = shownTab;
  /** Dentro de Calendários: a Linha do tempo ou os calendários do mundo. */
  const [sub, setSubState] = useState<CalendarView>(readSub);
  const setSub = (v: CalendarView) => {
    setSubState(v);
    try {
      localStorage.setItem(SUB_KEY, v);
    } catch {
      // sem armazenamento: vale só agora
    }
  };
  const notes = project.notes
    .filter((n) => n.kind === kind)
    .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
  const label = KIND_LABEL[kind];

  return (
    <div className="world">
      <div
        className="settings-tabs world-tabs"
        role="tablist"
        aria-label="Seções do Mundo"
        onKeyDown={(e) => {
          // Setas trocam de aba, como em qualquer lista de abas.
          if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
          const i = TABS.indexOf(shownTab);
          const next = TABS[(i + (e.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length]!;
          setTab(next);
          setOpenId(null);
          document.getElementById(`world-tab-${next}`)?.focus();
        }}
      >
        {TABS.map((k) => (
          <button
            key={k}
            id={`world-tab-${k}`}
            type="button"
            role="tab"
            aria-selected={shownTab === k}
            aria-controls="world-panel"
            tabIndex={shownTab === k ? 0 : -1}
            onClick={() => {
              setTab(k);
              setOpenId(null);
            }}
          >
            <Icon name={KIND_ICON[k]} size={15} />
            {KIND_LABEL[k].many}
            <span className="world-count">{count(k)}</span>
          </button>
        ))}
      </div>

      <div
        id="world-panel"
        className="world-body"
        role="tabpanel"
        aria-labelledby={`world-tab-${tab}`}
      >
        {tab === "calendarios" && !opened && (
          <div className="segmented wide world-sub" role="radiogroup" aria-label="Calendários">
            {(
              [
                ["timeline", "clock", "Linha do tempo"],
                ["calendars", "calendar", "Calendários do mundo"],
                ["writing", "edit", "Escrita"],
              ] as const
            ).map(([v, icon, text]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={sub === v}
                onClick={() => setSub(v)}
              >
                <Icon name={icon} size={14} /> {text}
              </button>
            ))}
          </div>
        )}
        {tab === "calendarios" && sub === "writing" && !opened ? (
          <WritingView />
        ) : tab === "calendarios" && sub === "timeline" && !opened ? (
          <TimelineView
            session={session}
            linksOf={linksOf}
            onOpenCalendar={(id) => setOpenId(id)}
          />
        ) : opened ? (
          <NoteProfile
            session={session}
            note={opened}
            links={linksOf.get(opened.id) ?? []}
            onBack={() => setOpenId(null)}
            onOpenNote={(id) => {
              const n = project.notes.find((x) => x.id === id);
              if (n) setTab(n.kind);
              setOpenId(id);
            }}
          />
        ) : (
          <>
            <header className="world-head">
              <div>
                <h2>{label.many}</h2>
                <p className="muted">{project.title}: clique num cartão para ver a ficha.</p>
              </div>
              <button type="button" className="btn sm" onClick={() => create(kind)}>
                <Icon name="plus" size={14} /> {label.new}
              </button>
            </header>
            {notes.length === 0 ? (
              <p className="muted">Nenhum ainda. Use “{label.new}” para começar.</p>
            ) : (
              <ul className="world-cards">
                {notes.map((n) => {
                  return (
                    <li key={n.id}>
                      {/* Cartão: só a imagem e o nome; o resto está na ficha. */}
                      <button
                        type="button"
                        className="world-card"
                        title={`Abrir a ficha de ${n.title}`}
                        onClick={() => setOpenId(n.id)}
                      >
                        {n.kind === "lugares" || n.kind === "organizacoes" ? (
                          <PlaceCardImage note={n} attachments={session.attachments} />
                        ) : (
                          <CardImage src={n.image} icon={KIND_ICON[n.kind]} />
                        )}
                        <b>{n.title}</b>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
