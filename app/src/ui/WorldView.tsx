import { useMemo, useState } from "react";
import { useApp, type Session } from "../state/store";
import { addNote } from "../manuscript/tree";
import { NOTE_KINDS, type NoteKind } from "../manuscript/types";
import { buildGraph } from "../links/links";
import { DOC_ICON, KIND_LABEL } from "../links/context";
import { Icon } from "./Icon";
import { NoteProfile, useAttachmentImage } from "./NoteProfile";

const KIND_ICON = DOC_ICON;

const TAB_KEY = "talia.worldTab";

function readTab(): NoteKind {
  try {
    const t = localStorage.getItem(TAB_KEY);
    return (NOTE_KINDS as readonly string[]).includes(t ?? "") ? (t as NoteKind) : NOTE_KINDS[0];
  } catch {
    return NOTE_KINDS[0];
  }
}

/** Início do texto da nota, para o cartão. */
function excerpt(text: string): string {
  // [[Link]] e [[Link|apelido]] aparecem só como o nome.
  const t = text
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a: string, b?: string) => b ?? a)
    .replace(/\s+/g, " ")
    .trim();
  return t.length > 160 ? t.slice(0, 160).trimEnd() + "…" : t;
}

/** Miniatura da imagem da ficha no cartão. */
function CardImage({ src }: { src: string }) {
  const url = useAttachmentImage(src);
  return <span className="world-card-image">{url && <img src={url} alt="" />}</span>;
}

/**
 * Mundo: o universo do projeto num lugar só. Personagens, lugares e ideias
 * em cartões, com o começo da nota e em quantas cenas cada um aparece
 * (links [[…]] e menções do nome).
 */
export function WorldView({ session }: { session: Session }) {
  const change = useApp((s) => s.change);
  const { project, texts } = session;
  /** Aba aberta (Personagens, Lugares ou Ideias), lembrada neste computador. */
  const [tab, setTabState] = useState<NoteKind>(readTab);
  const setTab = (k: NoteKind) => {
    setTabState(k);
    try {
      localStorage.setItem(TAB_KEY, k);
    } catch {
      // sem armazenamento: vale só agora
    }
  };
  const count = (k: NoteKind) => project.notes.filter((n) => n.kind === k).length;

  /** Textos ligados a cada nota (links [[…]] e menções), e quantos são cenas. */
  const { linksOf, scenesOf } = useMemo(() => {
    const g = buildGraph(project, texts, { mentions: true });
    const type = new Map(g.nodes.map((n) => [n.id, n.type]));
    const linksOf = new Map<string, string[]>();
    const add = (a: string, b: string) => linksOf.set(a, [...(linksOf.get(a) ?? []), b]);
    for (const e of g.edges) {
      add(e.source, e.target);
      add(e.target, e.source);
    }
    const scenesOf = new Map<string, number>();
    for (const [id, list] of linksOf)
      scenesOf.set(id, list.filter((x) => type.get(x) === "scene").length);
    return { linksOf, scenesOf };
  }, [project, texts]);
  /** Nota aberta na sua página própria (null = lista da aba). */
  const [openId, setOpenId] = useState<string | null>(null);
  const opened = openId ? project.notes.find((n) => n.id === openId) : undefined;

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

  const kind = tab;
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
          const i = NOTE_KINDS.indexOf(tab);
          const next =
            NOTE_KINDS[
              (i + (e.key === "ArrowRight" ? 1 : -1) + NOTE_KINDS.length) % NOTE_KINDS.length
            ]!;
          setTab(next);
          setOpenId(null);
          document.getElementById(`world-tab-${next}`)?.focus();
        }}
      >
        {NOTE_KINDS.map((k) => (
          <button
            key={k}
            id={`world-tab-${k}`}
            type="button"
            role="tab"
            aria-selected={tab === k}
            aria-controls="world-panel"
            tabIndex={tab === k ? 0 : -1}
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
        aria-labelledby={`world-tab-${kind}`}
      >
        {opened ? (
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
                  const text = excerpt(texts[n.id] ?? "");
                  const scenes = scenesOf.get(n.id) ?? 0;
                  return (
                    <li key={n.id}>
                      <button type="button" className="world-card" onClick={() => setOpenId(n.id)}>
                        {n.image && <CardImage src={n.image} />}
                        <b>{n.title}</b>
                        <span className="world-excerpt">{text || "Sem descrição ainda."}</span>
                        <small>
                          {scenes === 0
                            ? "Não aparece em nenhuma cena"
                            : `Aparece em ${scenes} ${scenes === 1 ? "cena" : "cenas"}`}
                        </small>
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
