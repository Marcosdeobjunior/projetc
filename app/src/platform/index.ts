import type { Platform } from "./types";

/** Escolhe a implementação certa: app desktop (Tauri) ou navegador (prévia). */
export async function createPlatform(): Promise<Platform & { persistent?: boolean }> {
  if ("__TAURI_INTERNALS__" in window) {
    const { createDesktopPlatform } = await import("./desktop");
    return createDesktopPlatform();
  }
  const { createBrowserPlatform } = await import("./browser");
  return createBrowserPlatform();
}

export type { ChosenFolder, Platform, VaultFs, VaultRef } from "./types";
export { PlatformError } from "./types";
