# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O projeto

Tália: app desktop para escritores (Tauri 2 + React 19 + TypeScript). Cada projeto é uma pasta
local (o _vault_) com textos em Markdown; sincronização opcional com o Google Drive do próprio
usuário. Venda única via Microsoft Store / Mac App Store.

- `app/` — o aplicativo (todos os comandos abaixo rodam dentro de `app/`).
- `site/index.html` — landing page estática, sem build.
- `docs/` — documentação em pt-BR. **`docs/arquitetura.md`** é o mapa detalhado do código (fila
  de gravação, editor, sync, exportação, segurança, limitações conhecidas) e
  **`docs/formato-do-projeto.md`** é a referência exata dos arquivos do vault. Leia a seção
  relevante antes de mexer numa dessas áreas, e atualize esses documentos (e
  `docs/guia-do-usuario.md` para funções visíveis) quando o comportamento mudar.

Textos da interface e da documentação são em português do Brasil; mensagens de commit em inglês.

## Comandos (em `app/`, gerenciador `pnpm`)

```bash
pnpm install
pnpm dev                 # só a interface no navegador (modo prévia, sem Rust), porta 1420
pnpm tauri dev           # app desktop completo (precisa de Rust)
pnpm test                # Vitest, todos os *.test.ts
pnpm vitest run src/sync/engine.test.ts      # um arquivo
pnpm vitest run -t "nome do teste"           # um teste pelo nome
pnpm typecheck && pnpm lint && pnpm exec prettier --check .
pnpm build:preview       # dist-preview/index.html: HTML único autocontido
pnpm tauri build         # instalador
```

Em `app/src-tauri/`: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test`
(o Rust precisa de `app/dist`, então rode `pnpm build` antes se ainda não existir).

O CI (`.github/workflows/app.yml`) roda exatamente: typecheck → lint → prettier --check → test →
build → cargo fmt/clippy/test, e depois gera o instalador do Windows. Prettier usa
`printWidth: 100`; rode `pnpm format` antes de commitar (inclusive para arquivos `.md`/`.json`
dentro de `app/`).

## Arquitetura (o essencial)

- **`VaultFs` (`src/platform/types.ts`) é a única porta para arquivos.** `platform/index.ts`
  escolhe `desktop.ts` (Tauri, `invoke` dos comandos de `src-tauri/src/vault.rs`) se existe
  `__TAURI_INTERNALS__`, senão `browser.ts` (IndexedDB/memória via `KeyValueFs`). A interface
  nunca toca em arquivos diretamente; assim o mesmo código roda no desktop e no navegador.
- **Testes de domínio rodam sobre `KeyValueFs` + `MemoryStore`**, sem Tauri. Novas funções de
  E/S devem ser testáveis desse jeito.
- **Toda escrita passa por `serial()` (`src/state/writes.ts`)**, uma fila única de promessas
  (gravação de cena, mudanças de estrutura, versões, lixeira, `livro.json`, `sync.json`,
  `applySync` inteiro, e leituras que precisam de estado consistente). Não grave fora dela.
  `registerFlush`/`flushAll` cuidam do debounce do editor (700 ms); `registerBeforeClose` roda o
  sync ao fechar (limite 20 s).
- **Camadas:** `ui/` e `editor/` → stores zustand em `state/` (`store.ts` = sessão/projeto/ações,
  `sync.ts` = conta Google e sync) → domínio em funções puras + E/S via `VaultFs` (`vault/`,
  `manuscript/`, `markdown/`, `links/`, `search/`, `export/`, `book/`, `sync/`) → `platform/`.
  `manuscript/tree.ts` faz operações puras de estrutura que geram `FsOp`s aplicadas por
  `vault.applyOps`.
- **Formato do vault:** o `.md` de cada cena/nota é a fonte da verdade para o usuário; o
  `.inkflow/ydoc/<id>.yjs` é o estado do editor (TipTap + Yjs, campo `YDOC_FIELD = "default"`),
  usado para mesclar no sync. Ao abrir, se o `.md` difere do `.yjs`, o texto de fora é aplicado
  como edição. Ao salvar, se o `.md` mudou por fora, `ExternalChangeError` → o app guarda uma
  cópia "(versão externa)". A ordem de capítulos/cenas fica em `.inkflow/project.json` (reordenar
  não renomeia arquivos); renomear renomeia o arquivo. **Nada é apagado:** excluir move para
  `.inkflow/lixeira/`.
- **Markdown:** `markdown/parse.ts` e `serialize.ts` convertem um subconjunto entre Markdown e o
  JSON do ProseMirror; o schema do editor (`editor/extensions.ts`) e esse conversor precisam
  andar juntos (ida e volta coberta por `markdown.test.ts`). Extras: `==destaque==`, `[[links]]`
  estilo Obsidian, anexos `![nome](anexos/arq.ext)` numa linha própria.
- **Sync (`sync/engine.ts`):** decisão de três vias por MD5 (local × Drive × base em
  `.inkflow/sync.json`); `planSync` só lê, `applySync` escreve; conflitos em `.yjs` são mesclados
  via Yjs, `project.json` é juntado por id (`mergeProject.ts`), o resto fica com a versão local e a
  remota vai para a lixeira. Login OAuth (loopback + PKCE, escopo `drive.file`) em
  `src-tauri/src/google.rs`; cliente REST v3 em `sync/drive.ts`.
- **Rust (`src-tauri/src/`):** `lib.rs` registra plugins e comandos; `vault.rs` resolve todo
  caminho com `safe_path` (recusa `..`, unidades, symlinks para fora da raiz) e grava com
  `write_atomic`. Ao adicionar um comando, registre em `lib.rs`, exponha via `desktop.ts` e
  implemente o equivalente em `browser.ts`. Permissões da janela ficam em
  `capabilities/default.json`; a CSP em `tauri.conf.json` só permite conexões com IPC e
  `https://www.googleapis.com`.
- **Dados de fora são saneados:** `livro.json` passa por `sanitizeDesign` (`book/design.ts`); texto
  em CSS de impressão passa por `cssString`; HTML de prévia/impressão usa iframes `sandbox` sem
  scripts e escapa texto com `esc`.

## Credenciais

As credenciais OAuth do Google podem vir em `app/.env.local` (fora do Git:
`VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_CLIENT_SECRET`) ou do formulário em Configurações. Passo a
passo em `app/README.md`.
