import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
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
import { registerOpenEditor } from "../state/openEditors";
import { linkEdits } from "../links/links";
import { allDocs, findDoc } from "../manuscript/tree";
import { createLinksExtension, REFRESH_LINKS } from "./links";
import { createLinkContext } from "../links/context";
import { Toolbar } from "./Toolbar";
import { ContextMenu } from "./ContextMenu";
import { MiniMap } from "../ui/MiniMap";
import { useSettings } from "../state/settings";

const SAVE_DELAY_MS = 700;

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
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const minimap = useSettings((s) => s.minimap);
  const minimapPos = useSettings((s) => s.minimapPos);

  const editor = useEditor(
    {
      extensions: [
        ...textExtensions,
        Collaboration.configure({ document: doc, field: YDOC_FIELD }),
        Placeholder.configure({ placeholder: "Comece a escrever…" }),
        createLinksExtension(linkContext),
      ],
      editorProps: {
        attributes: {
          class: "prose",
          "aria-label": "Texto",
          spellcheck: "true",
          lang: "pt-BR",
        },
      },
      // Durante a criação o texto chega como uma atualização; quem cuida dele é o efeito abaixo.
      onUpdate: ({ editor }) => editor.isInitialized && setDocText(sceneId, editor.getText()),
    },
    [doc],
  );

  // O editor é criado durante a renderização: o texto inicial vai para o estado
  // do app depois dela (atualizar o app no meio da renderização gera aviso do React).
  useEffect(() => {
    if (editor) setDocText(sceneId, editor.getText());
  }, [editor, sceneId, setDocText]);

  // Títulos mudaram (nota criada ou renomeada): redesenha os links do texto.
  const titles = useApp((s) =>
    s.session
      ? allDocs(s.session.project)
          .map((d) => d.title)
          .join("\n")
      : "",
  );
  useEffect(() => {
    if (editor && !editor.isDestroyed)
      editor.view.dispatch(editor.state.tr.setMeta(REFRESH_LINKS, true));
  }, [editor, titles]);

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
      void serial(async () => doc.destroy());
    };
  }, [editor, doc, loaded, session.fs, sceneId, setSaveState]);

  return (
    <>
      <Toolbar editor={editor} />
      <div className={"page-wrap" + (minimap ? " mm-" + minimapPos : "")}>
        <div
          className="page"
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
