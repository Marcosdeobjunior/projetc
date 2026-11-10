import type { Note, NoteKind } from "./types";

/*
 * Campos da ficha de cada tipo de nota (personagem, lugar…). Ficam em
 * `project.json` (`notes[].fields`), um texto por campo; campos de referência
 * guardam o id de outra nota (ex.: o lugar onde o personagem vive) e viram
 * ligação no Elo. O texto livre da nota (.md) continua sendo as anotações.
 */

export type FieldType = "text" | "long" | "ref";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  /** Tipo de nota que um campo de referência aceita. */
  ref?: NoteKind;
  placeholder?: string;
}

export const NOTE_FIELDS: Partial<Record<NoteKind, FieldDef[]>> = {
  personagens: [
    { key: "nomeCompleto", label: "Nome completo", type: "text" },
    { key: "apelidos", label: "Apelidos", type: "text" },
    { key: "idade", label: "Idade", type: "text", placeholder: "ex.: 17 anos" },
    { key: "genero", label: "Gênero", type: "text" },
    { key: "ocupacao", label: "Ocupação", type: "text" },
    { key: "local", label: "Onde vive", type: "ref", ref: "lugares" },
    { key: "organizacao", label: "Organização", type: "ref", ref: "organizacoes" },
    { key: "aparencia", label: "Aparência", type: "long" },
    { key: "personalidade", label: "Personalidade", type: "long" },
    { key: "objetivo", label: "Objetivo", type: "long", placeholder: "O que quer" },
    { key: "conflito", label: "Medos e conflitos", type: "long" },
    {
      key: "background",
      label: "Background",
      type: "long",
      placeholder: "História até o livro começar",
    },
  ],
  lugares: [
    { key: "tipo", label: "Tipo", type: "text", placeholder: "cidade, floresta, castelo…" },
    { key: "regiao", label: "Fica em", type: "ref", ref: "lugares" },
    { key: "governo", label: "Quem governa", type: "ref", ref: "organizacoes" },
    { key: "populacao", label: "População", type: "text" },
    { key: "clima", label: "Clima", type: "text" },
    { key: "descricao", label: "Descrição", type: "long", placeholder: "Como é, cheiros, sons" },
    { key: "historia", label: "História", type: "long" },
  ],
  organizacoes: [
    { key: "tipo", label: "Tipo", type: "text", placeholder: "reino, guilda, família, ordem…" },
    { key: "lider", label: "Líder", type: "ref", ref: "personagens" },
    { key: "sede", label: "Sede", type: "ref", ref: "lugares" },
    { key: "objetivo", label: "Objetivo", type: "long" },
    { key: "membros", label: "Membros", type: "long" },
    { key: "historia", label: "História", type: "long" },
  ],
  idiomas: [
    { key: "falantes", label: "Falado por", type: "text" },
    { key: "regiao", label: "Onde se fala", type: "ref", ref: "lugares" },
    {
      key: "escrita",
      label: "Escrita",
      type: "text",
      placeholder: "alfabeto, runas, sem escrita…",
    },
    { key: "exemplos", label: "Palavras e frases", type: "long" },
    { key: "regras", label: "Regras", type: "long" },
  ],
  ideias: [
    { key: "tipo", label: "Tipo", type: "text", placeholder: "trama, tema, cena…" },
    { key: "status", label: "Situação", type: "text", placeholder: "rascunho, usada, descartada" },
  ],
};

export const fieldsOf = (kind: NoteKind): FieldDef[] => NOTE_FIELDS[kind] ?? [];

/** Ids de outras notas citadas nos campos de referência. */
export function fieldRefs(note: Note): string[] {
  const f = note.fields;
  if (!f) return [];
  return fieldsOf(note.kind)
    .filter((d) => d.type === "ref" && f[d.key])
    .map((d) => f[d.key]!);
}

const MAX_KEYS = 60;
const MAX_LEN = 20_000;

/** Confere os campos vindos do disco ou do Drive (só textos, tamanhos limitados). */
export function sanitizeFields(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, MAX_KEYS)) {
    if (/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(k) && typeof v === "string" && v.trim())
      out[k] = v.slice(0, MAX_LEN);
  }
  return Object.keys(out).length ? out : undefined;
}

/** Junta os campos de dois computadores campo a campo (o que mudou de um lado vale). */
export function mergeFields(
  base: Record<string, string> | undefined,
  local: Record<string, string> | undefined,
  remote: Record<string, string> | undefined,
): Record<string, string> | undefined {
  const keys = new Set([...Object.keys(local ?? {}), ...Object.keys(remote ?? {})]);
  const out: Record<string, string> = {};
  for (const k of keys) {
    const b = base?.[k];
    const l = local?.[k];
    const r = remote?.[k];
    const v = l === b ? r : l;
    if (v) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}
