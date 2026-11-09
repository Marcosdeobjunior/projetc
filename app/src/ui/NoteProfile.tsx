import { useEffect, useRef, useState } from "react";
import { useApp, type Session } from "../state/store";
import { findDoc, setNoteImage } from "../manuscript/tree";
import type { Note } from "../manuscript/types";
import { DOC_ICON, KIND_LABEL } from "../links/context";
import { attachmentUrl } from "../editor/attachments";
import { Icon } from "./Icon";

const KIND_ICON = DOC_ICON;

/** Imagem de anexos/ como blob: (ou null enquanto carrega / se sumiu). */
export function useAttachmentImage(src: string | undefined) {
  // Guarda de qual arquivo é a URL: trocou o arquivo, a antiga deixa de valer.
  const [loaded, setLoaded] = useState<{ src: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!src) return;
    let alive = true;
    void attachmentUrl(src).then((url) => alive && setLoaded({ src, url }));
    return () => {
      alive = false;
    };
  }, [src]);
  return src && loaded?.src === src ? loaded.url : null;
}

/**
 * Página própria de uma nota do Mundo (personagem, lugar ou ideia): imagem,
 * nome, o texto da ficha, as cenas em que aparece e as notas ligadas a ela.
 */
export function NoteProfile({
  session,
  note,
  links,
  onBack,
  onOpenNote,
}: {
  session: Session;
  note: Note;
  /** Ids dos textos ligados a esta nota (links e menções). */
  links: string[];
  onBack(): void;
  onOpenNote(id: string): void;
}) {
  const change = useApp((s) => s.change);
  const openDoc = useApp((s) => s.openDoc);
  const addAttachments = useApp((s) => s.addAttachments);
  const image = useAttachmentImage(note.image);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { project, texts, attachments } = session;
  const label = KIND_LABEL[note.kind];
  const missing = note.image ? !attachments.includes(note.image.slice("anexos/".length)) : false;

  const scenes = links
    .map((id) => findDoc(project, id))
    .filter((d): d is NonNullable<typeof d> => !!d && d.type === "scene");
  const related = links
    .map((id) => project.notes.find((n) => n.id === id))
    .filter((n): n is Note => !!n);
  const text = (texts[note.id] ?? "").replace(
    /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_, a: string, b?: string) => b ?? a,
  );
  const paragraphs = text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const pickImage = async (files: File[]) => {
    const file = files.find((f) => f.type.startsWith("image/"));
    if (!file) return;
    setBusy(true);
    try {
      const [added] = await addAttachments([file]);
      if (added) void change((p) => setNoteImage(p, note.id, added.src));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="profile">
      <button type="button" className="link-btn profile-back" onClick={onBack}>
        <Icon name="chevron-left" size={15} /> {label.many}
      </button>

      <div className="profile-main">
        <div className="profile-photo">
          <div
            className={"profile-image" + (image ? "" : " empty")}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void pickImage([...e.dataTransfer.files]);
            }}
          >
            {image ? (
              <img src={image} alt={`Imagem de ${note.title}`} />
            ) : (
              <span>
                <Icon name={KIND_ICON[note.kind]} size={36} />
                <small>
                  {missing
                    ? "A imagem não está mais em anexos/."
                    : "Sem imagem. Escolha uma ou arraste para cá."}
                </small>
              </span>
            )}
          </div>
          <div className="profile-photo-actions">
            <button
              type="button"
              className="btn ghost sm"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              <Icon name="image" size={14} /> {note.image ? "Trocar imagem" : "Escolher imagem"}
            </button>
            {note.image && (
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => void change((p) => setNoteImage(p, note.id, null))}
              >
                Tirar
              </button>
            )}
          </div>
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml"
            hidden
            onChange={(e) => {
              void pickImage([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
        </div>

        <div className="profile-info">
          <p className="kicker">
            <Icon name={KIND_ICON[note.kind]} size={13} /> {label.one}
          </p>
          <h2>{note.title}</h2>
          <div className="profile-stats">
            <span>
              <b>{scenes.length}</b> {scenes.length === 1 ? "cena" : "cenas"}
            </span>
            <span>
              <b>{related.length}</b> {related.length === 1 ? "nota ligada" : "notas ligadas"}
            </span>
          </div>
          <div className="profile-text">
            {paragraphs.length ? (
              paragraphs.map((p, i) => <p key={i}>{p}</p>)
            ) : (
              <p className="muted">A ficha ainda está vazia.</p>
            )}
          </div>
          <button type="button" className="btn sm" onClick={() => openDoc(note.id)}>
            <Icon name="edit" size={14} /> Editar a ficha
          </button>
        </div>
      </div>

      <div className="profile-lists">
        <section>
          <h3>Aparece em</h3>
          {scenes.length === 0 ? (
            <p className="muted small">
              Nenhuma cena ainda. Escreva o nome “{note.title}” numa cena ou use [[{note.title}]].
            </p>
          ) : (
            <ul>
              {scenes.map((s) => (
                <li key={s.id}>
                  <button type="button" className="profile-link" onClick={() => openDoc(s.id)}>
                    <Icon name="file" size={14} /> {s.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h3>Ligado a</h3>
          {related.length === 0 ? (
            <p className="muted small">Nenhuma outra nota.</p>
          ) : (
            <ul>
              {related.map((n) => (
                <li key={n.id}>
                  <button type="button" className="profile-link" onClick={() => onOpenNote(n.id)}>
                    <Icon name={KIND_ICON[n.kind]} size={14} /> {n.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
