# Guia do usuário do InkFlow

Este guia mostra tudo o que o InkFlow faz, na ordem em que você vai encontrar cada coisa: da
instalação até gerar o PDF para a gráfica. Não é preciso saber programar.

> No Mac, onde o guia diz **Ctrl**, use **⌘ (Command)**.

## Sumário

1. [Instalar e abrir o app](#1-instalar-e-abrir-o-app)
2. [Projetos](#2-projetos)
3. [A barra lateral](#3-a-barra-lateral)
4. [O editor](#4-o-editor)
5. [Anexos (imagens, vídeos, áudios e arquivos)](#5-anexos-imagens-vídeos-áudios-e-arquivos)
6. [Busca no projeto](#6-busca-no-projeto)
7. [Grafo e minimapa](#7-grafo-e-minimapa)
8. [Histórico de versões](#8-histórico-de-versões)
9. [Lixeira](#9-lixeira)
10. [Configurações](#10-configurações)
11. [Atalhos de teclado](#11-atalhos-de-teclado)
12. [Perguntas frequentes e solução de problemas](#12-perguntas-frequentes-e-solução-de-problemas)

---

## 1. Instalar e abrir o app

### 1.1 Com o instalador

Se você recebeu um instalador do InkFlow (no Windows, um arquivo `.exe` ou `.msi`), basta abrir
e seguir as telas. O InkFlow aparece no menu Iniciar.

> Por enquanto o app ainda não está nas lojas (Microsoft Store / Mac App Store). O instalador do
> Windows é gerado automaticamente a cada mudança no código (veja
> [Arquitetura → Gerar o instalador](arquitetura.md#15-gerar-o-instalador-e-publicar)).

### 1.2 Rodando a partir do código (Windows)

Quem vai testar o app a partir do código precisa instalar algumas ferramentas uma vez só. No
Windows existe um script que verifica e instala o que falta (Git, Node.js, Rust, as "Build Tools"
de C++ do Visual Studio, o WebView2 e o pnpm):

1. Abra o **PowerShell** (menu Iniciar → digite "PowerShell").
2. Vá até a pasta `app\scripts` do projeto e rode:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\setup-windows.ps1
   ```

   Algumas instalações pedem permissão de administrador. Ao terminar, **feche e abra o
   PowerShell de novo** (os programas recém-instalados só aparecem em terminais novos).

3. Se o script avisar que o PowerShell está bloqueando scripts, rode uma vez:

   ```powershell
   Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
   ```

   (ou use `pnpm.cmd` no lugar de `pnpm` nos comandos abaixo). Veja também a
   [pergunta sobre o PowerShell](#o-powershell-diz-que-a-execução-de-scripts-foi-desabilitada).

4. Dentro da pasta `app`:

   ```powershell
   pnpm install
   pnpm tauri dev
   ```

   A primeira vez demora alguns minutos (o Rust compila a parte nativa do app). Nas próximas é
   rápido.

### 1.3 Rodando a partir do código (Mac e Linux)

Instale o **Node.js LTS**, o **pnpm** (`npm install -g pnpm`) e o **Rust**
(<https://rustup.rs>). No Mac, rode também `xcode-select --install`. No Linux, o Tauri precisa
das bibliotecas do WebKitGTK (no Ubuntu: `libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev
libayatana-appindicator3-dev`). Depois, dentro de `app/`: `pnpm install` e `pnpm tauri dev`.

### 1.4 Prévia no navegador

`pnpm dev` abre só a interface no navegador, em <http://localhost:1420>. É útil para
experimentar, mas tem diferenças importantes:

- os projetos ficam guardados **só naquele navegador** (no armazenamento interno dele, não numa
  pasta do computador). Numa janela anônima eles somem ao fechar a página;
- na primeira visita o app cria sozinho um projeto de exemplo, **"Meu Romance (exemplo)"**;
- não há sincronização com o Google Drive;
- exportar e "abrir" um anexo **baixam** o arquivo, em vez de perguntar onde salvar ou abrir no
  programa padrão.

`pnpm build:preview` gera um único arquivo `dist-preview/index.html` que roda essa prévia sem
servidor.

---

## 2. Projetos

Cada livro é um **projeto**, e cada projeto é uma **pasta** no seu computador. Dentro dela ficam
os capítulos e cenas (arquivos `.md` que qualquer editor de texto abre), as notas, os anexos e
uma pasta escondida `.inkflow` com os dados do app (ordem dos capítulos, histórico, lixeira). O
formato exato está em [Formato do projeto](formato-do-projeto.md).

### 2.1 A tela inicial

Ao abrir o app sem nenhum projeto aberto, você vê:

- **Novo projeto** — o campo "Nome do livro" e o botão **Criar projeto**;
- **Abrir projeto existente** — para escolher uma pasta do computador;
- **Abertos recentemente** — os últimos projetos usados (até 12). Clique para abrir. O **×** ao
  lado tira o projeto da lista; **a pasta continua no computador**;
- **No Google Drive** (só se uma conta Google estiver conectada) — veja
  [Baixar um projeto do Drive](#baixar-um-projeto-do-drive-em-outro-computador);
- o botão de **Configurações** (engrenagem), no alto.

Ao abrir o app, o InkFlow **reabre sozinho o último projeto** que estava aberto.

### 2.2 Criar um projeto

1. Digite o nome do livro (por exemplo, "A Casa das Marés") e clique em **Criar projeto**.
2. Escolha **onde** a pasta do projeto vai ser criada (por exemplo, "Documentos").
3. O InkFlow cria uma pasta com o nome do livro (mantendo acentos e espaços) e abre o projeto
   com um "Capítulo 1" e uma "Cena 1".

Se já existir uma pasta com esse nome no local escolhido, o app avisa e não cria nada.

### 2.3 Abrir um projeto existente

**Abrir projeto existente** pede uma pasta:

- se ela já é um projeto do InkFlow (tem `.inkflow/project.json`), ele abre;
- se é uma pasta comum, o app pergunta se você quer **Criar projeto nesta pasta**. Ele cria
  `manuscrito/`, `.inkflow/` e um arquivo `LEIA-ME.md` (se ainda não existir), com o nome da
  pasta como título. **Os arquivos que já estavam lá não são alterados.**

Use isso também quando você mover a pasta de um projeto de lugar: a lista de recentes guarda o
caminho antigo.

### 2.4 Trocar de projeto, renomear e voltar à lista

Clique no **nome do projeto**, no alto da barra lateral. O menu tem:

- **Trocar para** — os outros projetos recentes;
- **Renomear este projeto** — muda o título (o nome da pasta no computador continua o mesmo);
- **Abrir projeto existente…** (só no app desktop);
- **Novo projeto…** e **Ver todos os projetos** — os dois fecham o projeto atual e voltam para a
  tela inicial.

Antes de trocar ou fechar, o InkFlow grava o que estiver pendente, guarda uma versão automática
no histórico (se algo mudou) e, se a sincronização estiver ligada, sincroniza com o Drive.

---

## 3. A barra lateral

Do alto para baixo:

1. **Nome do projeto** (o menu de projetos, acima).
2. **Total de palavras** do livro (só as cenas do manuscrito; notas não contam), o botão de
   **busca** (lupa) e o botão **Grafo**.
3. **Manuscrito** — capítulos e cenas.
4. **Notas** — Personagens, Lugares e Ideias.
5. **Anexos** — arquivos do projeto.
6. No rodapé, **Configurações** e **Lixeira**.

### 3.1 Manuscrito: capítulos e cenas

- **Novo capítulo:** o **+** ao lado de "Manuscrito". O capítulo nasce como "Capítulo N" e já
  fica pronto para você digitar o nome.
- **Nova cena:** passe o mouse sobre o capítulo e clique no **+** dele (ou em "+ Adicionar a
  primeira cena", num capítulo vazio).
- **Abrir uma cena:** clique nela.
- **Renomear:** clique duas vezes no nome, ou use o lápis. **Enter** confirma, **Esc** cancela.
  Renomear muda também o nome do arquivo no computador e atualiza os `[[links]]` que apontam
  para a cena (veja [Links](#43-links-e-menções)).
- **Reordenar:** arraste capítulos e cenas, ou use as setas **↑ ↓**. Uma cena arrastada para cima
  de um capítulo entra no fim dele. As setas de uma cena passam para o capítulo vizinho quando
  ela chega no começo ou no fim do seu.
- **Excluir:** a lixeirinha. O app pede confirmação; o texto vai para a
  [Lixeira](#9-lixeira) e pode voltar.
- O número à direita de cada capítulo e cena é a contagem de palavras.
- A setinha ao lado do capítulo recolhe ou mostra as cenas dele.

### 3.2 Notas: personagens, lugares e ideias

As notas guardam o que não é o livro em si: fichas de personagens, lugares, ideias de enredo.
Ficam em ordem alfabética, cada tipo no seu grupo.

- **Nova nota:** o **+** de "Personagens", "Lugares" ou "Ideias".
- Abrir, renomear e excluir funcionam como nas cenas. Notas não têm ordem manual.
- O nome de uma nota é especial: quando ele aparece no texto das cenas, conta como **menção** e
  liga a nota àquela cena no [grafo](#7-grafo-e-minimapa).

### 3.3 Anexos

Lista os arquivos da pasta `anexos/` do projeto. Veja [Anexos](#5-anexos-imagens-vídeos-áudios-e-arquivos).

### 3.4 Recolher seções e a barra inteira

- Clique no título de uma seção (**Manuscrito**, **Notas**, **Anexos**) ou de um grupo de notas
  para recolher ou mostrar o conteúdo. O app lembra o que ficou recolhido.
- **Ctrl + \\** esconde ou mostra a **barra lateral inteira**, para escrever com a tela livre.
  O mesmo vale para o botão de painel no alto da barra (e no alto do texto, quando ela está
  escondida). O app lembra a escolha.
- Em telas estreitas (celular, janela pequena), a barra vira uma gaveta que abre pelo botão de
  menu.

---

## 4. O editor

O texto aberto ocupa o centro da tela. No alto ficam o nome do capítulo e o nome do texto
(clique no nome para renomear), o indicador de sincronização (nuvem) e o de gravação
(**Salvando…** / **Salvo**). Embaixo, a contagem de palavras da **cena**, do **capítulo** e do
**livro**.

**Não existe botão de salvar:** o InkFlow grava sozinho menos de um segundo depois que você
para de digitar, e também ao trocar de texto, de janela ou fechar o app. Se a gravação falhar
(por exemplo, a pasta ficou inacessível), aparece **Não foi possível salvar** e o app não fecha
até conseguir gravar.

### 4.1 Barra de ferramentas

Da esquerda para a direita:

| Ferramenta                   | O que faz                                                                  |
| ---------------------------- | -------------------------------------------------------------------------- |
| Estilo do parágrafo          | **Texto** (parágrafo comum), **Título 1**, **Título 2**, **Título 3**      |
| Negrito, Itálico, Tachado    | Formatação do trecho selecionado (Ctrl+B, Ctrl+I, Ctrl+Shift+S)            |
| Marca-texto                  | Marca-texto amarelo (Ctrl+Shift+H). **Não sai no livro exportado**         |
| Lista, Lista numerada        | Lista com marcadores ou numerada                                           |
| Citação                      | Parágrafo recuado, para epígrafes, cartas, citações                        |
| Separador de cena (\* \* \*) | Linha que separa duas partes da mesma cena                                 |
| Limpar formatação            | Tira negrito, itálico etc. e volta o bloco a parágrafo comum               |
| Clipe                        | Anexar arquivo (veja [Anexos](#5-anexos-imagens-vídeos-áudios-e-arquivos)) |
| Desfazer / Refazer           | Ctrl+Z / Ctrl+Shift+Z (Ctrl+Y também refaz)                                |
| Relógio                      | Abre o [Histórico de versões](#8-histórico-de-versões)                     |
| Grafo pequeno                | Mostra ou esconde o [minimapa](#72-minimapa)                               |

Você também pode formatar escrevendo como no Markdown: `**negrito**`, `*itálico*`, `~~tachado~~`,
`==destaque==`, `# ` no começo da linha para título, `> ` para citação, `- ` para lista, `1. `
para lista numerada.

O corretor ortográfico do sistema funciona normalmente (o texto é marcado como português do
Brasil).

### 4.2 Menu do botão direito

Selecione um trecho e clique com o **botão direito**. Aparece um menu com:

- negrito, itálico, tachado e destacar;
- **Recortar** e **Copiar**;
- **Título** (transforma o parágrafo em Título 2), **Citação**, **Lista**;
- se o trecho for curto (até 80 letras, numa linha só):
  - se já existe uma cena ou nota com esse nome: **Transformar em link [[…]]** e **Abrir "…"**;
  - se não existe: **Criar nota "…"** como **Personagem**, **Lugar** ou **Ideia** (o trecho
    vira um `[[link]]` para a nota nova);
- **Limpar formatação**;
- quantas palavras estão selecionadas.

**Sem seleção, ou segurando Shift**, o botão direito abre o menu normal do sistema — é nele que
ficam as **sugestões do corretor ortográfico**.

### 4.3 Links e menções

Para ligar um texto a outro, escreva o nome entre colchetes duplos: `[[Helena]]`. Para mostrar
outra palavra no lugar do nome, use uma barra: `[[Helena|a amiga]]`.

- Ao digitar `[[`, aparece uma lista com as notas e cenas do projeto (as notas primeiro).
  Use **↑ ↓** e **Enter** (ou **Tab**), ou clique. Se o nome digitado não existe, a lista
  oferece criar uma nota nova com esse nome (personagem, lugar ou ideia).
- Links aparecem destacados. Um link para algo que ainda não existe aparece **tracejado**.
- **Ctrl + clique** num link abre o texto ligado. Num link tracejado, **Ctrl + clique cria uma
  nota do tipo Ideia** com esse nome e abre.
- O nome é procurado sem diferenciar maiúsculas e minúsculas.
- **Menções:** sempre que o nome de uma **nota** aparece no texto, mesmo sem colchetes, ele
  ganha um sublinhado leve e conta como ligação no grafo. Menções diferenciam maiúsculas
  ("Rosa" a personagem não é "rosa" a cor) e só contam palavras inteiras. Ctrl + clique numa
  menção também abre a nota.
- Ao **renomear** uma cena ou nota, todos os `[[Nome antigo]]` do projeto viram `[[Nome novo]]`
  automaticamente (o texto depois da barra é mantido) e o app avisa quantos links mudaram.
- Na exportação, os links viram texto comum: `[[Helena]]` sai como "Helena" e
  `[[Helena|a amiga]]` sai como "a amiga".

> Se uma cena e uma nota tiverem exatamente o mesmo nome, evite: o link pode abrir a cena em vez
> da nota.

### 4.4 Quando o arquivo muda fora do app

Os textos são arquivos `.md` comuns, que você pode abrir em outro programa. O InkFlow percebe a
mudança quando você volta para a janela dele ou reabre o texto:

- se você não estava editando aquele texto no InkFlow, ele simplesmente passa a mostrar o texto
  novo (e dá para desfazer com Ctrl+Z);
- se os dois lados mudaram ao mesmo tempo, **nada se perde**: a versão de fora é guardada como
  um texto novo chamado **"Nome (versão externa)"**, logo abaixo do original, e o app avisa.

---

## 5. Anexos (imagens, vídeos, áudios e arquivos)

Imagens, vídeos, áudios, PDFs e outros arquivos podem fazer parte do projeto. Eles são
**copiados** para a pasta `anexos/` (o arquivo original fica onde estava).

**Para anexar:**

- **arraste** o arquivo para dentro do texto, ou **cole** (Ctrl+V) uma imagem copiada;
- ou clique no **clipe** da barra de ferramentas;
- ou use o **+** da seção **Anexos** na barra lateral (só copia, não insere no texto).

**No texto**, o anexo aparece como um bloco: imagens são mostradas, vídeos e áudios ganham um
tocador, outros arquivos aparecem como um cartão com o nome. **Clique duas vezes** para abrir no
programa padrão do computador. Se o arquivo sumir da pasta, o bloco avisa
"Arquivo não encontrado".

**Na barra lateral (seção Anexos):**

- com um texto aberto, clicar num anexo **insere** ele no texto, onde está o cursor;
- sem texto aberto, clicar **abre** o arquivo;
- o botão de **abrir** (setas) abre no programa padrão;
- a **lixeira** manda o anexo para a [Lixeira](#9-lixeira). Os textos que usavam o arquivo vão
  mostrar que ele sumiu (até você restaurá-lo).

O nome do arquivo dentro de `anexos/` é simplificado (sem acentos e espaços) e ganha `-2`, `-3`
se já existir outro igual. Formatos reconhecidos: imagens PNG, JPG, GIF, WebP, AVIF, BMP, SVG;
vídeos MP4, M4V, WebM, MOV, OGV; áudios MP3, WAV, OGG, OGA, Opus, M4A, AAC, FLAC. Qualquer outro
arquivo também pode ser anexado, mas aparece só como cartão.

Por segurança, o app desktop só **abre no programa padrão** imagens, áudios, vídeos, PDF, textos
(`.txt`, `.md`, `.rtf`), documentos de escritório (Word, Excel, PowerPoint e os equivalentes do
LibreOffice), CSV e EPUB. Outros tipos (um `.zip`, um programa) continuam guardados na pasta
`anexos/`, mas o InkFlow não os abre: abra pela pasta do projeto, no gerenciador de arquivos.

Na exportação, só as **imagens** PNG, JPG, GIF, WebP e SVG entram no livro (e só se "Imagens"
estiver marcado). Vídeos, áudios e outros arquivos ficam de fora.

---

## 6. Busca no projeto

**Ctrl + Shift + F** (ou a lupa na barra lateral) abre a busca no lugar das listas da barra.

- Procura no **texto e no título** de todas as cenas (na ordem do livro) e notas.
- Por padrão **ignora maiúsculas e acentos**: "joao" encontra "João".
- **Aa** — diferenciar maiúsculas e acentos.
- **ab** sublinhado — só palavras inteiras ("mar" não encontra "amar").
- Os resultados mostram cada texto, quantas vezes o termo aparece e um trecho de cada
  ocorrência (até 30 por texto). Clique num trecho para abrir o texto **com a ocorrência
  selecionada**. **Enter** no campo abre o primeiro resultado.
- Enquanto a busca está aberta, as ocorrências aparecem destacadas também no editor.
- **Esc** (ou o **×**) fecha a busca.

A busca não procura dentro dos anexos nem na lixeira.

---

## 7. Grafo e minimapa

### 7.1 Grafo de conexões

O botão **Grafo** (barra lateral) mostra todos os textos do projeto como pontos e as ligações
entre eles como linhas, no estilo do Obsidian:

- cada **cor** é um tipo: cenas, personagens, lugares e ideias. Clique nos botões do alto para
  esconder ou mostrar cada tipo;
- **linha cheia** = link `[[…]]` escrito; **linha tracejada** = menção automática (o nome de uma
  nota aparecendo no texto). A caixa **Menções automáticas** liga ou desliga essas linhas;
- pontos com mais ligações são maiores; o texto aberto ganha um contorno;
- **passe o mouse** sobre um ponto para destacar os vizinhos;
- **clique** num ponto para abrir o texto;
- **arraste um ponto** para mexer nele; **arraste o fundo** para mover a visão;
- **roda do mouse** aproxima e afasta (zoom);
- **Centralizar** enquadra o grafo de novo.

Se ainda não há nenhuma ligação, o grafo explica como criar: escreva `[[Nome]]` numa cena ou crie
uma nota com um nome que aparece nas cenas.

### 7.2 Minimapa

O minimapa é um grafo pequeno, no canto da página, com **o texto aberto e tudo o que se liga a
ele**. O número em "Conexões" é quantos textos estão ligados.

- clique num ponto para abrir aquele texto;
- **+**, **−** e o alvo: aproximar, afastar e centralizar;
- o botão de expandir abre o grafo completo; o **×** esconde o minimapa (ele volta pelas
  Configurações ou pelo botão de grafo na barra de ferramentas);
- **para mudar de lugar**, arraste o minimapa pela barra de cima dele: ao soltar, ele encaixa na
  posição mais próxima. Pelo teclado, selecione a barra (Tab) e use as setas.

São 8 posições: os 4 cantos (o minimapa flutua sobre a página) e o meio de cada lado (no topo e
embaixo ele ocupa a largura toda; nas laterais, a altura toda). A posição e a opção de contar
menções ficam em [Configurações → Geral](#101-geral).

---

## 8. Histórico de versões

O histórico guarda **fotografias do projeto inteiro** (a estrutura e o texto de todas as cenas e
notas) para você poder voltar atrás. Abra pelo **relógio** na barra de ferramentas do editor.

### 8.1 Quando as versões são guardadas

- **Automaticamente:** ao abrir o projeto, a cada 10 minutos com o projeto aberto e ao fechar ou
  trocar de projeto — **só quando algo mudou** desde a última versão.
- **Por você:** escreva um nome (opcional, por exemplo "Antes da revisão") e clique em
  **Salvar versão agora**.
- Antes de qualquer restauração, o app guarda uma versão "Antes de restaurar…" / "Antes de
  voltar para…", para você poder desfazer.

As versões automáticas mais recentes (20) ficam todas; das mais antigas, fica **uma por dia**.
As versões salvas por você **nunca são apagadas sozinhas**.

> Os **anexos não entram** no histórico (eles ficam só na pasta `anexos/`). Fechar a janela do
> app direto, sem voltar à lista de projetos, não gera a versão "Ao fechar o projeto" — a próxima
> versão automática acontece ao abrir.

### 8.2 Comparar e restaurar

À esquerda ficam as versões, agrupadas por dia (Hoje, Ontem, datas), com o horário, o nome, as
palavras do manuscrito e quanto mudou em relação à versão anterior.

Ao escolher uma versão, o centro mostra cada texto com uma etiqueta:

- **Mudou depois** — o texto está diferente agora;
- **Excluído depois** — existia nessa versão e foi excluído;
- **Não existia** — foi criado depois dessa versão;
- **Igual a agora** — escondidos por padrão ("Mostrar N textos iguais a agora").

Clique num texto para ver como ele estava. Então:

- **Restaurar este texto** — volta só esse texto para como estava (o resto do projeto não muda);
- **Recriar este texto** — para um texto excluído depois: ele volta no mesmo capítulo (ou num
  capítulo novo com o mesmo nome, se o capítulo também sumiu);
- **Restaurar projeto inteiro** — volta tudo: capítulos, cenas, notas e textos. As pastas
  `manuscrito/` e `notas/` atuais vão antes para a [Lixeira](#9-lixeira) e a situação atual fica
  guardada no histórico;
- **Excluir esta versão** — a lixeirinha, com confirmação.

---

## 9. Lixeira

No InkFlow **nada é apagado de verdade** quando você exclui: cenas, capítulos, notas e anexos vão
para a **Lixeira**, que fica dentro da pasta do projeto (`.inkflow/lixeira/`). Abra pelo rodapé
da barra lateral.

Cada item mostra o nome, o tipo (por exemplo "Cena de "Capítulo 2"", "Capítulo com 3 cenas",
"Personagem", "Anexo"), a data em que foi excluído e o começo do texto.

- **Restaurar** — põe de volta no lugar. Se o capítulo de uma cena também foi excluído, ela volta
  num capítulo novo com o mesmo nome. Se já existe algo com o mesmo nome de arquivo, o restaurado
  ganha um sufixo (`-2`).
- **Apagar de vez** — a lixeirinha do item, com confirmação. Não dá para desfazer.
- **Esvaziar lixeira** — apaga de vez tudo o que está lá.

### Cópias de segurança na Lixeira

Além do que você excluiu, a Lixeira guarda **cópias de segurança** feitas pelo app. Elas aparecem
com o ícone de relógio e o texto "Cópia guardada ao restaurar uma versão", e **não têm botão
Restaurar** (só "Apagar de vez"). Podem ser:

| Nome na Lixeira                                                                  | De onde veio                                                                                                    |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `manuscrito/ antes de voltar para "…"` e `notas/ antes de voltar para "…"`       | Você restaurou o projeto inteiro pelo histórico                                                                 |
| `"Título" — versão deste computador antes de mesclar (conferir)` (ou `do Drive`) | A sincronização mesclou edições dos dois computadores e algum parágrafo de um dos lados pode ter ficado de fora |
| `caminho/arquivo — versão do Drive (conflito)`                                   | O mesmo arquivo mudou nos dois computadores e ficou a versão deste                                              |
| `caminho/arquivo (excluído em outro computador)`                                 | O arquivo foi excluído no outro computador                                                                      |
| `"Título" — editado fora do app antes de sincronizar`                            | Você editou o arquivo `.md` em outro programa e, na mesma sincronização, chegou uma versão nova daquele texto   |
| `project.json do Drive (com problema)`                                           | A estrutura do projeto que estava no Drive veio corrompida; ficou a deste computador                            |

Para recuperar algo de uma cópia de segurança, abra a pasta `.inkflow/lixeira/` do projeto no
gerenciador de arquivos (no Windows, ative "Itens ocultos" para ver `.inkflow`): os arquivos têm
a data e a hora no começo do nome, e os textos são `.md` que abrem em qualquer editor. Copie o
trecho que você quer de volta para o texto no InkFlow. Veja também
[Conflitos de sincronização](#a-sincronização-avisou-que-um-arquivo-foi-alterado-aqui-e-em-outro-computador).

> A Lixeira fica só neste computador: ela **não é sincronizada** com o Drive.

---

## 10. Configurações

Abra pelo rodapé da barra lateral (ou pela engrenagem da tela inicial). As abas **Diagramação** e
**Exportação** só aparecem com um projeto aberto. O app volta na última aba usada.

### 10.1 Geral

- **Tema:** Sistema (segue o modo claro/escuro do computador), Claro ou Escuro.
- **Minimapa:**
  - **Mostrar minimapa nos textos** — liga ou desliga;
  - **Posição** — clique num dos 8 quadradinhos em volta de "Página";
  - **Incluir menções automáticas** — se o minimapa também liga os textos em que o nome de uma
    nota aparece, mesmo sem `[[link]]`.

Essas preferências valem para todos os projetos e ficam guardadas neste computador.

### 10.2 Exportação

Gera o livro em outros formatos. À direita aparece uma **prévia** que muda conforme as opções.

**Formatos:**

| Formato      | Para quê                                                                                                              |
| ------------ | --------------------------------------------------------------------------------------------------------------------- |
| **Word**     | `.docx` para revisar, enviar a editoras, agentes literários e concursos                                               |
| **PDF**      | Abre a janela de impressão do sistema; escolha **Salvar como PDF** (no Windows também serve "Microsoft Print to PDF") |
| **E-book**   | `.epub` (EPUB 3) para Kindle (via "Enviar para Kindle"), Kobo, Apple Livros e celular                                 |
| **Markdown** | Um arquivo `.md` com o livro todo, formatação simples                                                                 |
| **Texto**    | Um arquivo `.txt`, só o texto                                                                                         |

**Livro:** título (vem do projeto, mas pode ser outro só na exportação) e **autor** (fica
guardado no projeto e também aparece na Diagramação).

**Aparência** (Word e PDF):

- **Livro** — fonte com serifa, recuo na primeira linha do parágrafo, texto justificado, cada
  capítulo numa página nova, número de página no rodapé. **Página:** 14 × 21 cm, A5 ou A4.
- **Manuscrito padrão** — o formato de originais para editoras: Times New Roman 12, espaço
  duplo, margens de 2,5 cm, página A4, alinhado à esquerda e cabeçalho
  "Sobrenome / TÍTULO / página" (o sobrenome é a última palavra do nome do autor).

No E-book, a página e a fonte são ajustadas pelo aparelho de leitura.

**Incluir:**

- **Folha de rosto** — página com título e autor;
- **Sumário** — no Word é um campo que o Word preenche (veja a
  [pergunta sobre o Word](#o-word-pergunta-se-quero-atualizar-os-campos)); no PDF e no EPUB é
  uma lista de capítulos com links;
- **"Capítulo 1" antes do título** — numeração dos capítulos;
- **Título de cada cena** — sem isso, as cenas de um capítulo são separadas por `* * *`;
- **Imagens** — as imagens anexadas no texto.

**Capítulos:** marque quais entram (**Todos** / **Nenhum**). Capítulos novos entram marcados.
Embaixo aparecem quantos capítulos e palavras vão sair. O botão **Exportar** pergunta onde salvar
o arquivo (exceto no PDF, que abre a janela de impressão).

O que muda na exportação: os `[[links]]` viram texto comum, o **destaque (marca-texto) sai**, e
anexos que não são imagem ficam de fora. As escolhas desta aba ficam guardadas por projeto.

**Com o projeto gráfico feito** (aba Diagramação): o **PDF** no estilo Livro usa a diagramação do
miolo (tamanho, fonte, margens, cabeçalhos, capitular, ornamento) em vez do tamanho escolhido
aqui, ganha a página de créditos depois da folha de rosto, e o **EPUB** ganha a capa. A prévia
desta aba não mostra a diagramação — para vê-la, use "Página do miolo" na Diagramação.

### 10.3 Sincronização (Google Drive)

A sincronização mantém o mesmo projeto em dois ou mais computadores, usando o **seu** Google
Drive. Ela só existe no app desktop.

**Como funciona, em resumo:**

- cada projeto sincronizado vira uma pasta `InkFlow/<nome do projeto>` no seu Drive;
- o InkFlow usa a permissão `drive.file`: **só enxerga as pastas e arquivos que ele mesmo
  criou** no seu Drive, nada mais;
- o app sincroniza **ao abrir** o projeto, **ao fechar** (ou trocar de projeto, ou fechar a
  janela), **de tempos em tempos** (a cada 5, 15 ou 30 minutos, ou "Só quando eu pedir") e quando
  você clica em **Sincronizar agora**;
- o ícone de nuvem no alto do texto mostra o estado (sincronizando, último horário ou erro);
  clique nele para abrir esta aba.

#### Passo 1 — Credenciais do Google (uma vez só)

O InkFlow ainda não vem com credenciais próprias, então você precisa criar um "ID do cliente
OAuth" grátis no Google Cloud. Faça isso uma vez; depois serve para todos os seus computadores.

1. Entre em <https://console.cloud.google.com> com sua conta Google e **crie um projeto** (por
   exemplo, "InkFlow").
2. Vá em **APIs e serviços → Biblioteca**, procure **Google Drive API** e clique em **Ativar**.
3. Vá em **APIs e serviços → Tela de consentimento OAuth** (em algumas contas aparece como
   **Google Auth Platform**):
   - tipo de usuário **Externo**;
   - preencha o nome do app (por exemplo, "InkFlow") e o seu e-mail;
   - em **Público-alvo** / **Usuários de teste**, adicione as contas Google que vão usar o app
     (a sua, pelo menos).
4. Vá em **Credenciais → Criar credenciais → ID do cliente OAuth**:
   - tipo de aplicativo: **App para computador** (em inglês, "Desktop app");
   - copie o **ID do cliente** (termina em `.apps.googleusercontent.com`) e a **Chave secreta do
     cliente**.
5. No InkFlow: **Configurações → Sincronização**, cole os dois campos e clique em **Salvar**.

> Enquanto o app estiver no modo "Teste" no Google Cloud, o Google pede para você entrar de novo
> **a cada 7 dias**. Isso é normal; basta conectar a conta outra vez. Para trocar as credenciais
> depois, use o link **Credenciais** nesta aba.

#### Passo 2 — Conectar a conta

Clique em **Conectar conta Google**. O navegador abre a página de login do Google; escolha a
conta, autorize e volte ao InkFlow quando a página disser "Pronto!". (Se o Google avisar que o
app não foi verificado, é porque as credenciais são suas e estão em modo de teste: clique em
"Continuar".) O login espera até 5 minutos.

A conta conectada vale para o app todo e fica guardada **só neste computador**. **Desconectar**
remove a conta daqui e cancela a autorização no Google.

#### Passo 3 — Ligar a sincronização do projeto

Com um projeto aberto, ligue **Sincronizar este projeto**. O app cria a pasta no Drive e faz a
primeira sincronização. A partir daí aparecem a frequência (5, 15, 30 minutos ou "Só quando eu
pedir"), o horário da última sincronização e o botão **Sincronizar agora**.

Desligar a chave para de sincronizar este projeto (nada é apagado nem aqui nem no Drive).

> Renomear o projeto **não renomeia** a pasta no Drive; o app continua usando a mesma pasta.

#### Baixar um projeto do Drive em outro computador

1. Instale o InkFlow no outro computador, faça o [Passo 1](#passo-1--credenciais-do-google-uma-vez-só)
   (cole as mesmas credenciais) e o [Passo 2](#passo-2--conectar-a-conta) com a mesma conta.
2. Na **tela inicial**, em **No Google Drive**, clique em **Ver projetos no Drive**.
3. Clique em **Baixar** ao lado do projeto e escolha onde criar a pasta. O projeto é baixado,
   aberto e já fica com a sincronização ligada.

#### O que acontece quando os dois computadores mudam a mesma coisa

- **O mesmo texto editado nos dois computadores:** as duas edições são **mescladas**, como num
  documento compartilhado. Se alguma palavra de um dos lados não aparecer no resultado (por
  exemplo, um lado dividiu o parágrafo que o outro editou), a versão inteira daquele lado vai para
  a [Lixeira](#cópias-de-segurança-na-lixeira) como cópia de segurança, e o app avisa.
- **Capítulos, cenas e notas criados, renomeados, movidos ou excluídos dos dois lados:** as
  mudanças são juntadas. Se os dois lados mudaram o nome ou a posição da mesma cena, vale o deste
  computador. Uma cena cujo capítulo foi excluído do outro lado vai para o primeiro capítulo (ou
  para um capítulo novo, "Recuperados"), para não sumir. Se os dois computadores criaram textos
  com o mesmo nome, um deles ganha um sufixo no nome do arquivo (`-2`).
- **Outros arquivos** (anexos, projeto gráfico) alterados dos dois lados: fica o deste
  computador, e o do Drive vai para a Lixeira.
- **Excluído num computador e alterado no outro:** fica o alterado — vale também para uma cena ou
  nota excluída de um lado e editada do outro.
- **Excluído no outro computador:** aqui ele vai para a Lixeira, em vez de sumir. No Drive, o que
  você exclui vai para a lixeira do Drive (recuperável por 30 dias).

O histórico de versões também é sincronizado. A Lixeira e o estado da sincronização
(`.inkflow/sync.json`) ficam só em cada computador.

### 10.4 Diagramação

A aba Diagramação faz o **projeto gráfico** do livro impresso: capa, quarta capa, lombada,
orelhas e miolo, com uma prévia ao vivo. Tudo é gravado sozinho em `.inkflow/livro.json`
(sincronizado com o Drive); as imagens ficam em `anexos/`. Se não entender algum termo, veja o
[glossário](#glossário-de-termos-editoriais) no fim desta seção.

#### Prévia

No alto da prévia:

- **Livro 3D** — o livro montado; **arraste para girar**. Os botões Capa, Lombada e Quarta capa
  viram o livro para aquele lado; **Girar** faz ele rodar sozinho;
- **Capa aberta** — a capa inteira como vai para a gráfica: (orelha), quarta capa, lombada,
  capa, (orelha), com a borda de sangria de 3 mm e marquinhas das dobras;
- **Página do miolo** — o primeiro capítulo com a diagramação escolhida (sem a paginação real).

#### Aba Capa

- **Título** — vem do nome do projeto (para mudar, renomeie o projeto);
- **Subtítulo** e **Autor** (o autor fica guardado no projeto);
- **Imagem da capa** — escolha uma imagem dos anexos ou use **Escolher imagem…** para escolher um
  arquivo do computador (ele é copiado para `anexos/`). Use uma imagem grande, de pelo menos
  1800 × 2700 pixels, para a impressão sair nítida;
- **Escurecer a imagem** (0 a 80%) — para o título aparecer sobre a foto;
- cores: **Fundo**, **Degradê** (segunda cor, de cima para baixo; "tirar" volta à cor única),
  **Texto** e **Destaque** (o fio entre título e subtítulo, a frase da quarta capa, o autor na
  lombada);
- **Fonte do título:** Garamond (clássica), Literata (leitura), Fraunces (marcante) ou Figtree
  (sem serifa);
- **Posição do título:** Em cima, No meio ou Embaixo.

#### Aba Quarta capa

- **Frase de destaque** — uma linha no alto, para chamar a atenção;
- **Sinopse** — o texto principal (entre 100 e 200 palavras costuma caber bem). Com orelhas, ela
  também vai na orelha da frente ("Sobre o livro");
- **Sobre o autor** — vai embaixo da sinopse, ou na orelha de trás quando há orelhas;
- **Imagem de fundo da quarta capa**;
- **Reservar espaço para o código de barras (ISBN)** — um retângulo branco no canto de baixo, onde
  a gráfica ou a editora aplica o código de barras.

> Enquanto a sinopse estiver vazia, a quarta capa mostra um texto de exemplo apagado
> ("Escreva a sinopse do livro…"). **Preencha a sinopse antes de gerar o PDF da capa**, porque
> esse texto também sai no arquivo.

#### Aba Lombada e orelhas

- **Papel do miolo** — Branco (offset 75–90 g) ou Creme (pólen 80 g). O papel muda a espessura;
- **Número de páginas** — em branco, o app estima pelo número de palavras, pela fonte e pelas
  margens. Depois de gerar o PDF do miolo, coloque aqui o número real de páginas;
- o app mostra a **largura da lombada** (páginas × espessura do papel + 1 mm da capa) e o tamanho
  da **capa aberta** com sangria. Lombadas com menos de 6 mm são finas demais para ter texto;
- **Orelhas** e a **largura de cada orelha** (40 a 120 mm; padrão 80 mm).

O texto da lombada é impresso de cima para baixo, com o nome do autor antes do título, como pede a norma ABNT NBR 12225. Textos longos diminuem até caber.

#### Aba Miolo

- **Tamanho do livro:** 14 × 21 cm (o mais comum), 16 × 23 cm, A5 (14,8 × 21 cm) ou A4;
- **Fonte do texto**, **Corpo** (tamanho da letra, em pontos) e **Entrelinha** (em múltiplos do
  corpo: 1,45 = 45% a mais que o tamanho da letra);
- margens, em milímetros: **de cima**, **de baixo**, **medianiz** (a margem do lado da costura)
  e **de fora**. As margens são espelhadas entre as páginas da esquerda e da direita;
- **Ornamento entre cenas** — ❦, ✦, ⁂, \* \* \*, ~ ou ◆ no lugar do separador de cena;
- **Capitular** — a primeira letra do capítulo grande, ocupando várias linhas (e a primeira linha
  em versalete);
- **Cabeçalho** — título do livro no alto das páginas pares (esquerda) e autor nas ímpares
  (direita), em itálico;
- **Capítulo sempre começa na página da direita**;
- **Voltar ao padrão** — restaura os valores do miolo.

Os números de página ficam no canto de fora, embaixo. Folha de rosto, créditos, sumário e páginas
de abertura de capítulo ficam sem cabeçalho.

#### Arquivos para a gráfica e as lojas

- **PDF do miolo** — abre a janela de impressão com o livro paginado (folha de rosto, página de
  créditos com "© ano autor — Todos os direitos reservados", sumário e capítulos). Escolha
  **Salvar como PDF** e, nas margens, **Nenhuma** ou **Padrão**;
- **PDF da capa aberta** — a capa inteira a 300 dpi, com 3 mm de sangria. Na impressão, escolha
  **Salvar como PDF** e margens **Nenhuma**;
- **Capa para e-book (PNG)** — só a capa da frente, com 1600 pixels de largura (o tamanho que as
  lojas de e-book pedem). Também entra sozinha no EPUB exportado.

**Limites conhecidos do PDF** (vêm do motor de impressão do navegador interno): só o primeiro
capítulo tem garantia de começar numa página da direita, e o cabeçalho pode aparecer também na
página de abertura de capítulo. Confira o PDF antes de mandar para a gráfica.

#### Glossário de termos editoriais

| Termo                                           | O que é                                                                                                                                              |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Capa** (1ª capa)                              | A frente do livro, com título, subtítulo e autor                                                                                                     |
| **Quarta capa**                                 | A parte de trás do livro, com sinopse, frase de destaque e código de barras. (A "2ª" e a "3ª capa" são o verso da capa e da quarta capa, por dentro) |
| **Lombada**                                     | A "costa" do livro, que aparece na estante. A largura depende do número de páginas e do papel. Pela ABNT NBR 12225, o texto corre de cima para baixo |
| **Orelhas**                                     | Abas da capa dobradas para dentro. A da frente costuma falar do livro; a de trás, do autor                                                           |
| **Capa aberta**                                 | A capa inteira "planificada": quarta capa + lombada + capa (+ orelhas), como a gráfica imprime                                                       |
| **Sangria**                                     | Uma faixa a mais (aqui, 3 mm) em volta da arte, que a gráfica corta. Serve para não sobrar filete branco na borda                                    |
| **Miolo**                                       | O conjunto das páginas internas do livro (todo o conteúdo, sem a capa)                                                                               |
| **Formato**                                     | O tamanho do livro fechado, por exemplo 14 × 21 cm                                                                                                   |
| **Mancha** (mancha gráfica)                     | A área da página ocupada pelo texto, dentro das margens                                                                                              |
| **Medianiz**                                    | A margem do lado da costura (margem interna). Costuma ser maior, porque parte dela some na encadernação                                              |
| **Margem externa** ("de fora")                  | A margem do lado oposto à costura                                                                                                                    |
| **Página ímpar / direita** e **par / esquerda** | No livro aberto, a página da direita é ímpar (1, 3, 5…) e a da esquerda é par. Capítulos costumam abrir na ímpar                                     |
| **Corpo**                                       | O tamanho da letra, em pontos (pt). Livros de ficção costumam usar entre 10,5 e 12 pt                                                                |
| **Entrelinha**                                  | O espaço entre as linhas. Aqui é um múltiplo do corpo                                                                                                |
| **Capitular**                                   | Letra inicial grande que ocupa duas ou mais linhas no começo do capítulo                                                                             |
| **Versalete**                                   | Letras com forma de maiúscula e altura de minúscula, usadas na primeira linha do capítulo                                                            |
| **Cabeço** (título corrente)                    | O texto pequeno no alto das páginas, com o título do livro ou o nome do autor                                                                        |
| **Fólio**                                       | O número da página                                                                                                                                   |
| **Ornamento** (vinheta)                         | Símbolo que separa duas partes de um capítulo (❦, ⁂, \* \* \*)                                                                                       |
| **Folha de rosto**                              | A página do começo com título e autor                                                                                                                |
| **Página de créditos**                          | O verso da folha de rosto, com o © e "Todos os direitos reservados" (e, num livro publicado, a ficha catalográfica e o ISBN)                         |
| **Sumário**                                     | A lista dos capítulos com as páginas, no começo do livro (não confundir com "índice", que é a lista de assuntos no fim)                              |
| **Offset** e **pólen**                          | Tipos de papel. Offset é branco; pólen é creme, mais confortável para leitura longa e um pouco mais grosso                                           |
| **Gramatura** (g)                               | O "peso" do papel, em gramas por metro quadrado. Quanto maior, mais grosso                                                                           |
| **ISBN**                                        | O número que identifica o livro no mundo. O código de barras da quarta capa é feito a partir dele                                                    |
| **dpi**                                         | Pontos por polegada: a resolução da imagem. Para impressão, use 300 dpi                                                                              |
| **Manuscrito padrão**                           | Formato de original para enviar a editoras e concursos: Times New Roman 12, espaço duplo, margens largas                                             |
| **E-book / EPUB**                               | Livro digital. O EPUB é o formato aberto aceito por Kobo, Apple Livros e pelo "Enviar para Kindle"                                                   |

---

## 11. Atalhos de teclado

| Atalho                               | O que faz                                                  |
| ------------------------------------ | ---------------------------------------------------------- |
| **Ctrl + \\**                        | Esconde ou mostra a barra lateral                          |
| **Ctrl + Shift + F**                 | Abre a busca no projeto                                    |
| **Esc** (na busca)                   | Fecha a busca                                              |
| **Enter** (na busca)                 | Abre o primeiro resultado                                  |
| **Ctrl + B**                         | Negrito                                                    |
| **Ctrl + I**                         | Itálico                                                    |
| **Ctrl + Shift + S**                 | Tachado                                                    |
| **Ctrl + Shift + H**                 | Marca-texto                                                |
| **Ctrl + Alt + 1 / 2 / 3**           | Título 1 / 2 / 3                                           |
| **Ctrl + Alt + 0**                   | Parágrafo comum (Texto)                                    |
| **Ctrl + Shift + 8**                 | Lista                                                      |
| **Ctrl + Shift + 7**                 | Lista numerada                                             |
| **Ctrl + Shift + B**                 | Citação                                                    |
| **Shift + Enter**                    | Quebra de linha dentro do mesmo parágrafo                  |
| **Ctrl + Z**                         | Desfazer                                                   |
| **Ctrl + Shift + Z** ou **Ctrl + Y** | Refazer                                                    |
| **Ctrl + X / C / V**                 | Recortar / copiar / colar (colar uma imagem cria um anexo) |
| **`[[`**                             | Começa um link e mostra as sugestões (↑ ↓, Enter ou Tab)   |
| **Ctrl + clique** num link ou menção | Abre o texto ligado (ou cria a nota, se não existe)        |
| **Botão direito** num trecho         | Menu de ações rápidas                                      |
| **Shift + botão direito**            | Menu do sistema (corretor ortográfico)                     |
| **Enter** / **Esc** ao renomear      | Confirma / cancela                                         |
| **Setas** na barra do minimapa       | Mudam o minimapa de posição                                |

No Mac, troque **Ctrl** por **⌘** e **Alt** por **⌥ (Option)**.

---

## 12. Perguntas frequentes e solução de problemas

### Onde meus textos ficam guardados?

Na pasta do projeto que você escolheu ao criar. Cada cena é um arquivo `.md` em
`manuscrito/<capítulo>/`, e cada nota em `notas/<tipo>/`. Você pode abrir esses arquivos em
qualquer editor de texto (e até no Obsidian). Para fazer um backup, basta copiar a pasta inteira
— **inclusive a pasta escondida `.inkflow`**, que guarda a ordem dos capítulos, o histórico e a
lixeira. As preferências do app (tema, minimapa, projetos recentes, a conta Google) ficam no
computador, fora da pasta do projeto.

### O PowerShell diz que "a execução de scripts foi desabilitada"

O Windows vem bloqueando scripts do PowerShell, e o comando `pnpm` é um script (`pnpm.ps1`).
Escolha uma das saídas:

- liberar só para o seu usuário (recomendado para quem programa), uma vez:
  `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`;
- ou usar `pnpm.cmd` no lugar de `pnpm` (`pnpm.cmd install`, `pnpm.cmd tauri dev`);
- para rodar o script de instalação sem mudar nada:
  `powershell -ExecutionPolicy Bypass -File .\setup-windows.ps1`.

### O que é o "modo de desenvolvimento"?

`pnpm tauri dev` abre o app compilado na hora, a partir do código, e recarrega a interface a cada
mudança. É o modo para testar. A primeira vez demora porque compila a parte em Rust. Ele usa os
mesmos projetos (pastas) que o app instalado, então cuidado ao testar com o seu livro de verdade:
faça uma cópia da pasta antes. `pnpm dev` (sem `tauri`) abre só a
[prévia no navegador](#14-prévia-no-navegador), que guarda projetos à parte.

### O Word pergunta se quero "atualizar os campos"

Responda **Sim**. O sumário do arquivo Word é um campo que o próprio Word monta com os números de
página. Se você disser "Não", o sumário fica vazio; para preencher depois, clique com o botão
direito sobre ele e escolha **Atualizar campo**.

### Como gero o PDF?

Em **Configurações → Exportação**, escolha **PDF** e clique em **Exportar PDF**. Abre a janela de
impressão do sistema: em "Destino" (ou "Impressora"), escolha **Salvar como PDF** (no Windows
também serve **Microsoft Print to PDF**) e salve. Para o PDF da gráfica, use a aba
**Diagramação → PDF do miolo** e **PDF da capa aberta**, com margens **Nenhuma**.

### A sincronização avisou que um arquivo foi alterado "aqui e em outro computador"

Isso acontece quando o mesmo arquivo mudou nos dois computadores entre uma sincronização e outra.
Nada foi perdido: o InkFlow manteve (ou mesclou) a versão deste computador e guardou a outra na
**Lixeira**, como [cópia de segurança](#cópias-de-segurança-na-lixeira). Compare as duas e, se
precisar, copie o trecho que faltou. Para evitar conflitos, deixe o app sincronizar antes de
trocar de computador (fechar o projeto ou a janela já sincroniza).

### O Google pede para entrar de novo / "A autorização do Google expirou"

Com credenciais em modo "Teste" no Google Cloud, a autorização vale 7 dias. Vá em
**Configurações → Sincronização** e clique em **Conectar conta Google** de novo.

### "O Google recusou (invalid_client)" ou "O Google recusou o login"

O ID do cliente ou a chave secreta estão errados, ou a sua conta não está na lista de
**Usuários de teste** da tela de consentimento. Confira o
[Passo 1](#passo-1--credenciais-do-google-uma-vez-só) e use o link **Credenciais** para corrigir.

### Apareceu uma cena "(versão externa)"

O arquivo daquele texto foi alterado por outro programa enquanto ele estava aberto e com edições
no InkFlow. Para não perder nada, o app guardou a versão de fora como um texto novo, logo abaixo.
Compare, junte o que quiser e exclua a cópia.

### Excluí um capítulo sem querer

Abra a **Lixeira** e clique em **Restaurar**. Se você já esvaziou a lixeira, tente o
**Histórico de versões**: escolha uma versão anterior e use **Recriar este texto** em cada cena,
ou **Restaurar projeto inteiro**.

### O app não fecha e diz "Não foi possível salvar as últimas alterações"

A pasta do projeto ficou inacessível (pen drive removido, pasta de rede desconectada, falta de
permissão). Resolva o acesso e tente fechar de novo. O app não fecha enquanto não conseguir
gravar, para você não perder texto.

### Movi a pasta do projeto e ela sumiu da lista

A lista de recentes guarda o caminho antigo. Use **Abrir projeto existente** e escolha a pasta no
lugar novo; se quiser, tire a entrada antiga da lista com o **×**.
