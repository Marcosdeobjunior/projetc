import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import Collaboration from "@tiptap/extension-collaboration";
import { Placeholder } from "@tiptap/extensions";
import type * as Y from "yjs";
import { textExtensions, YDOC_FIELD } from "./extensions";
import { loadSceneDoc, saveScene } from "../vault/vault";
import { serial, useApp, type Session } from "../state/store";
import { countWords } from "../manuscript/wordCount";
import { findScene } from "../manuscript/tree";
import { Icon } from "../ui/Icon";

const SAVE_DELAY_MS = 700;

interface Props {
  session: Session;
  sceneId: string;
}

/** Carrega a cena do vault e mostra o editor. Use `key={sceneId}`: uma instância por cena. */
export function SceneEditor({ session, sceneId }: Props) {
  const [doc, setDoc] = useState<Y.Doc | null>(null);
  const [failed, setFailed] = useState(false);
  const { fs, root } = session;

  useEffect(() => {
    let cancelled = false;
    serial(() => loadSceneDoc(fs, useApp.getState().session!.project, sceneId))
      .then((d) => {
        if (cancelled) d.destroy();
        else setDoc(d);
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
        Não foi possível abrir esta cena. Verifique se os arquivos do projeto ainda estão na pasta.
      </div>
    );
  }
  if (!doc) return <div className="editor-state" aria-busy="true" />;
  return <LoadedEditor key={sceneId} doc={doc} session={session} sceneId={sceneId} />;
}

function LoadedEditor({ doc, session, sceneId }: Props & { doc: Y.Doc }) {
  const setSaveState = useApp((s) => s.setSaveState);
  const setSceneWords = useApp((s) => s.setSceneWords);
  const timer = useRef<number | undefined>(undefined);
  const dirty = useRef(false);

  const editor = useEditor(
    {
      extensions: [
        ...textExtensions,
        Collaboration.configure({ document: doc, field: YDOC_FIELD }),
        Placeholder.configure({ placeholder: "Comece a escrever…" }),
      ],
      editorProps: {
        attributes: {
          class: "prose",
          "aria-label": "Texto da cena",
          spellcheck: "true",
          lang: "pt-BR",
        },
      },
      onCreate: ({ editor }) => setSceneWords(sceneId, countWords(editor.getText())),
      onUpdate: ({ editor }) => setSceneWords(sceneId, countWords(editor.getText())),
    },
    [doc],
  );

  useEffect(() => {
    const save = () => {
      window.clearTimeout(timer.current);
      if (!dirty.current) return;
      dirty.current = false;
      setSaveState("saving");
      serial(async () => {
        const project = useApp.getState().session?.project;
        // A cena pode ter sido excluída enquanto estava aberta.
        if (project && findScene(project, sceneId)) {
          await saveScene(session.fs, project, sceneId, doc);
        }
      })
        .then(() => setSaveState(dirty.current ? "saving" : "saved"))
        .catch((err) => {
          console.error(err);
          dirty.current = true;
          setSaveState("error");
        });
    };
    const onUpdate = () => {
      dirty.current = true;
      setSaveState("saving");
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(save, SAVE_DELAY_MS);
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") save();
    };
    doc.on("update", onUpdate);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", save);
    return () => {
      doc.off("update", onUpdate);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", save);
      save();
      void serial(async () => doc.destroy());
    };
  }, [doc, session.fs, sceneId, setSaveState]);

  return (
    <>
      <Toolbar editor={editor} />
      <div
        className="page"
        onClick={(e) => e.target === e.currentTarget && editor?.commands.focus("end")}
      >
        <EditorContent editor={editor} className="page-body" />
      </div>
    </>
  );
}

function Toolbar({ editor }: { editor: Editor | null }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            heading: e.isActive("heading", { level: 2 }),
            quote: e.isActive("blockquote"),
          }
        : null,
  });
  if (!editor || !state) return <div className="toolbar" />;
  const chain = () => editor.chain().focus();

  const tools = [
    {
      id: "bold",
      label: "Negrito (Ctrl+B)",
      icon: "bold",
      on: state.bold,
      run: () => chain().toggleBold().run(),
    },
    {
      id: "italic",
      label: "Itálico (Ctrl+I)",
      icon: "italic",
      on: state.italic,
      run: () => chain().toggleItalic().run(),
    },
    {
      id: "heading",
      label: "Subtítulo",
      icon: "heading",
      on: state.heading,
      run: () => chain().toggleHeading({ level: 2 }).run(),
    },
    {
      id: "quote",
      label: "Citação",
      icon: "quote",
      on: state.quote,
      run: () => chain().toggleBlockquote().run(),
    },
    {
      id: "break",
      label: "Separador de cena (* * *)",
      icon: "separator",
      on: false,
      run: () => chain().setHorizontalRule().run(),
    },
  ] as const;

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatação">
      {tools.map((t) => (
        <button
          key={t.id}
          type="button"
          className="tool"
          title={t.label}
          aria-label={t.label}
          aria-pressed={t.on}
          onMouseDown={(e) => e.preventDefault()}
          onClick={t.run}
        >
          <Icon name={t.icon} />
        </button>
      ))}
      <span className="toolbar-sep" />
      <button
        type="button"
        className="tool"
        title="Desfazer (Ctrl+Z)"
        aria-label="Desfazer"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.commands.undo()}
      >
        <Icon name="undo" />
      </button>
      <button
        type="button"
        className="tool"
        title="Refazer (Ctrl+Shift+Z)"
        aria-label="Refazer"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.commands.redo()}
      >
        <Icon name="redo" />
      </button>
    </div>
  );
}
