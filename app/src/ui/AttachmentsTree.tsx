import { useRef, useState } from "react";
import { useApp, type Session } from "../state/store";
import { useSettings } from "../state/settings";
import { activeEditor } from "../state/openEditors";
import {
  ATTACHMENTS_DIR,
  attachmentKind,
  insertAttachments,
  KIND_ICON,
  openAttachment,
} from "../editor/attachments";
import { SectionToggle, ConfirmRow } from "./ManuscriptTree";
import { Icon } from "./Icon";

/** Arquivos da pasta anexos/: inserir no texto aberto, abrir ou mandar para a lixeira. */
export function AttachmentsTree({ session }: { session: Session }) {
  const addAttachments = useApp((s) => s.addAttachments);
  const removeAttachment = useApp((s) => s.removeAttachment);
  const open = !useSettings((s) => s.collapsed.includes("anexos"));
  const toggleSection = useSettings((s) => s.toggleSection);
  const [confirming, setConfirming] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const editing = session.view === "editor" && session.activeDocId !== null;

  const insert = (name: string) => {
    const editor = activeEditor();
    if (editor) insertAttachments(editor, [{ src: `${ATTACHMENTS_DIR}/${name}`, name }]);
  };

  return (
    <nav className="tree" aria-label="Anexos">
      <div className="tree-head">
        <SectionToggle id="anexos" label="Anexos" />
        <button
          type="button"
          className="icon-btn"
          title="Adicionar arquivos ao projeto"
          aria-label="Adicionar arquivos ao projeto"
          onClick={() => input.current?.click()}
        >
          <Icon name="plus" />
        </button>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (!open) toggleSection("anexos");
            void addAttachments([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
      </div>
      {open && (
        <ol className="scenes attachments">
          {session.attachments.map((name) =>
            confirming === name ? (
              <li key={name}>
                <ConfirmRow
                  text={`Mandar "${name}" para a lixeira?`}
                  detail="Os textos que usam este arquivo vão mostrar que ele sumiu."
                  onYes={() => {
                    setConfirming(null);
                    void removeAttachment(name);
                  }}
                  onNo={() => setConfirming(null)}
                />
              </li>
            ) : (
              <li key={name} className="row scene-row">
                <button
                  type="button"
                  className="row-title scene-open"
                  title={editing ? "Inserir no texto aberto" : "Abrir o arquivo"}
                  onClick={() =>
                    editing ? insert(name) : openAttachment(`${ATTACHMENTS_DIR}/${name}`)
                  }
                >
                  <Icon name={KIND_ICON[attachmentKind(name)]} size={15} />
                  <span>{name}</span>
                </button>
                <span className="row-actions">
                  <button
                    type="button"
                    className="icon-btn sm"
                    title="Abrir no programa padrão"
                    aria-label={`Abrir ${name}`}
                    onClick={() => openAttachment(`${ATTACHMENTS_DIR}/${name}`)}
                  >
                    <Icon name="expand" size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn sm danger"
                    title="Mandar para a lixeira"
                    aria-label={`Mandar ${name} para a lixeira`}
                    onClick={() => setConfirming(name)}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </span>
              </li>
            ),
          )}
          {session.attachments.length === 0 && (
            <li className="empty-chapter muted">
              Arraste ou cole arquivos no texto, ou use o clipe na barra de ferramentas.
            </li>
          )}
        </ol>
      )}
    </nav>
  );
}
