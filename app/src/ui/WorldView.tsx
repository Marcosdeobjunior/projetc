import { useMemo } from "react";
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

  return (
    <div className="world">
      <header className="world-head">
        <h2>Mundo de {project.title}</h2>
        <p className="muted">
          Os personagens, lugares e ideias do livro. Clique num cartão para abrir a nota.
        </p>
      </header>
      {NOTE_KINDS.map((kind) => {
        const notes = project.notes
          .filter((n) => n.kind === kind)
          .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
        const label = KIND_LABEL[kind];
        return (
          <section key={kind} className="world-group" aria-labelledby={`world-${kind}`}>
            <div className="world-group-head">
              <h3 id={`world-${kind}`}>
                <Icon name={KIND_ICON[kind]} size={16} /> {label.many}
                <span className="world-count">{notes.length}</span>
              </h3>
              <button type="button" className="btn ghost sm" onClick={() => create(kind)}>
                <Icon name="plus" size={14} /> {label.new}
              </button>
            </div>
            {notes.length === 0 ? (
              <p className="muted small">Nenhum ainda.</p>
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
          </section>
        );
      })}
    </div>
  );
}
