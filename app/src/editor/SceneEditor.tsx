import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
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
        Não foi possível abrir esta cena. Verifique se os arquivos do projeto ainda estão na pasta.
      </div>
    );
  }
  if (!loaded) return <div className="editor-state" aria-busy="true" />;
  return <LoadedEditor key={sceneId} loaded={loaded} session={session} sceneId={sceneId} />;
}

function LoadedEditor({ loaded, session, sceneId }: Props & { loaded: LoadedScene }) {
  const { doc } = loaded;
  const setSaveState = useApp((s) => s.setSaveState);
  const setSceneWords = useApp((s) => s.setSceneWords);
  const timer = useRef<number | undefined>(undefined);
  const dirty = useRef(false);
  /** O que o app sabe que está no .md agora (para notar mudanças feitas por fora). */
  const diskText = useRef(loaded.diskText);

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
    if (!editor) return;

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
          if (project && findScene(project, sceneId)) {
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
          await useApp.getState().keepExternalCopy(sceneId, err.diskText);
          diskText.current = err.diskText;
          return save(false);
        }
        console.error(err);
        setSaveState("error");
        throw err;
      }
    };

    /** Ao voltar para o app, confere se o .md mudou por fora. */
    const checkDisk = async () => {
      const project = useApp.getState().session?.project;
      if (!project || !findScene(project, sceneId)) return;
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

    // O .md foi alterado fora do app desde a última gravação: aplica como edição.
    if (loaded.external) editor.commands.setContent(loaded.external);

    return () => {
      unregister();
      doc.off("update", onUpdate);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("beforeunload", saveQuietly);
      saveQuietly();
      void serial(async () => doc.destroy());
    };
  }, [editor, doc, loaded, session.fs, sceneId, setSaveState]);

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
