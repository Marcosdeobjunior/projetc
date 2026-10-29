import { describe, expect, it } from "vitest";
import { flushAll, registerFlush, serial } from "./writes";

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("fila de gravação", () => {
  it("executa uma tarefa de cada vez, na ordem", async () => {
    const log: string[] = [];
    await Promise.all([
      serial(async () => {
        await tick(20);
        log.push("a");
      }),
      serial(async () => {
        log.push("b");
      }),
    ]);
    expect(log).toEqual(["a", "b"]);
  });

  it("uma falha não trava a fila", async () => {
    await expect(serial(() => Promise.reject(new Error("x")))).rejects.toThrow();
    await expect(serial(async () => 1)).resolves.toBe(1);
  });
});

describe("flushAll", () => {
  it("espera as gravações pendentes terminarem", async () => {
    let saved = false;
    const off = registerFlush(() =>
      serial(async () => {
        await tick(20);
        saved = true;
      }),
    );
    expect(await flushAll()).toBe(true);
    expect(saved).toBe(true);
    off();
  });

  it("avisa quando uma gravação falha", async () => {
    const off = registerFlush(() => Promise.reject(new Error("disco cheio")));
    expect(await flushAll()).toBe(false);
    off();
    expect(await flushAll()).toBe(true);
  });
});
