import { useRef } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import { Icon } from "../ui/Icon";
import { useSettings } from "../state/settings";
import { useApp } from "../state/store";
import {
  BLOCK_STYLES,
  blockStyle,
  clearFormatting,
  MARKS,
  setBlockStyle,
  shortcut,
  toggleMark,
  type BlockStyle,
} from "./formatting";

export function Toolbar({
  editor,
  onAttach,
}: {
  editor: Editor | null;
  onAttach(files: File[]): void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            style: blockStyle(e),
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            strike: e.isActive("strike"),
            highlight: e.isActive("highlight"),
            bullet: e.isActive("bulletList"),
            ordered: e.isActive("orderedList"),
            quote: e.isActive("blockquote"),
          }
        : null,
  });
  const minimap = useSettings((s) => s.minimap);
  const setSettings = useSettings((s) => s.set);
  if (!editor || !state) return <div className="toolbar" />;
  const chain = () => editor.chain().focus();

  const blocks = [
    {
      id: "bullet",
      label: "Lista",
      icon: "list",
      on: state.bullet,
      run: () => chain().toggleBulletList().run(),
    },
    {
      id: "ordered",
      label: "Lista numerada",
      icon: "listOrdered",
      on: state.ordered,
      run: () => chain().toggleOrderedList().run(),
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
  ];

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatação">
      <select
        className="tool-select"
        aria-label="Estilo do parágrafo"
        value={state.style}
        onChange={(e) => setBlockStyle(editor, e.target.value as BlockStyle)}
      >
        {BLOCK_STYLES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
      <span className="toolbar-sep" />
      {MARKS.map((m) => (
        <ToolButton
          key={m.id}
          label={`${m.label} (${m.keys})`}
          icon={m.icon}
          on={state[m.id]}
          run={() => toggleMark(editor, m.id)}
        />
      ))}
      <span className="toolbar-sep" />
      {blocks.map((t) => (
        <ToolButton key={t.id} label={t.label} icon={t.icon} on={t.on} run={t.run} />
      ))}
      <ToolButton label="Limpar formatação" icon="clear" run={() => clearFormatting(editor)} />
      <span className="toolbar-sep" />
      <ToolButton
        label="Anexar arquivo (imagem, vídeo, áudio…). Também dá para arrastar ou colar no texto."
        icon="paperclip"
        run={() => fileInput.current?.click()}
      />
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          onAttach([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      <span className="toolbar-sep" />
      <ToolButton
        label={`Desfazer (${shortcut("Mod+Z")})`}
        icon="undo"
        run={() => editor.commands.undo()}
      />
      <ToolButton
        label={`Refazer (${shortcut("Mod+Shift+Z")})`}
        icon="redo"
        run={() => editor.commands.redo()}
      />
      <span className="toolbar-spacer" />
      <ToolButton
        label="Histórico de versões"
        icon="history"
        run={() => useApp.getState().setView("history")}
      />
      <ToolButton
        label={minimap ? "Esconder minimapa" : "Mostrar minimapa"}
        icon="graph"
        on={minimap}
        run={() => setSettings({ minimap: !minimap })}
      />
    </div>
  );
}

function ToolButton({
  label,
  icon,
  on,
  run,
}: {
  label: string;
  icon: string;
  on?: boolean;
  run: () => void;
}) {
  return (
    <button
      type="button"
      className="tool"
      title={label}
      aria-label={label}
      aria-pressed={on}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
    >
      <Icon name={icon} />
    </button>
  );
}
