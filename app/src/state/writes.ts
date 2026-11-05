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

/*
 * Tarefas para antes de fechar o projeto ou o app (ex.: sincronizar com o
 * Drive). Cada uma tem um limite de tempo, para o app nunca ficar preso.
 */
const closers = new Set<() => Promise<void>>();

export function registerBeforeClose(task: () => Promise<void>): () => void {
  closers.add(task);
  return () => closers.delete(task);
}

export async function runBeforeClose(timeoutMs = 20_000) {
  const limit = new Promise<void>((r) => setTimeout(r, timeoutMs));
  await Promise.race([Promise.allSettled([...closers].map((t) => t())), limit]);
}
