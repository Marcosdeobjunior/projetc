/*
 * Toda escrita no vault passa por esta fila, uma de cada vez. Assim uma cena
 * nunca é gravada enquanto o arquivo dela está sendo movido ou renomeado.
 */
let queue: Promise<unknown> = Promise.resolve();

export function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

/*
 * Gravações pendentes (ex.: o editor espera uma pausa na digitação antes de
 * salvar). Antes de fechar o app, `flushAll` força todas a acontecerem.
 */
const flushers = new Set<() => Promise<void>>();

export function registerFlush(flush: () => Promise<void>): () => void {
  flushers.add(flush);
  return () => flushers.delete(flush);
}

/** Grava tudo o que está pendente. Devolve false se alguma gravação falhou. */
export async function flushAll(): Promise<boolean> {
  const results = await Promise.allSettled([...flushers].map((f) => f()));
  // Espera também o que já estava na fila antes do pedido.
  await serial(async () => undefined);
  return results.every((r) => r.status === "fulfilled");
}
