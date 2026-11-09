import { useMemo, useState } from "react";
import { useApp, type Session } from "../state/store";
import { addNote } from "../manuscript/tree";
import { NOTE_KINDS, type NoteKind } from "../manuscript/types";
import { buildGraph } from "../links/links";
import { KIND_LABEL } from "../links/context";
import { Icon } from "./Icon";

const KIND_ICON: Record<NoteKind, string> = {
  personagens: "person",
  lugares: "pin",
  ideias: "bulb",
};

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

/**
 * Mundo: o universo do projeto num lugar só. Personagens, lugares e ideias
 * em cartões, com o começo da nota e em quantas cenas cada um aparece
 * (links [[…]] e menções do nome).
 */
export function WorldView({ session }: { session: Session }) {
  const change = useApp((s) => s.change);
  const openDoc = useApp((s) => s.openDoc);
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

  /** Quantas cenas ligam a cada nota. */
  const scenesOf = useMemo(() => {
    const g = buildGraph(project, texts, { mentions: true });
    const type = new Map(g.nodes.map((n) => [n.id, n.type]));
    const out = new Map<string, number>();
    for (const e of g.edges) {
      if (type.get(e.source) === "scene") out.set(e.target, (out.get(e.target) ?? 0) + 1);
      if (type.get(e.target) === "scene") out.set(e.source, (out.get(e.source) ?? 0) + 1);
    }
    return out;
  }, [project, texts]);

  const create = (kind: NoteKind) => {
    let id: string | null = null;
    void change(
      (p) => {
        const r = addNote(p, kind, KIND_LABEL[kind].new);
        id = r.note.id;
        return r;
      },
      async () => {
        if (id) openDoc(id);
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
            onClick={() => setTab(k)}
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
        <header className="world-head">
          <div>
            <h2>{label.many}</h2>
            <p className="muted">{project.title}: clique num cartão para abrir a nota.</p>
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
                  <button type="button" className="world-card" onClick={() => openDoc(n.id)}>
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
      </div>
    </div>
  );
}
