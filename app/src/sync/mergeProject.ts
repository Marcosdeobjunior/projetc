import { mergeFields } from "../manuscript/fields";
import type { Chapter, Note, Project, Scene } from "../manuscript/types";
import { uniqueName } from "../vault/paths";

/*
 * Junta duas versões de project.json que mudaram desde a última
 * sincronização (`base`). Cada capítulo, cena e nota é comparado pelo id:
 *  - o que um lado criou entra;
 *  - o que um lado excluiu sai;
 *  - nome e posição vêm do lado que mudou (se os dois mudaram, vale o local).
 */

type Place = { chapter: string; index: number };

function places(p: Project) {
  const map = new Map<string, Place & { scene: Scene }>();
  for (const c of p.chapters) {
    c.scenes.forEach((scene, index) => map.set(scene.id, { chapter: c.id, index, scene }));
  }
  return map;
}

/** Fica com o valor do lado que mudou em relação à base; se os dois mudaram, o local. */
function pick<T>(base: T | undefined, local: T, remote: T): T {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  if (base !== undefined && same(local, base) && !same(remote, base)) return remote;
  return local;
}

function mergeById<T extends { id: string }>(
  base: T[],
  local: T[],
  remote: T[],
  merge: (b: T | undefined, l: T, r: T) => T,
  /** Excluído de um lado mas alterado do outro: fica (não some texto). */
  keep: Changed = NONE,
): T[] {
  const b = new Map(base.map((x) => [x.id, x]));
  const l = new Map(local.map((x) => [x.id, x]));
  const r = new Map(remote.map((x) => [x.id, x]));
  const out: T[] = [];
  // Ordem do local; o que só o remoto criou entra na posição em que está lá.
  for (const x of local) {
    const other = r.get(x.id);
    if (other) out.push(merge(b.get(x.id), x, other));
    else if (!b.has(x.id) || keep.local.has(x.id)) out.push(x); // criado ou alterado aqui
    // senão: excluído no remoto
  }
  remote.forEach((x, i) => {
    // Já está, ou foi excluído aqui (a não ser que o outro lado tenha alterado).
    if (l.has(x.id) || (b.has(x.id) && !keep.remote.has(x.id))) return;
    out.splice(Math.min(i, out.length), 0, x);
  });
  return out;
}

/** Ids de cenas e notas cujo texto mudou de cada lado desde a base. */
export interface Changed {
  local: Set<string>;
  remote: Set<string>;
}
const NONE: Changed = { local: new Set(), remote: new Set() };

export function mergeProjects(
  base: Project | null,
  local: Project,
  remote: Project,
  changed: Changed = NONE,
): Project {
  const b = base ?? { ...local, chapters: [], notes: [] };

  // Capítulos (sem as cenas, que são resolvidas à parte porque podem mudar de capítulo).
  const strip = (p: Project) => p.chapters.map((c) => ({ ...c, scenes: [] as Scene[] }));
  const chapters = mergeById(strip(b), strip(local), strip(remote), (bc, lc, rc) => ({
    ...lc,
    title: pick(bc?.title, lc.title, rc.title),
    dir: pick(bc?.dir, lc.dir, rc.dir),
  }));

  // Cenas: onde fica cada uma.
  const bp = places(b);
  const lp = places(local);
  const rp = places(remote);
  const placed: (Place & { scene: Scene; order: number })[] = [];
  for (const id of new Set([...lp.keys(), ...rp.keys()])) {
    const bs = bp.get(id);
    const ls = lp.get(id);
    const rs = rp.get(id);
    // Excluída de um lado: sai, a não ser que o outro lado tenha mexido no texto dela.
    if (bs && !rs && !(ls && changed.local.has(id))) continue;
    if (bs && !ls && !(rs && changed.remote.has(id))) continue;
    if (ls && rs) {
      const remoteMoved =
        bs &&
        (rs.chapter !== bs.chapter || rs.index !== bs.index) &&
        ls.chapter === bs.chapter &&
        ls.index === bs.index;
      const where = remoteMoved ? rs : ls;
      const scene: Scene = {
        id,
        title: pick(bs?.scene.title, ls.scene.title, rs.scene.title),
        file: pick(bs?.scene.file, ls.scene.file, rs.scene.file),
      };
      placed.push({
        chapter: where.chapter,
        index: where.index,
        scene,
        order: remoteMoved ? 1 : 0,
      });
    } else {
      const only = (ls ?? rs)!;
      placed.push({ ...only, order: ls ? 0 : 1 });
    }
  }
  if (chapters.length === 0 && placed.length > 0) {
    chapters.push({
      id: `ch_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
      title: "Recuperados",
      dir: "recuperados",
      scenes: [],
    });
  }
  const byChapter = new Map(chapters.map((c) => [c.id, [] as typeof placed]));
  for (const p of placed) {
    // Capítulo excluído do outro lado: a cena vai para o primeiro capítulo, para não sumir.
    (byChapter.get(p.chapter) ?? byChapter.get(chapters[0]?.id ?? ""))?.push(p);
  }
  const merged: Chapter[] = chapters.map((c) => ({
    ...c,
    scenes: byChapter
      .get(c.id)!
      .sort((x, y) => x.index - y.index || x.order - y.order)
      .map((p) => p.scene),
  }));

  const notes = mergeById<Note>(
    b.notes ?? [],
    local.notes ?? [],
    remote.notes ?? [],
    (bn, ln, rn) => ({
      ...ln,
      title: pick(bn?.title, ln.title, rn.title),
      file: pick(bn?.file, ln.file, rn.file),
      kind: pick(bn?.kind, ln.kind, rn.kind),
      // Opcional: "sem imagem" na base também conta como valor (pick ignora undefined).
      fields: mergeFields(bn?.fields, ln.fields, rn.fields),
      image: bn
        ? JSON.stringify(ln.image) === JSON.stringify(bn.image)
          ? rn.image
          : ln.image
        : (ln.image ?? rn.image),
      // Galeria: a lista inteira como um valor (mudou de um lado, vale esse lado).
      images: bn
        ? JSON.stringify(ln.images) === JSON.stringify(bn.images)
          ? rn.images
          : ln.images
        : (ln.images ?? rn.images),
    }),
    changed,
  );

  return uniqueNames({
    ...local,
    title: pick(base?.title, local.title, remote.title),
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
    chapters: merged,
    notes,
  });
}

/**
 * Depois de juntar, dois itens podem ter o mesmo nome de arquivo ou pasta
 * (ex.: os dois computadores criaram "Cena 2"). Cada um ganha um nome só seu;
 * a sincronização depois põe o texto certo em cada arquivo.
 */
function uniqueNames(p: Project): Project {
  const dirs = new Set<string>();
  const chapters = p.chapters.map((c) => {
    const dir = uniqueName(c.dir, dirs);
    dirs.add(dir);
    const files = new Set<string>();
    const scenes = c.scenes.map((s) => {
      const base = s.file.replace(/\.md$/, "");
      const file = uniqueName(base, files, ".md");
      files.add(file);
      return file === s.file ? s : { ...s, file };
    });
    return { ...c, dir, scenes };
  });
  const byKind = new Map<string, Set<string>>();
  const notes = p.notes.map((n) => {
    const taken = byKind.get(n.kind) ?? new Set<string>();
    byKind.set(n.kind, taken);
    const file = uniqueName(n.file.replace(/\.md$/, ""), taken, ".md");
    taken.add(file);
    return file === n.file ? n : { ...n, file };
  });
  return { ...p, chapters, notes };
}
