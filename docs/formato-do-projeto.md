# Formato do projeto (vault)

Referência exata de como um projeto da Tália fica no disco. Vale para o app desktop (uma pasta
real) e, com as mesmas chaves, para a prévia no navegador (IndexedDB). As constantes de caminho
estão em `app/src/vault/paths.ts`; os tipos em `app/src/manuscript/types.ts`,
`app/src/vault/history.ts`, `app/src/vault/trash.ts`, `app/src/sync/engine.ts` e
`app/src/book/design.ts`.

## Visão geral

```
A Casa das Marés/                       ← raiz do projeto (nome legível, com acentos)
  LEIA-ME.md                            ← explicação curta (criado se não existir)
  manuscrito/
    o-comeco/                           ← um capítulo (Chapter.dir)
      a-carta.md                        ← uma cena (Scene.file)
      na-padaria.md
    a-cidade/
      .keep                             ← só em capítulo sem cenas, para a pasta existir
  notas/
    personagens/helena.md               ← notas (Note.kind / Note.file)
    lugares/vila-serena.md
    ideias/o-segredo-do-pai.md
  anexos/
    mapa-da-vila.png                    ← imagens, vídeos, áudios e outros arquivos
  .talia/
    project.json                        ← estrutura: título, capítulos, cenas, notas, autor
    ydoc/
      sc_3f9a1c2b7d4e.yjs               ← estado do editor (Yjs) de cada cena/nota
    comentarios/
      sc_3f9a1c2b7d4e.json              ← comentários de uma cena/nota (só se houver)
    linha-do-tempo.json                 ← dias da história das cenas e acontecimentos
    escrita.json                        ← palavras escritas por dia e meta diária
    versoes/
      indice.json                       ← índice do histórico (só neste computador)
      v-2026-11-02T20-17-05-123Z.json   ← uma versão do projeto inteiro
    lixeira/
      indice.json                       ← o que está na lixeira e de onde veio
      2026-11-02T20-30-00-000Z-a-carta.md
      2026-11-02T20-30-00-000Z-sc_3f9a1c2b7d4e.yjs
    livro.json                          ← projeto gráfico (capa, lombada, miolo)
    sync.json                           ← estado da sincronização (só neste computador)
```

Regras gerais:

- Caminhos dentro do projeto usam `/` em qualquer sistema e são sempre relativos à raiz.
- Arquivos de texto em **UTF-8**. JSON com indentação de 2 espaços (`project.json`, `livro.json`)
  ou 1 espaço (índices), com exceção de `sync.json` e das versões, que são compactos.
- No desktop, toda gravação é atômica: o app grava `.<nome>.<aleatório>.talia-tmp` na mesma
  pasta e renomeia por cima. Um `*.talia-tmp` que sobrar (queda de energia no meio) pode ser
  apagado; o app e a sincronização o ignoram.
- **Links simbólicos (atalhos) dentro do projeto não são aceitos**: o app desktop recusa ler ou
  gravar através deles. A própria pasta do projeto pode ser um atalho.
- **Nada é apagado** ao excluir pela interface: vai para `.talia/lixeira/`.
- A ordem de capítulos e cenas vem de `project.json`, nunca do nome dos arquivos.

### Nomes de arquivos e pastas

| O quê                       | Regra (`vault/paths.ts`)                                                                                                                                                                                              | Exemplo                             |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Pasta do projeto            | `folderName(título)`: mantém acentos e espaços; troca `< > : " / \ \| ? *` e controles por espaço; tira `.`/espaço do fim; até 80 caracteres; `CON`, `PRN`, `AUX`, `NUL`, `COM1`…, `LPT1`… ou vazio viram "Meu livro" | `A Casa das Marés`                  |
| Capítulo, cena, nota, anexo | `slugify(título)`: sem acentos, minúsculas, tudo que não é `a-z0-9` vira `-`, até 60 caracteres; vazio vira `sem-titulo`                                                                                              | `O começo` → `o-comeco`             |
| Repetidos                   | `uniqueName`: `base`, `base-2`, `base-3`…                                                                                                                                                                             | `cena-1.md`, `cena-1-2.md`          |
| Extensão de anexo           | `slugify` da extensão, até 10 caracteres                                                                                                                                                                              | `Foto Final.JPG` → `foto-final.jpg` |

Renomear uma cena, nota ou capítulo **renomeia o arquivo/pasta** junto. Reordenar não renomeia
nada. Mover uma cena para outro capítulo move o arquivo (e pode ganhar sufixo).

---

## `LEIA-ME.md`

Criado ao criar o projeto, só se ainda não existir:

```markdown
# A Casa das Marés

Este é um projeto da Tália.

- `manuscrito/` guarda os capítulos e as cenas em Markdown, legíveis em qualquer editor de texto.
- `.talia/` guarda a ordem dos capítulos, o histórico e os dados do app. Não apague essa pasta.
```

O app não lê esse arquivo.

---

## `.talia/project.json`

A estrutura do projeto. É o arquivo que identifica a pasta como projeto da Tália.

| Campo               | Tipo    | Descrição                                                                                                                                                                                                              |
| ------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `format`            | `1`     | Versão do formato. Outro valor: o app recusa abrir ("criado por uma versão mais nova")                                                                                                                                 |
| `id`                | string  | `prj_` + 12 hex. Identifica o projeto (também no Google Drive)                                                                                                                                                         |
| `title`             | string  | Título do projeto (até 120 caracteres pela interface)                                                                                                                                                                  |
| `createdAt`         | number  | Criação, em ms desde 1970                                                                                                                                                                                              |
| `updatedAt`         | number  | Última mudança na estrutura, em ms                                                                                                                                                                                     |
| `author`            | string? | Nome do autor (Exportar / Diagramação). Opcional                                                                                                                                                                       |
| `chapters`          | array   | Capítulos, **na ordem do livro**                                                                                                                                                                                       |
| `chapters[].id`     | string  | `ch_` + 12 hex                                                                                                                                                                                                         |
| `chapters[].title`  | string  | Título do capítulo                                                                                                                                                                                                     |
| `chapters[].dir`    | string  | Nome da pasta em `manuscrito/`                                                                                                                                                                                         |
| `chapters[].scenes` | array   | Cenas, **na ordem**                                                                                                                                                                                                    |
| `…scenes[].id`      | string  | `sc_` + 12 hex                                                                                                                                                                                                         |
| `…scenes[].title`   | string  | Título da cena                                                                                                                                                                                                         |
| `…scenes[].file`    | string  | Nome do `.md` dentro da pasta do capítulo                                                                                                                                                                              |
| `notes`             | array   | Notas (sem ordem; a interface ordena por título). Projetos antigos podem não ter: lido como `[]`                                                                                                                       |
| `notes[].id`        | string  | `nt_` + 12 hex                                                                                                                                                                                                         |
| `notes[].title`     | string  | Título da nota (também usado para as menções no texto)                                                                                                                                                                 |
| `notes[].kind`      | string  | `"personagens"`, `"lugares"`, `"ideias"`, `"calendarios"`, `"idiomas"` ou `"organizacoes"` (a subpasta em `notas/`)                                                                                                    |
| `notes[].file`      | string  | Nome do `.md` dentro de `notas/<kind>/`                                                                                                                                                                                |
| `notes[].image`     | string  | Opcional. Imagem principal da ficha (retrato, foto do lugar; a do cartão): `anexos/<arquivo>`. Outro valor é ignorado ao abrir                                                                                         |
| `notes[].images`    | array   | Opcional. Outras imagens da ficha (galeria), além da principal; cada uma `anexos/<arquivo>`. Inválidas ou repetidas são ignoradas ao abrir; no sync, a lista inteira vale como um valor                                |
| `notes[].fields`    | objeto  | Opcional. Campos da ficha (`manuscript/fields.ts`): chave → texto; campos de referência guardam o id de outra nota. Chaves inválidas ou valores que não são texto são ignorados ao abrir; no sync, junta campo a campo |

Campos especiais em `notes[].fields` (texto, como os outros): `mapa` (lugar) guarda as opções do mapa da região em JSON — `{"seed": número, "size": "aldeia"|"vila"|"cidade", "road", "river", "fields": booleanos}` —, e o mapa é gerado de novo a partir delas (`world/village.ts`); `brasao` (lugar, organização) guarda `{"seed": número, "kind": "brasao"|"bandeira"}` — a semente do brasão e qual dos dois está à vista — e `bandeira` guarda `{"seed": número}`, a semente da bandeira, independente (`world/heraldry.ts`); `brasaoImagem` e `bandeiraImagem` são imagens próprias em `anexos/` que substituem, cada uma, só o seu desenho gerado. Valores inválidos são ignorados ao abrir a ficha. Nos lugares que são cidades do mapa-múndi, o "Editar povoado" grava também `populacao`, `grupo`, `tipoPovoado`, `cultura`, `elementos` (lista separada por vírgulas: `porto`, `muralhas`, `cidadela`, `praca`, `templo`, `favela`) e `etiquetas`; e o `mapa` ganha `walls`, `citadel`, `plaza`, `temple` e `shanty` (booleanos, falsos se ausentes).

Exemplo:

```json
{
  "format": 1,
  "id": "prj_9c1e0a7b44d2",
  "title": "A Casa das Marés",
  "createdAt": 1762113425000,
  "updatedAt": 1762114010000,
  "chapters": [
    {
      "id": "ch_1a2b3c4d5e6f",
      "title": "O começo",
      "dir": "o-comeco",
      "scenes": [
        { "id": "sc_3f9a1c2b7d4e", "title": "A carta", "file": "a-carta.md" },
        {
          "id": "sc_77aa01bc9e10",
          "title": "Na padaria",
          "file": "na-padaria.md"
        }
      ]
    }
  ],
  "notes": [
    {
      "id": "nt_5d6e7f801a2b",
      "title": "Helena",
      "kind": "personagens",
      "file": "helena.md"
    }
  ],
  "author": "Ana Souza"
}
```

Caminho de uma cena: `manuscrito/<chapter.dir>/<scene.file>`. De uma nota:
`notas/<note.kind>/<note.file>`.

Ao abrir, o app confere o arquivo e recusa abrir o projeto (mensagem "O arquivo
.talia/project.json tem um problema (…)") se: `chapters` ou `notes` não forem listas; algum
`id` ou `title` não for texto; algum `dir` ou `file` for vazio, `.`, `..` ou tiver `/`, `\`, `:`
ou caracteres de controle; algum `file` de cena não terminar em `.md`; ou algum `kind` não for um
dos três tipos. JSON inválido dá "O arquivo .talia/project.json está corrompido.".

---

## Cenas e notas (`.md`)

Cada cena e cada nota é um arquivo Markdown com um cabeçalho (_frontmatter_), uma linha em branco
e o texto:

```markdown
---
id: sc_3f9a1c2b7d4e
title: "A carta"
---

O vento soprava frio naquela manhã, e a cidade ainda parecia adormecida.

A carta estava no bolso do casaco. Ele já tinha lido **três vezes**.

---

_Não procure por mim_, dizia a última linha. Ele leu [[Helena]] de novo.

![mapa da vila](anexos/mapa-da-vila.png)
```

- `id` é o mesmo do `project.json`; `title` é gravado como string JSON (entre aspas, com
  escapes). O app reescreve o cabeçalho ao renomear.
- **O `.md` é a fonte da verdade para o usuário**: se ele for editado fora do app, a Tália
  percebe (comparando só o corpo, sem o cabeçalho) e usa o texto do arquivo.
- Arquivo vazio = texto vazio. Um `.md` que sumiu do disco é recriado na próxima gravação.

Markdown aceito e gerado (`markdown/serialize.ts` e `parse.ts`):

| Elemento               | Sintaxe                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parágrafo              | Linhas separadas por uma linha em branco (linhas seguidas são juntadas)                                                                                                         |
| Quebra de linha        | `\` no fim da linha                                                                                                                                                             |
| Títulos                | `# `, `## `, `### ` (o editor usa 1 a 3; o leitor aceita até 6)                                                                                                                 |
| Citação                | `> ` no começo de cada linha                                                                                                                                                    |
| Lista                  | `- ` (lê também `+` e `*`)                                                                                                                                                      |
| Lista numerada         | `1. ` (lê também `1)`), respeitando o número inicial                                                                                                                            |
| Separador de cena      | `* * *` (lê também `***`, `---`, `___`)                                                                                                                                         |
| Negrito                | `**texto**` (lê também `__texto__`)                                                                                                                                             |
| Itálico                | `*texto*` (lê também `_texto_`)                                                                                                                                                 |
| Tachado                | `~~texto~~`                                                                                                                                                                     |
| Destaque (marca-texto) | `==texto==` (como no Obsidian)                                                                                                                                                  |
| Link entre textos      | `[[Título]]` ou `[[Título\|texto que aparece]]` — texto comum no `.md`, sem escape                                                                                              |
| Anexo                  | `![nome](anexos/arquivo.ext)` numa linha própria; com espaço ou parênteses: `![nome](<anexos/meu arquivo.png>)`                                                                 |
| Lista dentro de lista  | Item recuado com 2 espaços (ou o tamanho do marcador) sob o item de cima, sem linha em branco                                                                                   |
| Alinhamento            | `<!-- alinhar: centro -->` (ou `direita`, `justificado`) numa linha própria logo antes do parágrafo ou título; invisível em outros programas. À esquerda é o padrão (sem marca) |

Caracteres que virariam formatação são escapados com `\` (`\*`, `\_`, `` \` ``, `\~`, `\=` antes
de outro `=`, e `#`, `>`, `-`, `1.` no começo da linha). Links, sublinhado, código e blocos de
código **não** existem no editor.

---

## `.talia/ydoc/<id>.yjs`

Estado do editor de cada cena ou nota, em binário: `Y.encodeStateAsUpdate(doc)` de um `Y.Doc`
cujo `Y.XmlFragment` `"default"` contém o documento ProseMirror (via `@tiptap/y-tiptap`, com o
esquema de `editor/extensions.ts`).

- Serve para **mesclar** edições do mesmo texto feitas em dois computadores (Yjs/CRDT) e para o
  desfazer continuar entre sessões.
- Pode faltar: o app cria a partir do `.md` ao abrir o texto.
- Se o `.md` e o `.yjs` divergirem, vale o `.md` (a diferença é aplicada como edição).
- Excluir uma cena leva o `.yjs` junto para a lixeira.

---

## `.talia/comentarios/<id>.json`

Comentários de uma cena ou nota (`comments/comments.ts`). O arquivo só existe enquanto houver
comentário; ao excluir o último, ele é removido.

```json
{
  "format": 1,
  "comments": [
    {
      "id": "6f1c…",
      "text": "Trocar por \"gelado\"?",
      "quote": "frio",
      "from": "AZ7x…",
      "to": "AZ7x…",
      "createdAt": 1794230000000,
      "resolved": false
    }
  ]
}
```

- `from`/`to`: posições **relativas do Yjs** (`Y.encodeRelativePosition`, em base64) no
  `Y.XmlFragment` do `.yjs` da mesma cena. Elas acompanham o texto quando ele é editado e
  quando edições de dois computadores são mescladas.
- `quote`: o trecho no momento do comentário, para mostrar o comentário mesmo que o trecho seja
  apagado (o app avisa "(trecho apagado)").
- Se o `.yjs` da cena for **recriado do zero** a partir do `.md` (arquivo apagado ou vindo de
  outro programa), as âncoras deixam de achar o trecho; o comentário continua na lista.
- Lido com `sanitizeComments`: entradas sem `id`, `from` ou `to`, ou repetidas, são ignoradas;
  arquivo danificado é lido como sem comentários (não é apagado).
- Vai para o Drive como qualquer arquivo (em conflito, fica a versão local e a remota vai para a
  lixeira).

---

## `.talia/linha-do-tempo.json`

Datas da história (`timeline/timeline.ts`). As datas são sempre do autor; o app só ordena e
calcula intervalos.

```json
{
  "format": 1,
  "scenes": { "sc_3f9a1c2b7d4e": { "day": 1, "days": 3 } },
  "events": [
    {
      "id": "6f1c…",
      "title": "O pai some",
      "day": -2555,
      "days": 1,
      "notes": ["nt_…"]
    }
  ]
}
```

| Campo               | Tipo           | Descrição                                                                                        |
| ------------------- | -------------- | ------------------------------------------------------------------------------------------------ |
| `scenes`            | objeto         | Por id de cena: `day` (dia da história, inteiro) e `days` (duração, ≥ 1)                         |
| `events[]`          | array          | Acontecimentos que não são cenas: `id`, `title`, `day`, `days`, `notes` (ids)                    |
| `calendars`         | objeto         | Por id de nota de calendário: definição do calendário do mundo (abaixo)                          |
| `activeCalendar`    | string ou null | Calendário usado para mostrar as datas (precisa existir em `calendars`)                          |
| `scenes[id].place`  | string         | Opcional. Id do lugar onde a cena se passa                                                       |
| `scenes[id].ignore` | boolean        | Opcional. `true` = ignorar os avisos de viagem desta cena                                        |
| `births`            | objeto         | Por id de personagem: dia da história em que nasceu (inteiro; negativo = antes do dia 1)         |
| `travel[]`          | array          | Tempos de viagem: `from`, `to` (ids de lugares), `days` (≥ 0). Vale nos dois sentidos; um par só |

Definição de um calendário (`timeline/calendar.ts`, lida com `sanitizeCalendar`):
`months[]` (`name`, `days` 1–1000), `weekdays[]` (nomes; vazio = sem semana), `yearSuffix`,
`start` (`year`, `month` índice, `day`) = a data do dia 1 da história, `startWeekday` (índice),
`holidays[]` (`name`, `month`, `day`) e `seasons[]` (`name`, `month` em que começa). Sem anos
bissextos. Valores fora da faixa voltam ao padrão.

- Cena sem entrada em `scenes` = sem data. Ids de cenas excluídas são ignorados.
- Lido com `sanitizeTimeline`: valores não inteiros, fora da faixa ou ids repetidos são
  descartados; arquivo danificado é lido como vazio (não é apagado).
- Vai para o Drive como qualquer arquivo (em conflito, fica a versão local e a remota vai para a
  lixeira).

---

## `.talia/escrita.json`

Calendário de escrita (`writing/writing.ts`).

```json
{ "format": 1, "dailyGoal": 500, "days": { "2026-11-09": 640 } }
```

- `dailyGoal`: meta de palavras por dia (inteiro > 0) ou `null`.
- `days`: palavras escritas por dia, chave `AAAA-MM-DD` (data local). Só conta o que entra
  digitando nas cenas do manuscrito; palavras apagadas não descontam.
- Lido com `sanitizeLog`; vai para o Drive como qualquer arquivo.

---

## `anexos/`

Arquivos copiados para o projeto (imagens, vídeos, áudios, documentos). Sem índice: a lista é o
conteúdo da pasta (só arquivos, sem subpastas). São referenciados pelos `.md` como
`anexos/<nome>` e por `livro.json` (imagens da capa). Não entram no histórico de versões, mas
entram na sincronização.

---

## `.talia/versoes/` (histórico)

### `<id>.json` — uma versão

O `id` é `v-` + a data ISO com `:` e `.` trocados por `-` (com sufixo `-N` se colidir).

| Campo       | Tipo                 | Descrição                                                                                                                                                               |
| ----------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `format`    | `1`                  | Versão do formato                                                                                                                                                       |
| `id`        | string               | Igual ao nome do arquivo sem `.json`                                                                                                                                    |
| `createdAt` | number               | ms desde 1970                                                                                                                                                           |
| `label`     | string               | Nome dado pela pessoa, ou o motivo (`Ao abrir o projeto`, `Automática`, `Ao fechar o projeto`, `Antes de restaurar "…"`, `Antes de voltar para "…"`, `Versão sem nome`) |
| `auto`      | boolean              | Versão automática (pode ser podada)                                                                                                                                     |
| `words`     | number               | Palavras do manuscrito (só cenas)                                                                                                                                       |
| `hash`      | string               | FNV-1a 32 bits (8 hex) de `{ title, chapters, notes, texts }`, para não repetir versões iguais                                                                          |
| `project`   | Project              | Cópia do `project.json` naquele momento                                                                                                                                 |
| `texts`     | `Record<id, string>` | Corpo Markdown (sem cabeçalho) de cada cena e nota                                                                                                                      |

Exemplo (resumido):

```json
{
  "format": 1,
  "id": "v-2026-11-02T20-17-05-123Z",
  "createdAt": 1762114625123,
  "label": "Antes da revisão",
  "auto": false,
  "words": 12873,
  "hash": "5e1f09ab",
  "project": {
    "format": 1,
    "id": "prj_9c1e0a7b44d2",
    "title": "A Casa das Marés",
    "...": "..."
  },
  "texts": {
    "sc_3f9a1c2b7d4e": "O vento soprava frio naquela manhã…\n",
    "nt_5d6e7f801a2b": "Amiga de infância…\n"
  }
}
```

### `indice.json` — índice do histórico

Lista de `{ id, createdAt, label, auto, words, hash }`, da mais nova para a mais antiga. É só um
atalho: se faltar ou estiver corrompido, o app refaz a partir dos arquivos. **Não é sincronizado**
(cada computador refaz o seu).

Poda: das versões automáticas, as 20 mais recentes ficam; das mais antigas, fica a mais recente de
cada dia. Versões manuais nunca são podadas.

---

## `.talia/lixeira/`

O conteúdo excluído fica aqui com o nome `<stamp>-<nome original>`, onde `stamp` é a data ISO
com `:` e `.` trocados por `-` (por exemplo `2026-11-02T20-30-00-000Z-a-carta.md`, ou uma pasta
inteira de capítulo `2026-11-02T20-30-00-000Z-o-comeco/`). O estado do editor de cada cena vai
junto como `<stamp>-<id>.yjs`. **A lixeira não é sincronizada.**

### `indice.json`

Array de entradas (`TrashEntry`), da mais recente para a mais antiga:

| Campo       | Tipo                  | Descrição                                                     |
| ----------- | --------------------- | ------------------------------------------------------------- |
| `id`        | string                | `<stamp>-<8 hex>`                                             |
| `deletedAt` | number                | ms desde 1970                                                 |
| `title`     | string                | Nome mostrado na Lixeira                                      |
| `item`      | TrashItem             | O que era e de onde veio (abaixo)                             |
| `path`      | string                | Onde o arquivo/pasta está dentro da lixeira                   |
| `ydocs`     | `Record<id, caminho>` | `.yjs` guardados junto (id da cena/nota → caminho na lixeira) |

`item` é um destes:

| `kind`         | Campos                                                                      | Restaurável                                                    |
| -------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `"scene"`      | `scene` (Scene), `chapter` (`{ id, title }` de origem), `index` (posição)   | Sim                                                            |
| `"chapter"`    | `chapter` (Chapter completo, com as cenas), `index`                         | Sim                                                            |
| `"note"`       | `note` (Note)                                                               | Sim                                                            |
| `"attachment"` | `name` (nome do arquivo em `anexos/`)                                       | Sim                                                            |
| `"backup"`     | `label` — cópia de segurança (restaurar versão, conflito ou mescla do sync) | Sim, como cópia (textos novos e anexos; arquivos técnicos não) |

Exemplo:

```json
[
  {
    "id": "2026-11-02T20-30-00-000Z-1f2e3d4c",
    "deletedAt": 1762115400000,
    "title": "A carta",
    "item": {
      "kind": "scene",
      "scene": {
        "id": "sc_3f9a1c2b7d4e",
        "title": "A carta",
        "file": "a-carta.md"
      },
      "chapter": { "id": "ch_1a2b3c4d5e6f", "title": "O começo" },
      "index": 0
    },
    "path": ".talia/lixeira/2026-11-02T20-30-00-000Z-a-carta.md",
    "ydocs": {
      "sc_3f9a1c2b7d4e": ".talia/lixeira/2026-11-02T20-30-00-000Z-sc_3f9a1c2b7d4e.yjs"
    }
  }
]
```

Rótulos das cópias de segurança (`backup`) criadas pelo app:

| Rótulo                                                                              | Origem                                                            |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `manuscrito/ antes de voltar para "<versão>"` (e `notas/ …`)                        | Restaurar o projeto inteiro pelo histórico (a pasta inteira)      |
| `"<título>" — versão deste computador antes de mesclar (conferir)` / `… do Drive …` | Rede de segurança da mescla Yjs (um `.md` gerado do lado afetado) |
| `<caminho> — versão do Drive (conflito)`                                            | Arquivo comum alterado dos dois lados (fica o local)              |
| `<caminho> (excluído em outro computador)`                                          | Arquivo excluído no outro computador                              |
| `"<título>" — editado fora do app antes de sincronizar`                             | `.md` editado fora do app e refeito a partir do `.yjs` que chegou |
| `project.json do Drive (com problema)`                                              | `project.json` do Drive corrompido ou inválido (fica o local)     |

Esvaziar a lixeira apaga a pasta `.talia/lixeira/` inteira.

---

## `.talia/livro.json` (projeto gráfico)

Criado pela aba Diagramação na primeira mudança. Sincronizado. Ao ler, cada campo é conferido e
o que for inválido volta ao padrão.

| Campo                   | Tipo    | Padrão       | Descrição                                                                          |
| ----------------------- | ------- | ------------ | ---------------------------------------------------------------------------------- |
| `format`                | `1`     | `1`          | Versão do formato                                                                  |
| **`cover`**             |         |              | **Capa, quarta capa, lombada e orelhas**                                           |
| `cover.image`           | string  | `""`         | Imagem da capa: `anexos/<arquivo>` ou vazio                                        |
| `cover.backImage`       | string  | `""`         | Imagem de fundo da quarta capa: `anexos/<arquivo>` ou vazio                        |
| `cover.frontArt`        | string  | `""`         | Capa pronta (arte enviada, já com textos): `anexos/<arquivo>` ou vazio             |
| `cover.spineArt`        | string  | `""`         | Lombada pronta: `anexos/<arquivo>` ou vazio                                        |
| `cover.backArt`         | string  | `""`         | Quarta capa pronta: `anexos/<arquivo>` ou vazio                                    |
| `cover.background`      | cor     | `#1d2a44`    | Cor de fundo (`#rrggbb`)                                                           |
| `cover.background2`     | cor     | `#0b1020`    | Segunda cor (degradê de cima para baixo); `""` = cor única                         |
| `cover.textColor`       | cor     | `#f5efe3`    | Cor do texto                                                                       |
| `cover.accent`          | cor     | `#e7c27d`    | Cor de destaque (fio, frase da quarta capa, autor na lombada, títulos das orelhas) |
| `cover.titleFont`       | string  | `"fraunces"` | `garamond`, `literata`, `fraunces` ou `figtree`                                    |
| `cover.subtitle`        | string  | `""`         | Subtítulo (até 300)                                                                |
| `cover.placement`       | string  | `"center"`   | Posição do título: `top`, `center`, `bottom`                                       |
| `cover.shade`           | number  | `0.35`       | Escurecimento da imagem, 0 a 0,8                                                   |
| `cover.synopsis`        | string  | `""`         | Sinopse (até 5000); também na orelha da frente                                     |
| `cover.tagline`         | string  | `""`         | Frase de destaque da quarta capa (até 300)                                         |
| `cover.barcode`         | boolean | `true`       | Reservar o espaço do código de barras (ISBN)                                       |
| `cover.flaps`           | boolean | `false`      | Com orelhas                                                                        |
| `cover.flapWidth`       | number  | `80`         | Largura de cada orelha, em mm (40 a 120)                                           |
| `cover.authorBio`       | string  | `""`         | "Sobre o autor" (até 3000)                                                         |
| **`layout`**            |         |              | **Miolo**                                                                          |
| `layout.trim`           | string  | `"14x21"`    | Formato: `14x21`, `16x23`, `A5`, `A4`                                              |
| `layout.paper`          | string  | `"polen"`    | `offset` (0,0572 mm/página) ou `polen` (0,0635 mm/página)                          |
| `layout.font`           | string  | `"garamond"` | Fonte do texto (mesmas opções de `titleFont`)                                      |
| `layout.size`           | number  | `11.5`       | Corpo, em pt                                                                       |
| `layout.leading`        | number  | `1.45`       | Entrelinha, em múltiplos do corpo                                                  |
| `layout.marginTop`      | number  | `18`         | Margem superior (mm)                                                               |
| `layout.marginBottom`   | number  | `20`         | Margem inferior (mm)                                                               |
| `layout.marginInner`    | number  | `20`         | Medianiz — margem do lado da costura (mm)                                          |
| `layout.marginOuter`    | number  | `15`         | Margem externa (mm)                                                                |
| `layout.dropCap`        | boolean | `true`       | Capitular no começo de cada capítulo                                               |
| `layout.ornament`       | string  | `"❦"`        | Ornamento entre cenas (`❦`, `✦`, `⁂`, `* * *`, `~`, `◆`)                           |
| `layout.runningHeads`   | boolean | `true`       | Cabeço: autor nas páginas pares, título nas ímpares                                |
| `layout.chapterOnRight` | boolean | `true`       | Capítulo começa na página da direita                                               |
| `layout.pages`          | number  | `0`          | Páginas do miolo; `0` = estimar pelas palavras (até 5000)                          |

Medidas derivadas (não gravadas): lombada = `páginas × espessura do papel + 1 mm`; capa aberta =
`(orelha) + quarta + lombada + capa + (orelha)` de largura, mais 3 mm de sangria em cada borda.

---

## `.talia/sync.json` (estado da sincronização)

Existe só quando a sincronização do projeto está ligada **neste computador**. Não é
sincronizado. Apagar o arquivo desliga a sincronização (a próxima vez que ligar, tudo é comparado
de novo, sem base).

| Campo         | Tipo                                    | Descrição                                                                     |
| ------------- | --------------------------------------- | ----------------------------------------------------------------------------- |
| `folderId`    | string                                  | Id da pasta do projeto no Google Drive                                        |
| `base`        | `Record<caminho, md5>`                  | MD5 de cada arquivo na última sincronização (igual nos dois lados)            |
| `cache`       | `Record<caminho, { size, mtime, md5 }>` | MD5 local já calculado, reaproveitado enquanto tamanho e data não mudam       |
| `projectBase` | string \| null                          | Texto do `project.json` na última sincronização (base da junção da estrutura) |
| `lastSync`    | number \| null                          | Fim da última sincronização, em ms                                            |
| `folderTitle` | string (opcional)                       | Nome dado à pasta no Drive; se o projeto mudar de nome, a pasta é renomeada   |

Exemplo (resumido):

```json
{
  "folderId": "1AbCdEfGhIjKlMnOpQrStUvWxYz",
  "base": {
    ".talia/project.json": "9e107d9d372bb6826bd81d3542a419d6",
    "manuscrito/o-comeco/a-carta.md": "e4d909c290d0fb1ca068ffaddf22cbd0"
  },
  "cache": {
    "manuscrito/o-comeco/a-carta.md": {
      "size": 1532,
      "mtime": 1762114625000,
      "md5": "e4d909c290d0fb1ca068ffaddf22cbd0"
    }
  },
  "projectBase": "{\n  \"format\": 1,\n  ...\n}\n",
  "lastSync": 1762114700000
}
```

### O que vai para o Drive

Tudo da pasta do projeto, **exceto**: `.talia/sync.json`, `.talia/versoes/indice.json`,
`.talia/lixeira/**`, `*.talia-tmp`, `.DS_Store`, `Thumbs.db` e `desktop.ini`.

No Drive, a estrutura é espelhada dentro de `Tália/<título do projeto>/`. A pasta `Tália` tem
a propriedade de app `taliaRoot = "1"` e a pasta do projeto `taliaProject = <project.id>` — é
por ela (e não pelo nome) que o app encontra o projeto.

---

## Fora da pasta do projeto

Algumas informações ficam no computador, no armazenamento local do app (não na pasta do projeto e
não no Drive): projetos recentes, último projeto aberto, tema e preferências, barra lateral
recolhida, opções de exportação de cada projeto, credenciais do Google e a conta conectada. A
lista completa de chaves está em
[Arquitetura → Estado do app](arquitetura.md#18-estado-do-app-zustand-e-armazenamento-local).

## Prévia no navegador

Na prévia, cada arquivo é uma entrada do IndexedDB `talia` / `files` com a chave
`browser:<uuid>` + `\0` + caminho relativo, e o valor é o texto ou os bytes. As pastas não
existem de fato: valem enquanto houver arquivos com aquele prefixo. O formato dos arquivos é o
mesmo descrito acima.

## `.talia/mapa-mundi.json`

Mapa-múndi do projeto (opcional; só existe depois de gerado). Guarda só o que é editável; clima,
biomas, rios, fronteiras e estradas são recalculados ao abrir (`world/worldgen.ts`,
`deriveWorld`).

| Campo      | Tipo   | Descrição                                                                                                                                                                                                                                                                            |
| ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `format`   | número | Sempre `1`                                                                                                                                                                                                                                                                           |
| `name`     | string | Nome do mundo                                                                                                                                                                                                                                                                        |
| `cols`     | número | Colunas da grade (360: 1° de longitude cada)                                                                                                                                                                                                                                         |
| `rows`     | número | Linhas da grade (180: 1° de latitude cada, do polo norte ao sul)                                                                                                                                                                                                                     |
| `options`  | objeto | Opções usadas para gerar: `seed`, `template` (`continentes`/`ilhas`/`pangeia`), `land` (0,15 a 0,6), `states`, `burgs`                                                                                                                                                               |
| `heights`  | string | Altura de cada célula (0 a 255; 128 ou mais é terra), linha por linha, em base64                                                                                                                                                                                                     |
| `burgs`    | array  | Cidades: `id`, `name`, `x`, `y` (em células) e, opcional, `noteId` (o lugar do Mundo ligado)                                                                                                                                                                                         |
| `states`   | array  | Estados: `id`, `name`, `color` (`#rrggbb`), `capital` (o `id` da cidade capital; o território é calculado a partir dela), `noteId` (o lugar do Mundo que é este estado) e `form` (forma de governo)                                                                                  |
| `routes`   | array  | Rotas desenhadas: `id`, `name`, `type` (`principal`/`estrada`/`trilha`/`maritima`) e `points` (pontos de passagem `[x, y]`, em células). O caminho entre os pontos é recalculado ao abrir. As estradas geradas não ficam aqui                                                        |
| `cultures` | array  | Povos: `id`, `name`, `base` (base de nomes: `lusitana`, `nordica`, `elfica`, `desertica`, `eslava`, `latina`, `celta`), `type` (`navegante`, `montanhes`, `ribeirinho`, `lacustre`, `nomade`, `cacador`, `generico`), `color` e o centro `x`, `y`. O território é calculado ao abrir |
| `options.era` | texto | Opcional: `atual` ou `futurista` (sem ele, fantasia). Muda estilo, nomes de estradas, população e marcadores |
| `climate` | objeto | Opcional ("Configurar mundo"): `equator`, `northPole`, `southPole` (°C ao nível do mar), `precipitation` (% da chuva da Terra) e `winds` (6 direções em graus da bússola, para onde sopra o vento em cada faixa de 30°, de 90°N a 90°S). Sem ele, vale o clima da Terra |

Ao abrir, um arquivo da grade antiga (320×200, só uma região) é convertido para o planeta (as alturas são reamostradas e as posições, escaladas); outro tamanho ou formato é ignorado (como se não houvesse mapa); cidades
fora da grade e estados cuja capital não existe são descartados. No sync, segue a regra dos outros
arquivos de `.talia/`.
