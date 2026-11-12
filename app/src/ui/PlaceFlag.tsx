import { useMemo } from "react";
import type { Note } from "../manuscript/types";
import { EmblemArt } from "./EmblemArt";
import { useAttachmentImage } from "./NoteProfile";
import { generateEmblem, parseEmblemOptions } from "../world/heraldry";
import { hashSeed } from "../world/geom";
import { validNoteImage } from "../vault/vault";

/**
 * Bandeira do lugar (ou organização): a imagem que o autor enviou, ou a bandeira
 * padrão gerada pelo mapa (a mesma da ficha e do mapa-múndi).
 */
export function PlaceFlag({
  note,
  attachments,
  title,
}: {
  note: Note | undefined;
  attachments: string[];
  /** Nome usado quando não há lugar ligado. */
  title?: string;
}) {
  const fields = note?.fields ?? {};
  const name = note?.title ?? title ?? "";
  const custom = fields.bandeiraImagem;
  const ok =
    validNoteImage(custom) && attachments.includes(custom.slice("anexos/".length))
      ? custom
      : undefined;
  const url = useAttachmentImage(ok);
  const seed = parseEmblemOptions(fields.bandeira)?.seed ?? hashSeed(name + "#bandeira");
  const emblem = useMemo(() => generateEmblem({ seed, kind: "bandeira" }), [seed]);
  return ok ? (
    url ? (
      <img src={url} alt={`Bandeira de ${name}`} />
    ) : null
  ) : (
    <EmblemArt emblem={emblem} title={name} />
  );
}
