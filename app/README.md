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

## Exportar o livro

Botão de download na barra lateral. Formatos:

- **Word (.docx)**: estilo "Livro" (serifa, recuo, página 14×21, A5 ou A4) ou "Manuscrito padrão"
  (Times 12, espaço duplo, margens de 2,5 cm, cabeçalho "Sobrenome / TÍTULO / página"). O
  sumário é um campo do Word: ao abrir, o Word pergunta se quer atualizar os campos (diga sim
  para aparecerem os números de página).
- **PDF**: abre a janela de impressão do sistema com o livro paginado (folha de rosto, sumário,
  números de página); escolha "Salvar como PDF".
- **E-book (.epub)**: EPUB 3, para Kindle (via "Enviar para Kindle"), Kobo, Apple Livros etc.
- **Markdown** e **texto** num arquivo só.

Escolhe-se quais capítulos entram, título e autor (o autor fica guardado no projeto), folha de
rosto, sumário, "Capítulo 1" antes do título, títulos das cenas (ou separador `* * *`) e
imagens. Os `[[links]]` viram texto comum e o marca-texto não sai no livro.

## Sincronização com o Google Drive

Cada projeto pode ser ligado a uma pasta `InkFlow/<nome do projeto>` no Google Drive
(Configurações → Sincronização). O app sincroniza ao abrir e ao fechar o projeto, de tempos em
tempos (5, 15 ou 30 minutos) e quando você pede. Em outro computador, conecte a mesma conta e
use **Baixar** em "No Google Drive", na tela inicial.

- Edições no mesmo texto feitas em dois computadores são **mescladas** (o `.yjs` de cada cena é
  um documento Yjs). Se algum parágrafo de um dos lados não couber na mescla (por exemplo, um
  lado dividiu o parágrafo que o outro editou), a versão inteira daquele lado vai para a Lixeira
  e o app avisa.
- Mudanças na estrutura (capítulos, cenas, notas) dos dois lados são juntadas pelo id.
- Outros arquivos alterados nos dois lados: fica o deste computador; o do Drive vai para a Lixeira.
- O que for excluído em outro computador vai para a Lixeira deste, em vez de sumir.
- A Lixeira e `.inkflow/sync.json` ficam só no computador.

### Credenciais do Google (uma vez só)

O InkFlow usa o acesso `drive.file`: só enxerga as pastas e arquivos que ele mesmo criou no
seu Drive. Para isso o app precisa de um "ID do cliente OAuth":

1. Em https://console.cloud.google.com crie um projeto (ex.: "InkFlow").
2. Em **APIs e serviços → Biblioteca**, ative a **Google Drive API**.
3. Em **APIs e serviços → Tela de consentimento OAuth** (ou "Google Auth Platform"), escolha
   "Externo", preencha o nome do app e o seu e-mail, e em **Público-alvo / Usuários de teste**
   adicione as contas Google que vão usar o app.
4. Em **Credenciais → Criar credenciais → ID do cliente OAuth**, escolha o tipo
   **App para computador**. Copie o **ID do cliente** e a **Chave secreta do cliente**.
5. No InkFlow: Configurações → Sincronização → cole os dois e clique em **Conectar conta Google**.

Enquanto o app estiver em modo "Teste" no Google Cloud, o Google pede para entrar de novo a
cada 7 dias. Para quem vai distribuir o app, as credenciais também podem vir na compilação, em
`app/.env.local` (não vai para o Git):

```
VITE_GOOGLE_CLIENT_ID=...apps.googleusercontent.com
VITE_GOOGLE_CLIENT_SECRET=...
```

A conta conectada (o token de renovação) fica guardada só neste computador.

## Organização do código

```
src/
  platform/    Acesso a arquivos. Duas implementações com a mesma interface:
               desktop.ts (Tauri, pasta real) e browser.ts (IndexedDB, modo prévia)
  vault/       Formato do projeto em disco: criar, abrir, salvar cenas
  manuscript/  Estrutura de capítulos, cenas e notas (funções puras) e contagem de palavras
  links/       Links [[Nome]], menções automáticas e montagem do grafo
  search/      Busca no projeto (ignora maiúsculas e acentos)
  export/      Exportação: Word, PDF (impressão), EPUB, Markdown e texto
  sync/        Sincronização com o Google Drive: cliente do Drive, decisão arquivo a arquivo
               e junção de project.json
  markdown/    Conversão entre o documento do editor e Markdown
  editor/      Editor de texto (TipTap + Yjs)
  state/       Estado do app (zustand)
  ui/          Telas e componentes
src-tauri/
  src/vault.rs  Comandos Rust que leem e gravam os arquivos do vault
  src/google.rs Login no Google (navegador + endereço local, com PKCE)
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
  anexos/
    mapa-da-vila.png          ← imagens, vídeos, áudios e outros arquivos
  .inkflow/
    project.json              ← título, ordem dos capítulos e das cenas
    ydoc/<id-da-cena>.yjs     ← estado do editor de cada cena (para o sync)
    versoes/                  ← histórico: uma versão do projeto inteiro por arquivo
    sync.json                 ← estado da sincronização com o Drive (só neste computador)
    lixeira/                  ← cenas, capítulos e anexos excluídos
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
- **Anexos** ficam em `anexos/` e entram no texto como `![nome](anexos/arquivo.ext)` numa
  linha própria (a mesma sintaxe de imagem do Markdown e do Obsidian).
- **Histórico:** cada versão em `.inkflow/versoes/` guarda a estrutura e o texto de todas as
  cenas e notas (os anexos não). O app guarda versões ao abrir e fechar o projeto e a cada
  10 minutos, só quando algo mudou; das automáticas antigas fica uma por dia. Restaurar o
  projeto inteiro guarda antes a situação atual e manda `manuscrito/` e `notas/` para a lixeira.
- **Links:** `[[Nome]]` (ou `[[Nome|texto]]`) liga a uma cena ou nota pelo título, como no
  Obsidian. Além disso, o nome de uma nota aparecendo no texto conta como menção. Os dois
  aparecem no grafo; os links ficam no `.md` como texto comum.
- **Gravação segura:** no desktop cada arquivo é gravado num temporário e depois renomeado,
  para nunca ficar pela metade se o app fechar no meio.
