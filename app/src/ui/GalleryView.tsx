import { useEffect, useRef, useState } from "react";
import { useApp, type Session } from "../state/store";
import {
  ATTACHMENTS_DIR,
  attachmentKind,
  attachmentUrl,
  KIND_ICON,
  openAttachment,
  type AttachmentKind,
} from "../editor/attachments";
import { Icon } from "./Icon";

const FILTERS: { id: AttachmentKind | "all"; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "image", label: "Imagens" },
  { id: "video", label: "Vídeos" },
  { id: "audio", label: "Áudios" },
  { id: "file", label: "Outros" },
];

/** Miniatura de uma imagem da pasta anexos/ (carregada sob demanda). */
function Thumb({ name }: { name: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void attachmentUrl(`${ATTACHMENTS_DIR}/${name}`).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [name]);
  return url ? (
    <img src={url} alt="" loading="lazy" draggable={false} />
  ) : (
    <Icon name="image" size={28} />
  );
}

/** Anexos do projeto em galeria: imagens em miniatura, o resto como cartão. */
export function GalleryView({ session }: { session: Session }) {
  const addAttachments = useApp((s) => s.addAttachments);
  const removeAttachment = useApp((s) => s.removeAttachment);
  const [filter, setFilter] = useState<AttachmentKind | "all">("all");
  const [confirming, setConfirming] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const files = session.attachments.filter((n) => filter === "all" || attachmentKind(n) === filter);

  return (
    <div className="gallery">
      <header className="gallery-head">
        <div>
          <h2>Anexos</h2>
          <p className="muted">
            Imagens, vídeos, áudios e outros arquivos do projeto (pasta <code>anexos/</code>).
          </p>
        </div>
        <button type="button" className="btn sm" onClick={() => input.current?.click()}>
          <Icon name="plus" size={14} /> Adicionar arquivos
        </button>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            void addAttachments([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
      </header>

      <div className="gallery-filters" role="radiogroup" aria-label="Tipo de arquivo">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="radio"
            className="chip"
            aria-checked={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {files.length === 0 ? (
        <p className="muted gallery-empty">
          {session.attachments.length === 0
            ? "Nenhum anexo ainda. Adicione arquivos aqui, ou arraste e cole no texto."
            : "Nenhum arquivo desse tipo."}
        </p>
      ) : (
        <ul className="gallery-grid">
          {files.map((name) => {
            const kind = attachmentKind(name);
            const src = `${ATTACHMENTS_DIR}/${name}`;
            return (
              <li key={name} className="gallery-item">
                <button
                  type="button"
                  className="gallery-open"
                  title="Abrir no programa padrão"
                  onClick={() => openAttachment(src)}
                >
                  <span className={"gallery-media " + kind}>
                    {kind === "image" ? (
                      <Thumb name={name} />
                    ) : (
                      <Icon name={KIND_ICON[kind]} size={28} />
                    )}
                  </span>
                  <span className="gallery-name">{name}</span>
                </button>
                {confirming === name ? (
                  <div className="gallery-confirm">
                    <span>Excluir? Vai para a Lixeira.</span>
                    <button
                      type="button"
                      className="link-btn danger"
                      onClick={() => {
                        setConfirming(null);
                        void removeAttachment(name);
                      }}
                    >
                      Sim
                    </button>
                    <button type="button" className="link-btn" onClick={() => setConfirming(null)}>
                      Não
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="icon-btn sm danger gallery-delete"
                    title="Excluir (vai para a Lixeira)"
                    aria-label={`Excluir ${name}`}
                    onClick={() => setConfirming(name)}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
