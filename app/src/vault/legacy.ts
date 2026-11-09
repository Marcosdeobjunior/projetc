import type { VaultFs } from "../platform/types";
import { LEGACY_META_DIR, LEGACY_PROJECT_FILE, META_DIR, PROJECT_FILE } from "./paths";

/**
 * Projetos criados quando o app se chamava InkFlow guardam os dados internos em
 * `.inkflow/`. Ao abrir, a pasta é renomeada para `.talia/` (uma vez só).
 * Devolve true se migrou.
 */
export async function migrateLegacyMeta(fs: VaultFs): Promise<boolean> {
  if (await fs.exists(PROJECT_FILE)) return false;
  if (!(await fs.exists(LEGACY_PROJECT_FILE))) return false;
  try {
    await fs.rename(LEGACY_META_DIR, META_DIR);
  } catch (err) {
    // Outra leitura do mesmo projeto pode ter migrado ao mesmo tempo.
    if (!(await fs.exists(PROJECT_FILE))) throw err;
    return false;
  }
  return true;
}
