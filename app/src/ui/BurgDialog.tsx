import { useMemo, useRef, useState, type PointerEvent } from "react";
import type { Note } from "../manuscript/types";
import type { Burg, Derived } from "../world/worldgen";
import { generateVillage } from "../world/village";
import { generateEmblem, parseEmblemOptions } from "../world/heraldry";
import { hashSeed } from "../world/geom";
import {
  ELEMENTS,
  GROUPS,
  groupFor,
  SETTLEMENT_TYPES,
  settlementInfo,
  sizeFor,
  type ElementKey,
} from "../world/settlement";
import { validNoteImage } from "../vault/vault";
import { PlaceMap } from "./PlaceMap";
import { EmblemArt } from "./EmblemArt";
import { Icon } from "./Icon";
import { Select } from "./Select";
import { useAttachmentImage } from "./NoteProfile";

const newSeed = () => Math.floor(Math.random() * 2 ** 32);

/**
 * "Editar povoado": janela flutuante sobre o mapa-múndi ao clicar numa cidade.
 * Os dados ficam nos campos do lugar ligado (a mesma ficha do Mundo).
 */
export function BurgDialog({
  burg,
  note,
  capital,
  stateName,
  heights,
  derived,
  attachments,
  onClose,
  onRename,
  onCapital,
  onDelete,
  onOpenNote,
  onFields,
}: {
  burg: Burg;
  note: Note | undefined;
  capital: boolean;
  stateName: string | null;
  heights: Uint8Array;
  derived: Derived;
  attachments: string[];
  onClose(): void;
  onRename(name: string): void;
  onCapital(on: boolean): void;
  onDelete(): void;
  onOpenNote(): void;
  onFields(patch: Record<string, string>): void;
}) {
  const noteFields = note?.fields;
  const fields = noteFields ?? {};
  const info = useMemo(
    () => settlementInfo(burg, capital, heights, derived, noteFields ?? {}),
    [burg, capital, heights, derived, noteFields],
  );
  const preview = useMemo(() => generateVillage(info.preview), [info.preview]);
  const [pos, setPos] = useState({ x: 140, y: 12 });
  const [min, setMin] = useState(false);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  // Brasão do lugar: a imagem própria, ou o gerado (o mesmo da ficha).
  const emblemSeed = parseEmblemOptions(fields.brasao)?.seed ?? hashSeed(note?.title ?? burg.name);
  const emblem = useMemo(() => generateEmblem({ seed: emblemSeed, kind: "brasao" }), [emblemSeed]);
  const custom = fields.brasaoImagem;
  const customOk =
    validNoteImage(custom) && attachments.includes(custom.slice("anexos/".length))
      ? custom
      : undefined;
  const customUrl = useAttachmentImage(customOk);

  /** Muda elementos: grava a lista e as opções da prévia juntas. */
  const toggle = (k: ElementKey) => {
    if (k === "capital") return onCapital(!capital);
    const next = new Set(info.elements);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    next.delete("capital");
    const preview = {
      ...info.preview,
      walls: next.has("muralhas"),
      citadel: next.has("cidadela"),
      plaza: next.has("praca"),
      temple: next.has("templo"),
      shanty: next.has("favela"),
    };
    onFields({ elementos: [...next].join(","), mapa: JSON.stringify(preview) });
  };
  const setPopulation = (raw: string) => {
    const n = Math.max(1, Math.round(Number(raw.replace(/[^\d]/g, "")) || 0));
    if (!n || n === info.population) return;
    const patch: Record<string, string> = {
      populacao: String(n),
      mapa: JSON.stringify({ ...info.preview, size: sizeFor(n) }),
    };
    // O grupo acompanha a população, a não ser que tenha sido escolhido à mão.
    if (!fields.grupo) patch.grupo = groupFor(n);
    onFields(patch);
  };

  const onDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
  };
  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (d)
      setPos({ x: Math.max(0, d.px + e.clientX - d.x), y: Math.max(0, d.py + e.clientY - d.y) });
  };

  return (
    <div
      className={"burg-dialog" + (min ? " min" : "")}
      style={{ left: pos.x, top: pos.y }}
      role="dialog"
      aria-label="Editar povoado"
    >
      <header
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={() => (drag.current = null)}
      >
        <h2>Editar povoado</h2>
        <button
          type="button"
          aria-label="Gerar outra prévia"
          title="Gerar outra prévia"
          onClick={() => onFields({ mapa: JSON.stringify({ ...info.preview, seed: newSeed() }) })}
        >
          <Icon name="refresh" size={14} />
        </button>
        <button
          type="button"
          aria-label={min ? "Mostrar" : "Minimizar"}
          title={min ? "Mostrar" : "Minimizar"}
          onClick={() => setMin((v) => !v)}
        >
          <Icon name={min ? "plus" : "minus"} size={14} />
        </button>
        <button type="button" aria-label="Fechar" title="Fechar" onClick={onClose}>
          <Icon name="close" size={14} />
        </button>
      </header>
      {!min && (
        <div className="burg-body">
          <div className="burg-top">
            <div className="burg-emblem">
              {customOk ? (
                customUrl && <img src={customUrl} alt="" />
              ) : (
                <EmblemArt emblem={emblem} title={burg.name} />
              )}
            </div>
            <div className="burg-fields">
              <p className="burg-where">
                {[stateName, capital ? "capital" : null].filter(Boolean).join(", ") || "Sem estado"}
              </p>
              <label>
                <span>Nome</span>
                <input
                  className="text-input"
                  key={burg.id + burg.name}
                  defaultValue={burg.name}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== burg.name) onRename(v);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                />
              </label>
              <label>
                <span>Grupo</span>
                <Select
                  value={info.group}
                  options={GROUPS.map((g) => ({ value: g, label: g }))}
                  onChange={(v) => onFields({ grupo: v })}
                />
              </label>
              <label>
                <span>Tipo</span>
                <Select
                  value={info.type}
                  options={SETTLEMENT_TYPES.map((g) => ({ value: g, label: g }))}
                  onChange={(v) => onFields({ tipoPovoado: v })}
                />
              </label>
              <label>
                <span>Cultura</span>
                <input
                  className="text-input"
                  key={"c" + info.culture}
                  defaultValue={info.culture}
                  placeholder="ex.: Elladan"
                  onBlur={(e) =>
                    e.target.value.trim() !== info.culture &&
                    onFields({ cultura: e.target.value.trim() })
                  }
                />
              </label>
              <label>
                <span>População</span>
                <input
                  className="text-input"
                  inputMode="numeric"
                  key={"p" + info.population}
                  defaultValue={info.population.toLocaleString("pt-BR")}
                  onBlur={(e) => setPopulation(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                />
              </label>
              <p className="burg-stat">
                <span>Temperatura</span>
                {info.tempC}°C
              </p>
              <p className="burg-stat">
                <span>Elevação</span>
                {info.elevation.toLocaleString("pt-BR")} m acima do nível do mar
              </p>
            </div>
          </div>
          <div className="burg-elements" role="group" aria-label="Elementos">
            <span>Elementos</span>
            <div>
              {ELEMENTS.map((el) => (
                <button
                  key={el.key}
                  type="button"
                  aria-pressed={info.elements.has(el.key)}
                  className={info.elements.has(el.key) ? "on" : ""}
                  onClick={() => toggle(el.key)}
                >
                  {el.label}
                </button>
              ))}
            </div>
          </div>
          <label className="burg-tags">
            <span>Etiquetas</span>
            <input
              className="text-input"
              key={"t" + info.tags}
              defaultValue={info.tags}
              placeholder="Etiquetas, separadas por vírgula"
              onBlur={(e) =>
                e.target.value.trim() !== info.tags &&
                onFields({ etiquetas: e.target.value.trim() })
              }
            />
          </label>
          <div className="burg-preview">
            <div className="burg-preview-head">
              <span>Prévia do povoado</span>
              <button
                type="button"
                className="link-btn"
                onClick={onOpenNote}
                title="Abrir a ficha, com o mapa grande e a vista de rua"
              >
                Ver na ficha
              </button>
            </div>
            <PlaceMap map={preview} name={burg.name} />
          </div>
          <footer>
            <button type="button" className="btn ghost sm" onClick={onOpenNote}>
              <Icon name="file" size={14} /> Abrir ficha
            </button>
            <button type="button" className="btn ghost sm danger" onClick={onDelete}>
              <Icon name="trash" size={14} /> Excluir
            </button>
          </footer>
        </div>
      )}
    </div>
  );
}
