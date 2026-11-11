import type { Note, NoteKind } from "./types";

/*
 * Campos da ficha de cada tipo de nota (personagem, lugar…). Ficam em
 * `project.json` (`notes[].fields`), um texto por campo; campos de referência
 * guardam o id de outra nota (ex.: o lugar onde o personagem vive) e viram
 * ligação no Elo. O texto livre da nota (.md) continua sendo as anotações.
 */

export type FieldType = "text" | "long" | "ref" | "choice";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  /** Tipo de nota que um campo de referência aceita. */
  ref?: NoteKind;
  /** Opções de um campo de escolha (o texto escolhido é o valor gravado). */
  options?: string[];
  placeholder?: string;
  /** Dica curta embaixo do campo (ex.: um teste para o escritor). */
  hint?: string;
  /** Abre uma nova seção da ficha antes deste campo. */
  section?: { title: string; source?: string };
  /** Campo antigo: só aparece se já tiver valor (para não esconder o que foi escrito). */
  legacy?: boolean;
}

export const NOTE_FIELDS: Partial<Record<NoteKind, FieldDef[]>> = {
  personagens: [
    {
      key: "papel",
      label: "Papel na história",
      type: "choice",
      options: ["Protagonista", "Antagonista", "Coadjuvante"],
      section: { title: "1. Base" },
    },
    { key: "nomeCompleto", label: "Nome completo", type: "text" },
    { key: "apelidos", label: "Apelidos", type: "text" },
    { key: "idade", label: "Idade", type: "text", placeholder: "ex.: 17 anos" },
    { key: "genero", label: "Gênero", type: "text" },
    { key: "ocupacao", label: "Ocupação", type: "text" },
    { key: "local", label: "Onde vive", type: "ref", ref: "lugares" },
    { key: "organizacao", label: "Organização", type: "ref", ref: "organizacoes" },
    { key: "aparencia", label: "Aparência", type: "long" },
    {
      key: "objetivo",
      label: "Quer",
      type: "long",
      placeholder: "Concreto, visível em cena",
      section: { title: "2. Desejo", source: "o que quer, meta externa · Vonnegut, Truby" },
    },
    {
      key: "desejoCena",
      label: "Em uma cena comum, o que ele faz para conseguir isso?",
      type: "long",
    },
    {
      key: "mentira",
      label: "Acredita que",
      type: "long",
      section: { title: "3. Mentira", source: "o que acredita de errado · Weiland" },
    },
    { key: "mentiraDesejo", label: "O desejo acima nasce dessa mentira?", type: "long" },
    {
      key: "fantasma",
      label: "Evento do passado que fez a mentira parecer verdade",
      type: "long",
      hint: "Só o que influencia as escolhas atuais.",
      section: { title: "4. Fantasma", source: "de onde veio a mentira · Weiland" },
    },
    {
      key: "necessidade",
      label: "Precisa de / precisa aprender que",
      type: "long",
      hint: "Teste: ele consegue o desejo e a necessidade ao mesmo tempo? Se sim, falta conflito.",
      section: {
        title: "5. Necessidade",
        source: "a verdade que precisa aceitar · Weiland, Truby",
      },
    },
    {
      key: "fraquezaPsicologica",
      label: "Psicológica (só o machuca)",
      type: "long",
      section: { title: "6. Fraqueza", source: "Truby" },
    },
    { key: "fraquezaMoral", label: "Moral (machuca os outros)", type: "long" },
    {
      key: "oponente",
      label: "Quem ou o que ataca exatamente a fraqueza acima",
      type: "long",
      section: { title: "7. Oponente", source: "Truby" },
    },
    {
      key: "torcida",
      label: "Por que o leitor torce por ele?",
      type: "long",
      placeholder: "Uma qualidade que desperta simpatia",
      section: { title: "8. Torcida", source: "Vonnegut" },
    },
    {
      key: "contradicao",
      label: "Traço que não combina com o resto, mas convence",
      type: "long",
      section: { title: "9. Contradição", source: "Forster" },
    },
    {
      key: "acaoSurpresa",
      label: "Uma ação que surpreenderia o leitor e ainda faria sentido",
      type: "long",
    },
    {
      key: "voz",
      label: "Como fala",
      type: "long",
      placeholder: "Ritmo, vocabulário, o que evita dizer",
      hint: "Teste: sem o nome, dá para saber que é ele falando?",
      section: { title: "10. Voz" },
    },
    {
      key: "arcoTipo",
      label: "Tipo de arco",
      type: "choice",
      options: [
        "Positivo (Mentira → Verdade)",
        "Negativo (rejeita a Verdade e piora)",
        "Plano (já sabe a Verdade e muda o mundo ao redor)",
      ],
      section: { title: "11. Arco", source: "Weiland" },
    },
    { key: "arcoInicio", label: "Início", type: "long" },
    { key: "arcoVirada", label: "Ponto de virada", type: "long" },
    { key: "arcoFim", label: "Fim", type: "long" },
    {
      key: "funcaoQuer",
      label: "Quer",
      type: "long",
      hint: "Todo personagem quer algo, nem que seja um copo d’água.",
      section: { title: "12. Função", source: "para coadjuvantes" },
    },
    { key: "funcaoServe", label: "Serve à história para", type: "long" },
    // Campos da ficha anterior: aparecem só em quem já os preencheu.
    {
      key: "personalidade",
      label: "Personalidade",
      type: "long",
      legacy: true,
      section: { title: "Outros" },
    },
    { key: "conflito", label: "Medos e conflitos", type: "long", legacy: true },
    { key: "background", label: "Background", type: "long", legacy: true },
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

/**
 * Os campos que a ficha mostra: os antigos (`legacy`) só se tiverem valor. Se o
 * campo que abria uma seção some, a seção passa para o próximo campo dela.
 */
export function visibleFields(kind: NoteKind, values: Record<string, string>): FieldDef[] {
  const out: FieldDef[] = [];
  let pending: FieldDef["section"];
  for (const d of fieldsOf(kind)) {
    if (d.section) pending = d.section;
    if (d.legacy && !values[d.key]) continue;
    out.push(pending && !d.section ? { ...d, section: pending } : d);
    pending = undefined;
  }
  return out;
}

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
