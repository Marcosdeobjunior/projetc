import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import Collaboration from "@tiptap/extension-collaboration";
import { Placeholder } from "@tiptap/extensions";
import { textExtensions, YDOC_FIELD } from "./extensions";
import {
  ExternalChangeError,
  loadSceneDoc,
  readSceneFile,
  sameText,
  saveScene,
  type LoadedScene,
} from "../vault/vault";
import { parseMarkdown } from "../markdown/parse";
import { useApp, type Session } from "../state/store";
import { registerFlush, serial } from "../state/writes";
import { registerOpenEditor, setActiveEditor } from "../state/openEditors";
import { insertAttachments } from "./attachments";
import { linkEdits } from "../links/links";
import { allDocs, findDoc, findScene } from "../manuscript/tree";
import { countWords } from "../manuscript/wordCount";
import { useWriting } from "../state/writing";
import { createLinksExtension, REFRESH_LINKS } from "./links";
import { Icon } from "../ui/Icon";
import { NoteQuickEdit } from "./NoteQuickEdit";
import { useWorldNav } from "../state/worldNav";
import { createLinkContext } from "../links/context";
import { Toolbar } from "./Toolbar";
import { textStyleVars } from "./textStyle";
import { CommentAnchors, REFRESH_COMMENTS } from "./commentAnchors";
import { CommentComposer, CommentsPanel, startComment, type Draft } from "./Comments";
import { useComments } from "../state/comments";
import { ContextMenu } from "./ContextMenu";
import { REFRESH_SEARCH, SearchHighlight, searchHits } from "./searchHighlight";
import { useSearch } from "../state/search";
import { MiniMap } from "../ui/MiniMap";
import { useSettings } from "../state/settings";

const SAVE_DELAY_MS = 700;
/** Espera para atualizar contagem de palavras, links e busca enquanto digita. */
const TEXT_DELAY_MS = 300;

/**
 * Quantos editores estão usando cada documento agora. Em modo de desenvolvimento
 * o React desmonta e monta de novo na hora; o documento só é liberado quando
 * ninguém mais usa (destruir antes faria o texto parar de ser salvo).
 */
const liveDocs = new WeakMap<object, number>();

interface Props {
  session: Session;
  sceneId: string;
}

/**
 * Carrega uma cena ou nota do vault e mostra o editor.
 * Use `key={sceneId}`: uma instância por texto aberto.
 */
export function DocEditor({ session, sceneId }: Props) {
  const [loaded, setLoaded] = useState<LoadedScene | null>(null);
  const [failed, setFailed] = useState(false);
  const { fs, root } = session;

  useEffect(() => {
    let cancelled = false;
    serial(() => loadSceneDoc(fs, useApp.getState().session!.project, sceneId))
      .then((d) => {
        if (cancelled) d.doc.destroy();
        else setLoaded(d);
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setFailed(true);
      });
    // O doc carregado é liberado pelo LoadedEditor, depois da última gravação.
    return () => {
      cancelled = true;
    };
  }, [fs, root, sceneId]);

  if (failed) {
    return (
      <div className="editor-state" role="alert">
        Não foi possível abrir este texto. Verifique se os arquivos do projeto ainda estão na pasta.
      </div>
    );
  }
  if (!loaded) return <div className="editor-state" aria-busy="true" />;
  return <LoadedEditor key={sceneId} loaded={loaded} session={session} sceneId={sceneId} />;
}

function LoadedEditor({ loaded, session, sceneId }: Props & { loaded: LoadedScene }) {
  const { doc } = loaded;
  const setSaveState = useApp((s) => s.setSaveState);
  const setDocText = useApp((s) => s.setDocText);
  const linkContext = useMemo(() => createLinkContext(sceneId), [sceneId]);
  const timer = useRef<number | undefined>(undefined);
  const dirty = useRef(false);
  /** O que o app sabe que está no .md agora (para notar mudanças feitas por fora). */
  const diskText = useRef(loaded.diskText);
  const textTimer = useRef<number | undefined>(undefined);
  /** Palavras do texto na última contagem, para o calendário de escrita. */
  const lastWords = useRef<number | null>(null);
  /** Soma ao calendário de escrita as palavras novas (só em cenas do manuscrito). */
  const countWritten = (text: string) => {
    const n = countWords(text);
    const before = lastWords.current;
    lastWords.current = n;
    const project = useApp.getState().session?.project;
    if (before === null || !project || !findScene(project, sceneId)) return;
    useWriting.getState().add(n - before);
  };
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const minimap = useSettings((s) => s.minimap);
  const editorRef = useRef<Editor | null>(null);
  /** Copia os arquivos para anexos/ e insere no texto (na posição, se dada). */
  const attach = async (files: File[], at?: number) => {
    const added = await useApp.getState().addAttachments(files);
    const ed = editorRef.current;
    if (ed && !ed.isDestroyed && added.length) insertAttachments(ed, added, at);
  };
  const minimapPos = useSettings((s) => s.minimapPos);
  const textStyle = useSettings((s) => s.textStyle);
  const textVars = useMemo(() => textStyleVars(textStyle), [textStyle]);
  const [draft, setDraft] = useState<Draft | null>(null);
  /** Cartão de nome e tipo ao passar o mouse numa menção ou link. */
  const [hoverCard, setHoverCard] = useState<{
    id: string;
    title: string;
    label: string;
    icon: string;
    note: boolean;
    x: number;
    y: number;
  } | null>(null);
  /** O cartão espera um pouco antes de sumir, para o mouse chegar até ele. */
  const cardTimer = useRef<number | undefined>(undefined);
  const hideCardSoon = () => {
    window.clearTimeout(cardTimer.current);
    cardTimer.current = window.setTimeout(() => setHoverCard(null), 250);
  };
  /** Nota aberta na edição rápida (sem sair do texto). */
  const [quick, setQuick] = useState<{ id: string; title: string; x: number; y: number } | null>(
    null,
  );
  const closeQuick = useCallback(() => setQuick(null), []);
  /** Abre a ficha da nota no Mundo (ou a cena, se for cena). */
  const openProfile = (id: string, note: boolean) => {
    setHoverCard(null);
    setQuick(null);
    if (!note) return useApp.getState().openDoc(id);
    useWorldNav.getState().setOpenId(id);
    useApp.getState().setView("world");
  };
  const closeDraft = useCallback(() => setDraft(null), []);
  const commentsOpen = useComments((s) => s.panelOpen);

  const editor = useEditor(
    {
      extensions: [
        ...textExtensions,
        Collaboration.configure({ document: doc, field: YDOC_FIELD }),
        Placeholder.configure({ placeholder: "Comece a escrever…" }),
        createLinksExtension(linkContext),
        SearchHighlight,
        CommentAnchors.configure({
          comments: () => useComments.getState().comments,
          focused: () => useComments.getState().focused,
        }),
      ],
      editorProps: {
        // Arquivos soltos ou colados no texto viram anexos.
        handleDrop: (view, event, _slice, moved) => {
          const files = [...(event.dataTransfer?.files ?? [])];
          if (moved || files.length === 0) return false;
          event.preventDefault();
          const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
          void attach(files, at);
          return true;
        },
        // Passar o mouse numa menção ou link mostra nome e tipo (Personagem, Lugar…).
        handleDOMEvents: {
          mouseover: (_view, event) => {
            const el = (event.target as HTMLElement).closest?.<HTMLElement>(
              ".mention[data-doc], .wikilink[data-doc]:not(.unresolved)",
            );
            if (!el || !el.dataset.doc) return false;
            const info = linkContext.describe(el.dataset.doc);
            if (!info) return false;
            window.clearTimeout(cardTimer.current);
            const r = el.getBoundingClientRect();
            setHoverCard({ ...info, id: el.dataset.doc, x: r.left, y: r.bottom });
            return false;
          },
          mouseout: (_view, event) => {
            const to = event.relatedTarget as HTMLElement | null;
            if (to?.closest?.(".mention, .wikilink, .mention-card")) return false;
            hideCardSoon();
            return false;
          },
        },
        // Clicar num trecho comentado mostra o comentário na lista.
        handleClick: (_view, _pos, event) => {
          const el = (event.target as HTMLElement).closest?.("[data-comment]");
          if (el) {
            const c = useComments.getState();
            c.focus(el.getAttribute("data-comment"));
            c.setPanel(true);
          }
          return false;
        },
        // Ctrl/⌘ + Alt + M: comentar o trecho selecionado.
        handleKeyDown: (_view, event) => {
          if ((event.ctrlKey || event.metaKey) && event.altKey && event.code === "KeyM") {
            const ed = editorRef.current;
            const d = ed ? startComment(ed) : null;
            if (d) setDraft(d);
            return true;
          }
          return false;
        },
        handlePaste: (_view, event) => {
          const files = [...(event.clipboardData?.files ?? [])];
          if (files.length === 0) return false;
          event.preventDefault();
          void attach(files);
          return true;
        },
        attributes: {
          class: "prose",
          "aria-label": "Texto",
          spellcheck: "true",
          lang: "pt-BR",
        },
      },
      // Durante a criação o texto chega como uma atualização; quem cuida dele é o efeito abaixo.
      // A contagem de palavras e o texto para links/busca esperam uma pausa na
      // digitação: atualizar a cada tecla redesenharia o app inteiro.
      onUpdate: ({ editor }) => {
        if (!editor.isInitialized) return;
        window.clearTimeout(textTimer.current);
        textTimer.current = window.setTimeout(() => {
          if (editor.isDestroyed) return;
          const text = editor.getText();
          setDocText(sceneId, text);
          countWritten(text);
        }, TEXT_DELAY_MS);
      },
    },
    [doc],
  );

  // Comentários da cena: carrega ao abrir e redesenha os trechos quando a lista muda.
  useEffect(() => {
    void useComments.getState().load(sceneId);
  }, [sceneId]);
  useEffect(() => {
    if (!editor) return;
    return useComments.subscribe((s, prev) => {
      if (s.comments === prev.comments && s.focused === prev.focused) return;
      if (!editor.isDestroyed)
        editor.view.dispatch(editor.state.tr.setMeta(REFRESH_COMMENTS, true));
    });
  }, [editor]);

  useEffect(() => {
    editorRef.current = editor;
    setActiveEditor(editor);
    return () => setActiveEditor(null);
  }, [editor]);

  // O editor é criado durante a renderização: o texto inicial vai para o estado
  // do app depois dela (atualizar o app no meio da renderização gera aviso do React).
  useEffect(() => {
    if (!editor) return;
    setDocText(sceneId, editor.getText());
    lastWords.current = countWords(editor.getText());
    // Ao sair do texto, a contagem fica com o que foi digitado por último.
    const timer = textTimer;
    return () => {
      window.clearTimeout(timer.current);
      if (!editor.isDestroyed) setDocText(sceneId, editor.getText());
    };
  }, [editor, sceneId, setDocText]);

  // Títulos mudaram (nota criada ou renomeada): redesenha os links do texto.
  const project = useApp((s) => s.session?.project);
  const titles = useMemo(
    () =>
      project
        ? allDocs(project)
            .map((d) => d.title)
            .join("\n")
        : "",
    [project],
  );
  useEffect(() => {
    if (editor && !editor.isDestroyed)
      editor.view.dispatch(editor.state.tr.setMeta(REFRESH_LINKS, true));
  }, [editor, titles]);

  // Busca: redesenha os destaques e, ao clicar num resultado, seleciona a ocorrência.
  useEffect(() => {
    if (!editor) return;
    const sync = (s = useSearch.getState()) => {
      if (editor.isDestroyed) return;
      editor.view.dispatch(editor.state.tr.setMeta(REFRESH_SEARCH, true));
      if (s.target?.docId !== sceneId) return;
      const hits = searchHits(editor.state.doc);
      const hit = hits[s.target.index] ?? hits[0];
      useSearch.getState().clearTarget();
      if (hit) editor.chain().focus().setTextSelection(hit).scrollIntoView().run();
    };
    sync();
    return useSearch.subscribe((s, prev) => {
      if (
        s.open !== prev.open ||
        s.query !== prev.query ||
        s.exact !== prev.exact ||
        s.wholeWord !== prev.wholeWord ||
        (s.target && s.target !== prev.target)
      )
        sync(s);
    });
  }, [editor, sceneId]);

  useEffect(() => {
    if (!editor) return;
    liveDocs.set(doc, (liveDocs.get(doc) ?? 0) + 1);

    /** Grava agora o que estiver pendente. Rejeita se a gravação falhar. */
    const save = async (retry = true): Promise<void> => {
      window.clearTimeout(timer.current);
      if (!dirty.current) return;
      dirty.current = false;
      setSaveState("saving");
      try {
        await serial(async () => {
          const project = useApp.getState().session?.project;
          // A cena pode ter sido excluída enquanto estava aberta.
          if (project && findDoc(project, sceneId)) {
            const r = await saveScene(session.fs, project, sceneId, doc, diskText.current);
            diskText.current = r.written;
          }
        });
        setSaveState(dirty.current ? "saving" : "saved");
      } catch (err) {
        dirty.current = true;
        if (err instanceof ExternalChangeError && retry) {
          // Os dois lados mudaram: guarda a versão de fora como outra cena e
          // depois grava a versão do editor no arquivo original.
          // Só grava por cima depois que a versão de fora foi guardada.
          if (await useApp.getState().keepExternalCopy(sceneId, err.diskText)) {
            diskText.current = err.diskText;
            return save(false);
          }
        }
        console.error(err);
        setSaveState("error");
        throw err;
      }
    };

    /** Ao voltar para o app, confere se o .md mudou por fora. */
    const checkDisk = async () => {
      const project = useApp.getState().session?.project;
      if (!project || !findDoc(project, sceneId)) return;
      const disk = await serial(() => readSceneFile(session.fs, project, sceneId));
      if (disk === null || sameText(disk, diskText.current)) return;
      if (dirty.current) {
        await save().catch(() => undefined);
      } else {
        // Só mudou por fora: traz o texto novo para o editor como uma edição.
        diskText.current = disk;
        editor.commands.setContent(parseMarkdown(disk));
      }
    };
    const saveQuietly = () => void save().catch(() => undefined);
    const onUpdate = () => {
      dirty.current = true;
      setSaveState("saving");
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(saveQuietly, SAVE_DELAY_MS);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") saveQuietly();
      else void checkDisk();
    };
    const onFocus = () => void checkDisk();
    doc.on("update", onUpdate);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("beforeunload", saveQuietly);
    const unregister = registerFlush(() => save());
    // Um texto foi renomeado: troca os [[links]] deste texto como uma edição normal.
    const unregisterOpen = registerOpenEditor(sceneId, (oldTitle, newTitle) => {
      const edits: { from: number; to: number }[] = [];
      editor.state.doc.descendants((node, pos) => {
        if (!node.isText) return;
        for (const e of linkEdits(node.text!, oldTitle)) {
          edits.push({ from: pos + e.from, to: pos + e.to });
        }
      });
      if (edits.length === 0) return 0;
      const tr = editor.state.tr;
      for (const e of edits.sort((a, b) => b.from - a.from)) tr.insertText(newTitle, e.from, e.to);
      editor.view.dispatch(tr);
      return edits.length;
    });

    // O .md foi alterado fora do app desde a última gravação: aplica como edição.
    if (loaded.external) editor.commands.setContent(loaded.external);

    return () => {
      unregister();
      unregisterOpen();
      doc.off("update", onUpdate);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("beforeunload", saveQuietly);
      saveQuietly();
      liveDocs.set(doc, liveDocs.get(doc)! - 1);
      void serial(async () => {
        if (liveDocs.get(doc) === 0) doc.destroy();
      });
    };
  }, [editor, doc, loaded, session.fs, sceneId, setSaveState]);

  return (
    <>
      <Toolbar
        editor={editor}
        onAttach={(files) => void attach(files)}
        onComment={() => {
          const d = editor ? startComment(editor) : null;
          if (d) setDraft(d);
        }}
      />
      <div className={"editor-split" + (commentsOpen ? " with-comments" : "")}>
        <div className={"page-wrap" + (minimap ? " mm-" + minimapPos : "")}>
          <div
            className="page"
            style={textVars}
            onClick={(e) => e.target === e.currentTarget && editor?.commands.focus("end")}
          >
            <EditorContent
              editor={editor}
              className="page-body"
              onContextMenu={(e) => {
                // Sem seleção ou com Shift: menu do sistema (com a correção ortográfica).
                if (!editor || e.shiftKey || editor.state.selection.empty) return;
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY });
              }}
            />
          </div>
          {minimap && <MiniMap session={session} docId={sceneId} />}
        </div>
        {commentsOpen && <CommentsPanel editor={editor} />}
      </div>
      {draft && <CommentComposer draft={draft} onClose={closeDraft} />}
      {hoverCard && (
        <div
          className="mention-card"
          role="dialog"
          aria-label={hoverCard.title}
          style={{
            left: Math.min(hoverCard.x, window.innerWidth - 300),
            top: hoverCard.y + 6,
          }}
          onMouseEnter={() => window.clearTimeout(cardTimer.current)}
          onMouseLeave={hideCardSoon}
        >
          <button
            type="button"
            className="mention-card-main"
            title={hoverCard.note ? "Abrir a ficha" : "Abrir a cena"}
            onClick={() => openProfile(hoverCard.id, hoverCard.note)}
          >
            <Icon name={hoverCard.icon} size={15} />
            <span>
              <b>{hoverCard.title}</b>
              <small>{hoverCard.label}</small>
            </span>
          </button>
          {hoverCard.note && (
            <button
              type="button"
              className="icon-btn sm"
              title="Edição rápida, sem sair do texto"
              aria-label={`Editar ${hoverCard.title} aqui`}
              onClick={() => {
                setQuick({
                  id: hoverCard.id,
                  title: hoverCard.title,
                  x: hoverCard.x,
                  y: hoverCard.y,
                });
                setHoverCard(null);
              }}
            >
              <Icon name="edit" size={14} />
            </button>
          )}
        </div>
      )}
      {quick && (
        <NoteQuickEdit
          noteId={quick.id}
          title={quick.title}
          x={quick.x}
          y={quick.y}
          onClose={closeQuick}
          onOpenProfile={() => openProfile(quick.id, true)}
        />
      )}
      {menu && editor && (
        <ContextMenu
          editor={editor}
          links={linkContext}
          x={menu.x}
          y={menu.y}
          onClose={closeMenu}
        />
      )}
    </>
  );
}
