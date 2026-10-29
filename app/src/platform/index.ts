import type { Platform } from "./types";

export const isDesktop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Escolhe a implementação certa: app desktop (Tauri) ou navegador (prévia). */
export async function createPlatform(): Promise<Platform & { persistent?: boolean }> {
  if (isDesktop) {
    const { createDesktopPlatform } = await import("./desktop");
    return createDesktopPlatform();
  }
  const { createBrowserPlatform } = await import("./browser");
  return createBrowserPlatform();
}

export type { Platform, VaultFs, VaultRef, DirEntry } from "./types";
export { PlatformError } from "./types";
