import { useDeferredValue, useEffect, useMemo, useRef } from "react";
import { useApp, type Session } from "../state/store";
import { useSearch } from "../state/search";
import { searchProject, snippet } from "../search/search";
import { formatCount } from "../manuscript/wordCount";
import { KIND_LABEL } from "../links/context";
import { shortcut } from "../editor/formatting";
import { Icon } from "./Icon";

const KIND_ICON = { scene: "file", personagens: "person", lugares: "pin", ideias: "bulb" };
/** Trechos mostrados por texto antes do "mais N". */
const MAX_SNIPPETS = 30;

/** Busca no projeto inteiro (Ctrl+Shift+F), no lugar das listas da barra lateral. */
export function SearchPanel({ session, onOpen }: { session: Session; onOpen: () => void }) {
  const openDoc = useApp((s) => s.openDoc);
  const { query, exact, wholeWord, focusNonce, set, close, goTo } = useSearch();
  const input = useRef<HTMLInputElement>(null);
  const deferred = useDeferredValue(query);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, [focusNonce]);

  const results = useMemo(
    () => searchProject(session.project, session.texts, deferred, { exact, wholeWord }),
    [session.project, session.texts, deferred, exact, wholeWord],
  );
  const total = results.reduce((n, r) => n + r.hits.length, 0);
  const chapterOf = useMemo(
    () => new Map(session.project.chapters.flatMap((c) => c.scenes.map((s) => [s.id, c.title]))),
    [session.project],
  );

  const open = (docId: string, index: number) => {
    openDoc(docId);
    goTo(docId, index);
    onOpen();
  };

  return (
    <div className="search" role="search">
      <div className="search-head">
        <div className="search-field">
          <Icon name="search" size={16} />
          <input
            ref={input}
            type="search"
            value={query}
            placeholder="Buscar no projeto"
            aria-label="Buscar no projeto"
            spellCheck={false}
            onChange={(e) => set({ query: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
              if (e.key === "Enter" && results[0]) open(results[0].doc.id, 0);
            }}
          />
          <button
            type="button"
            className={"search-opt" + (exact ? " on" : "")}
            aria-pressed={exact}
            title="Diferenciar maiúsculas e acentos"
            aria-label="Diferenciar maiúsculas e acentos"
            onClick={() => set({ exact: !exact })}
          >
            Aa
          </button>
          <button
            type="button"
            className={"search-opt" + (wholeWord ? " on" : "")}
            aria-pressed={wholeWord}
            title="Só palavras inteiras"
            aria-label="Só palavras inteiras"
            onClick={() => set({ wholeWord: !wholeWord })}
          >
            <u>ab</u>
          </button>
        </div>
        <button
          type="button"
          className="icon-btn"
          title={`Fechar busca (Esc)`}
          aria-label="Fechar busca"
          onClick={close}
        >
          <Icon name="close" />
        </button>
      </div>

      <p className="search-summary" role="status" aria-live="polite">
        {!deferred.trim()
          ? `Procura em todas as cenas e notas. Atalho: ${shortcut("Mod+Shift+F")}.`
          : results.length === 0
            ? "Nada encontrado."
            : `${formatCount(total)} ${total === 1 ? "resultado" : "resultados"} em ${results.length} ${results.length === 1 ? "texto" : "textos"}`}
      </p>

      <ol className="search-results">
        {results.map((r) => {
          const texts = session.texts[r.doc.id] ?? "";
          const where =
            r.doc.type === "scene" ? chapterOf.get(r.doc.id) : KIND_LABEL[r.doc.type].one;
          return (
            <li key={r.doc.id}>
              <button
                type="button"
                className={"search-doc" + (r.doc.id === session.activeDocId ? " active" : "")}
                onClick={() => open(r.doc.id, 0)}
              >
                <Icon name={KIND_ICON[r.doc.type]} size={15} />
                <span className="search-doc-title">{r.doc.title}</span>
                <span className="search-doc-where">{where}</span>
                {r.hits.length > 0 && <span className="search-count">{r.hits.length}</span>}
              </button>
              <ol className="search-snippets">
                {r.hits.slice(0, MAX_SNIPPETS).map((h, i) => {
                  const s = snippet(texts, h);
                  return (
                    <li key={h.from}>
                      <button type="button" onClick={() => open(r.doc.id, i)}>
                        {s.before}
                        <mark>{s.match}</mark>
                        {s.after}
                      </button>
                    </li>
                  );
                })}
                {r.hits.length > MAX_SNIPPETS && (
                  <li className="search-more">
                    e mais {formatCount(r.hits.length - MAX_SNIPPETS)} neste texto
                  </li>
                )}
              </ol>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
