import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import { Icon } from "../ui/Icon";
import { countWords, formatCount } from "../manuscript/wordCount";
import { NOTE_KINDS, type NoteKind } from "../manuscript/types";
import { KIND_LABEL } from "../links/context";
import type { LinkContext } from "./links";
import { clearFormatting, MARKS, shortcut, toggleMark } from "./formatting";

interface Props {
  editor: Editor;
  links: LinkContext;
  x: number;
  y: number;
  onClose(): void;
}

const ITEMS = '[role^="menuitem"]';
const MAX_TITLE = 80;

/**
 * Menu de ações rápidas ao clicar com o botão direito num trecho selecionado.
 * Sem seleção (ou com Shift), fica o menu normal do sistema, que tem a correção
 * ortográfica.
 */
export function ContextMenu({ editor, links, x, y, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      strike: e.isActive("strike"),
      highlight: e.isActive("highlight"),
      heading: e.isActive("heading"),
      quote: e.isActive("blockquote"),
      list: e.isActive("bulletList"),
    }),
  });

  // Mantém o menu dentro da janela e já deixa o primeiro item pronto para o teclado.
  useLayoutEffect(() => {
    const el = ref.current!;
    const r = el.getBoundingClientRect();
    setPos({
      left: Math.max(8, Math.min(x, window.innerWidth - r.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)),
    });
    el.querySelector<HTMLElement>(ITEMS)?.focus({ preventScroll: true });
  }, [x, y]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onClose();
      editor.commands.focus();
    };
    const close = () => onClose();
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    document.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
  }, [editor, onClose]);

  const { from, to, $from, $to } = editor.state.selection;
  const text = editor.state.doc.textBetween(from, to, "\n", "\n");
  const title = text.trim();
  // Só vira link ou nota um trecho curto, numa linha só e sem colchetes.
  const linkable =
    title.length > 0 &&
    title.length <= MAX_TITLE &&
    !/[\n[\]|]/.test(title) &&
    $from.sameParent($to);
  const existing = linkable ? links.resolve(title) : null;

  const act = (fn: () => void) => () => {
    onClose();
    fn();
  };
  const chain = () => editor.chain().focus();
  const clipboard = (cmd: "cut" | "copy") => {
    editor.commands.focus();
    document.execCommand(cmd);
  };
  /** Troca o trecho selecionado por [[trecho]]. */
  const wrapInLink = () => {
    const start = from + (text.length - text.trimStart().length);
    const end = to - (text.length - text.trimEnd().length);
    chain()
      .command(({ tr }) => {
        tr.insertText(`[[${title}]]`, start, end);
        return true;
      })
      .run();
  };
  const createNote = (kind: NoteKind) => {
    wrapInLink();
    void links.createNote(title, kind);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const items = [...ref.current!.querySelectorAll<HTMLElement>(ITEMS)];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const step: Record<string, number> = {
      ArrowDown: 1,
      ArrowRight: 1,
      ArrowUp: -1,
      ArrowLeft: -1,
    };
    let next: number | null = null;
    if (e.key in step) next = (i + step[e.key]! + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    else if (e.key === "Tab") onClose();
    if (next === null) return;
    e.preventDefault();
    items[next]!.focus();
  };

  const words = countWords(text);

  return (
    <div
      ref={ref}
      className="ctx-menu"
      role="menu"
      aria-label="Ações para o trecho selecionado"
      style={pos}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="ctx-marks" role="group" aria-label="Formatação">
        {MARKS.map((m) => (
          <button
            key={m.id}
            type="button"
            role="menuitemcheckbox"
            aria-checked={active[m.id]}
            className="tool"
            title={`${m.label} (${m.keys})`}
            aria-label={m.label}
            onClick={act(() => toggleMark(editor, m.id))}
          >
            <Icon name={m.icon} />
          </button>
        ))}
      </div>
      <div className="menu-sep" />
      <Item
        icon="cut"
        label="Recortar"
        keys={shortcut("Mod+X")}
        run={act(() => clipboard("cut"))}
      />
      <Item
        icon="copy"
        label="Copiar"
        keys={shortcut("Mod+C")}
        run={act(() => clipboard("copy"))}
      />
      <div className="menu-sep" />
      <Item
        icon="heading"
        label="Título"
        checked={active.heading}
        run={act(() => chain().toggleHeading({ level: 2 }).run())}
      />
      <Item
        icon="quote"
        label="Citação"
        checked={active.quote}
        run={act(() => chain().toggleBlockquote().run())}
      />
      <Item
        icon="list"
        label="Lista"
        checked={active.list}
        run={act(() => chain().toggleBulletList().run())}
      />
      {linkable && (
        <>
          <div className="menu-sep" />
          {existing ? (
            <>
              <Item icon="link" label="Transformar em link [[…]]" run={act(wrapInLink)} />
              <Item icon="file" label={`Abrir “${title}”`} run={act(() => links.open(existing))} />
            </>
          ) : (
            <>
              <div className="menu-label">Criar nota “{title}”</div>
              {NOTE_KINDS.map((kind) => (
                <Item
                  key={kind}
                  icon={KIND_ICON[kind]}
                  label={KIND_LABEL[kind].one}
                  run={act(() => createNote(kind))}
                />
              ))}
            </>
          )}
        </>
      )}
      <div className="menu-sep" />
      <Item icon="clear" label="Limpar formatação" run={act(() => clearFormatting(editor))} />
      <div className="ctx-foot" aria-live="polite">
        {formatCount(words)} {words === 1 ? "palavra selecionada" : "palavras selecionadas"}
      </div>
    </div>
  );
}

const KIND_ICON: Record<NoteKind, string> = {
  personagens: "person",
  lugares: "pin",
  ideias: "bulb",
};

function Item({
  icon,
  label,
  keys,
  checked,
  run,
}: {
  icon: string;
  label: string;
  keys?: string;
  checked?: boolean;
  run: () => void;
}) {
  return (
    <button
      type="button"
      role={checked === undefined ? "menuitem" : "menuitemcheckbox"}
      aria-checked={checked}
      className={"ctx-item" + (checked ? " on" : "")}
      onClick={run}
    >
      <Icon name={icon} size={16} />
      <span className="ctx-label">{label}</span>
      {keys && <kbd>{keys}</kbd>}
      {checked && <Icon name="check" size={14} />}
    </button>
  );
}
