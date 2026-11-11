import { useEffect, useRef, useState } from "react";
import { useApp, type Session } from "../state/store";
import {
  addNoteImages,
  findDoc,
  noteImages,
  removeNoteImage,
  setMainNoteImage,
} from "../manuscript/tree";
import type { Note } from "../manuscript/types";
import { DOC_ICON, KIND_LABEL } from "../links/context";
import { attachmentUrl } from "../editor/attachments";
import { Icon } from "./Icon";
import { CalendarEditor } from "./CalendarEditor";
import { EmblemPanel, PlaceRegion } from "./PlaceRegion";
import { CharacterPanel, FieldSectionNav, NoteFields } from "./NoteFields";
import { BirthEditor, TravelEditor, useYearLength } from "./ContinuityEditors";
import { useTimeline } from "../state/timeline";
import { ageOn } from "../timeline/timeline";

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
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { project, texts, attachments } = session;
  const label = KIND_LABEL[note.kind];
  // Todas as imagens (a principal primeiro); a grande mostra a escolhida na galeria.
  const gallery = noteImages(note);
  const [viewing, setViewing] = useState<string | null>(null);
  const shown = viewing && gallery.includes(viewing) ? viewing : (gallery[0] ?? undefined);
  const image = useAttachmentImage(shown);
  const missing = shown ? !attachments.includes(shown.slice("anexos/".length)) : false;

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

  const timeline = useTimeline((t) => t.data);
  const { yearLen } = useYearLength();
  /** "Dia 12 · 17 anos" ao lado de cada cena (quando há data e nascimento). */
  const sceneInfo = (sceneId: string) => {
    const d = timeline.scenes[sceneId];
    if (!d) return "";
    const birth = note.kind === "personagens" ? timeline.births[note.id] : undefined;
    const age = birth === undefined ? null : ageOn(birth, d.day, yearLen);
    return `Dia ${d.day}` + (age !== null ? ` · ${age} ${age === 1 ? "ano" : "anos"}` : "");
  };

  const pickImages = async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
    setBusy(true);
    try {
      const added = await addAttachments(images);
      if (added.length) {
        const srcs = added.map((a) => a.src);
        void change((p) => addNoteImages(p, note.id, srcs));
        setViewing(srcs[0]!);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="profile">
      <button type="button" className="link-btn profile-back" onClick={onBack}>
        <Icon name="chevron-left" size={15} /> {label.many}
      </button>

      <div className="profile-layout">
        <div className="profile-photo">
          <div
            className={"profile-image" + (image ? "" : " empty")}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void pickImages([...e.dataTransfer.files]);
            }}
          >
            {image ? (
              <img src={image} alt={`Imagem de ${note.title}`} />
            ) : shown && !missing ? (
              <span />
            ) : (
              <span>
                <Icon name={KIND_ICON[note.kind]} size={36} />
                <small>
                  {missing
                    ? "A imagem não está mais em anexos/."
                    : "Sem imagem. Escolha uma ou mais, ou arraste para cá."}
                </small>
              </span>
            )}
          </div>
          {gallery.length > 1 && (
            <ul className="profile-thumbs" aria-label="Imagens da ficha">
              {gallery.map((src, i) => (
                <li key={src}>
                  <Thumb
                    src={src}
                    active={src === shown}
                    main={i === 0}
                    onClick={() => setViewing(src)}
                  />
                </li>
              ))}
            </ul>
          )}
          <div className="profile-photo-actions">
            <button
              type="button"
              className="btn ghost sm"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              <Icon name="image" size={14} />{" "}
              {gallery.length ? "Adicionar imagens" : "Escolher imagens"}
            </button>
            {shown && gallery[0] !== shown && (
              <button
                type="button"
                className="btn ghost sm"
                title="Esta passa a ser a imagem do cartão"
                onClick={() => void change((p) => setMainNoteImage(p, note.id, shown))}
              >
                Tornar principal
              </button>
            )}
            {shown && (
              <button
                type="button"
                className="btn ghost sm"
                title="Tira da ficha (o arquivo continua em Anexos)"
                onClick={() => void change((p) => removeNoteImage(p, note.id, shown))}
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
            multiple
            onChange={(e) => {
              void pickImages([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
          {(note.kind === "lugares" || note.kind === "organizacoes") && (
            <EmblemPanel
              note={note}
              attachments={attachments}
              addImage={async (file) => (await addAttachments([file]))[0]?.src ?? null}
            />
          )}
          <FieldSectionNav note={note} />
        </div>

        <div className="profile-info">
          <p className="kicker">
            <Icon name={KIND_ICON[note.kind]} size={13} /> {label.one}
            {note.fields?.papel && <span className="profile-role">{note.fields.papel}</span>}
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
          {note.kind === "lugares" && <PlaceRegion note={note} />}
          <NoteFields note={note} project={project} onOpenNote={onOpenNote} />
          {note.kind === "calendarios" && <CalendarEditor noteId={note.id} />}
          {note.kind === "personagens" && <BirthEditor note={note} />}
          {note.kind === "lugares" && (
            <TravelEditor note={note} places={project.notes.filter((n) => n.kind === "lugares")} />
          )}
        </div>

        <aside className="profile-aside">
          {note.kind === "personagens" && <CharacterPanel note={note} />}
          <section className="profile-card profile-notes">
            <div className="profile-notes-head">
              <h3>Anotações</h3>
              <button type="button" className="btn ghost sm" onClick={() => openDoc(note.id)}>
                <Icon name="edit" size={14} /> Editar anotações
              </button>
            </div>
            <div className="profile-text">
              {paragraphs.length ? (
                paragraphs.map((p, i) => <p key={i}>{p}</p>)
              ) : (
                <p className="muted">Sem anotações. Use para o que não cabe nos campos.</p>
              )}
            </div>
          </section>

          <section className="profile-card profile-list">
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
                      {sceneInfo(s.id) && (
                        <small className="profile-link-meta">{sceneInfo(s.id)}</small>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="profile-card profile-list">
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
        </aside>
      </div>
    </div>
  );
}

/** Miniatura de uma imagem da galeria da ficha. */
function Thumb({
  src,
  active,
  main,
  onClick,
}: {
  src: string;
  active: boolean;
  main: boolean;
  onClick(): void;
}) {
  const url = useAttachmentImage(src);
  return (
    <button
      type="button"
      className={"profile-thumb" + (active ? " active" : "")}
      aria-pressed={active}
      title={main ? "Imagem principal (a do cartão)" : "Ver esta imagem"}
      onClick={onClick}
    >
      {url ? <img src={url} alt="" /> : <Icon name="image" size={16} />}
      {main && <span className="profile-thumb-main">Principal</span>}
    </button>
  );
}
