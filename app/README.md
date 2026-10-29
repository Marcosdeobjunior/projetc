# InkFlow — app

App desktop para escritores, feito com **Tauri 2** (Rust) + **React** + **TypeScript**.
O editor de texto é o **TipTap**, e o texto de cada cena também é guardado em **Yjs**,
que será usado para mesclar edições quando a sincronização existir.

## Rodar no seu computador

Pré-requisitos (uma vez só):

- **Node.js LTS** e **pnpm** (`npm install -g pnpm`)
- **Rust** (https://rustup.rs)
- **Windows:** "Build Tools for Visual Studio" com "Desenvolvimento para desktop com C++".
  **Mac:** `xcode-select --install`.

Dentro da pasta `app/`:

```bash
pnpm install
```

```bash
pnpm tauri dev
```

O primeiro `tauri dev` demora alguns minutos para compilar a parte em Rust. Os seguintes são rápidos.

## Outros comandos

| Comando                                        | O que faz                                                                         |
| ---------------------------------------------- | --------------------------------------------------------------------------------- |
| `pnpm dev`                                     | Abre só a interface no navegador (modo prévia, sem Rust) em http://localhost:1420 |
| `pnpm build:preview`                           | Gera `dist-preview/index.html`, um arquivo único que roda no navegador            |
| `pnpm tauri build`                             | Gera o instalador do app desktop                                                  |
| `pnpm test`                                    | Testes da interface e do formato dos arquivos                                     |
| `cargo test` (em `src-tauri/`)                 | Testes da parte em Rust                                                           |
| `pnpm lint` / `pnpm typecheck` / `pnpm format` | Qualidade de código                                                               |

## Organização do código

```
src/
  platform/    Acesso a arquivos. Duas implementações com a mesma interface:
               desktop.ts (Tauri, pasta real) e browser.ts (IndexedDB, modo prévia)
  vault/       Formato do projeto em disco: criar, abrir, salvar cenas
  manuscript/  Estrutura de capítulos, cenas e notas (funções puras) e contagem de palavras
  links/       Links [[Nome]], menções automáticas e montagem do grafo
  markdown/    Conversão entre o documento do editor e Markdown
  editor/      Editor de texto (TipTap + Yjs)
  state/       Estado do app (zustand)
  ui/          Telas e componentes
src-tauri/
  src/vault.rs Comandos Rust que leem e gravam os arquivos do vault
```

A interface nunca acessa arquivos diretamente: ela usa a interface `VaultFs`
(`src/platform/types.ts`). É isso que permite a mesma interface rodar no app desktop
e no navegador, e é onde o sync vai se encaixar depois.

## Formato do vault (pasta do projeto)

```
A Casa das Marés/
  LEIA-ME.md
  manuscrito/
    o-comeco/                 ← um capítulo
      a-carta.md              ← uma cena (Markdown legível)
      helena.md
  notas/
    personagens/helena.md     ← notas: personagens, lugares e ideias
    lugares/vila-serena.md
    ideias/o-segredo-do-pai.md
  .inkflow/
    project.json              ← título, ordem dos capítulos e das cenas
    ydoc/<id-da-cena>.yjs     ← estado do editor de cada cena (para o sync)
    lixeira/                  ← cenas e capítulos excluídos
```

Cada cena `.md` começa com um cabeçalho:

```markdown
---
id: sc_3f9a1c2b7d4e
title: "A carta"
---

O vento soprava frio naquela manhã…
```

Regras:

- **O `.md` é a fonte da verdade para o usuário.** Se ele for editado fora do app, o
  InkFlow percebe ao abrir a cena e usa o texto do `.md`.
- **A ordem** de capítulos e cenas fica no `project.json`, não no nome dos arquivos.
  Assim, reordenar não renomeia arquivos (melhor para o sync).
- **Renomear** uma cena ou capítulo renomeia o arquivo ou a pasta junto.
- **Nada é apagado de verdade:** excluir move para `.inkflow/lixeira/`.
- **Formatação:** negrito, itálico, ~~tachado~~, ==destaque== (como no Obsidian), títulos,
  listas, citações e o separador de cena `* * *` ficam em Markdown comum.
- **Links:** `[[Nome]]` (ou `[[Nome|texto]]`) liga a uma cena ou nota pelo título, como no
  Obsidian. Além disso, o nome de uma nota aparecendo no texto conta como menção. Os dois
  aparecem no grafo; os links ficam no `.md` como texto comum.
- **Gravação segura:** no desktop cada arquivo é gravado num temporário e depois renomeado,
  para nunca ficar pela metade se o app fechar no meio.
