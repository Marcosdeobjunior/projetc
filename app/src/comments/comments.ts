import type { VaultFs } from "../platform/types";
import { commentsPath } from "../vault/paths";

/*
 * Comentários no manuscrito. Cada cena tem um arquivo
 * `.talia/comentarios/<id-da-cena>.json`. O trecho comentado é guardado como
 * duas posições relativas do Yjs (início e fim, em base64): elas acompanham o
 * texto quando ele é editado antes, dentro ou depois do trecho, e também
 * depois de mesclar edições no sync. O trecho original (`quote`) fica junto,
 * para mostrar o comentário mesmo se o texto comentado for apagado.
 */

export interface Comment {
  id: string;
  /** O que a pessoa escreveu. */
  text: string;
  /** O trecho do texto no momento do comentário. */
  quote: string;
  /** Posições relativas do Yjs (Y.encodeRelativePosition em base64). */
  from: string;
  to: string;
  createdAt: number;
  /** Resolvido: some do texto, mas continua na lista. */
  resolved: boolean;
}

interface CommentsFile {
  format: 1;
  comments: Comment[];
}

const str = (v: unknown, max = 20_000) => (typeof v === "string" ? v.slice(0, max) : "");

/** Confere cada comentário lido do disco (o arquivo pode vir de fora ou do Drive). */
export function sanitizeComments(raw: unknown): Comment[] {
  const list = (raw as Partial<CommentsFile> | null)?.comments;
  if (!Array.isArray(list)) return [];
  const out: Comment[] = [];
  const seen = new Set<string>();
  for (const c of list as Partial<Comment>[]) {
    if (!c || typeof c !== "object") continue;
    const id = str(c.id, 64);
    const from = str(c.from, 2000);
    const to = str(c.to, 2000);
    if (!id || !from || !to || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      text: str(c.text),
      quote: str(c.quote, 2000),
      from,
      to,
      createdAt: typeof c.createdAt === "number" && Number.isFinite(c.createdAt) ? c.createdAt : 0,
      resolved: c.resolved === true,
    });
  }
  return out;
}

export async function readComments(fs: VaultFs, sceneId: string): Promise<Comment[]> {
  const raw = await fs.readText(commentsPath(sceneId));
  if (!raw) return [];
  try {
    return sanitizeComments(JSON.parse(raw));
  } catch {
    // Arquivo danificado: não some com o texto, só não mostra comentários.
    return [];
  }
}

/** Grava os comentários da cena. Sem comentários, o arquivo é removido. */
export async function writeComments(fs: VaultFs, sceneId: string, comments: Comment[]) {
  const path = commentsPath(sceneId);
  if (comments.length === 0) {
    if (await fs.exists(path)) await fs.remove(path);
    return;
  }
  const file: CommentsFile = { format: 1, comments };
  await fs.writeText(path, JSON.stringify(file, null, 2) + "\n");
}
