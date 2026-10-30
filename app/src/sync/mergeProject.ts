import type { Chapter, Note, Project, Scene } from "../manuscript/types";

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
): T[] {
  const b = new Map(base.map((x) => [x.id, x]));
  const l = new Map(local.map((x) => [x.id, x]));
  const r = new Map(remote.map((x) => [x.id, x]));
  const out: T[] = [];
  // Ordem do local; o que só o remoto criou entra na posição em que está lá.
  for (const x of local) {
    const other = r.get(x.id);
    if (other) out.push(merge(b.get(x.id), x, other));
    else if (!b.has(x.id)) out.push(x); // criado aqui
    // senão: excluído no remoto
  }
  remote.forEach((x, i) => {
    if (l.has(x.id) || b.has(x.id)) return; // já está, ou foi excluído aqui
    out.splice(Math.min(i, out.length), 0, x);
  });
  return out;
}

export function mergeProjects(base: Project | null, local: Project, remote: Project): Project {
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
    if (bs && (!ls || !rs)) continue; // excluída de um dos lados
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
    }),
  );

  return {
    ...local,
    title: pick(base?.title, local.title, remote.title),
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
    chapters: merged,
    notes,
  };
}
