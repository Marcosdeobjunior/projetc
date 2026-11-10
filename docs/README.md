# Documentação da Tália

A Tália é um app de escrita para quem escreve livros: cada projeto é uma pasta no seu
computador, com os textos guardados em arquivos legíveis (Markdown), e a sincronização com o
Google Drive é opcional, feita na sua própria conta.

Esta pasta reúne a documentação do app. Escolha pelo que você precisa:

| Documento                                   | Para quem                     | O que tem                                                                                                                                                   |
| ------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Guia do usuário](guia-do-usuario.md)       | Quem escreve                  | Todas as funções, na ordem em que você as encontra: projetos, editor, notas, anexos, busca, grafo, histórico, lixeira, sincronização, diagramação, exportar |
| [Arquitetura](arquitetura.md)               | Quem programa                 | Mapa do código, modelo de dados, fila de gravação, sincronização, exportação, comandos Rust, segurança, testes e como gerar o instalador                    |
| [Formato do projeto](formato-do-projeto.md) | Quem programa ou é curioso(a) | Referência exata de cada arquivo da pasta do projeto, com os campos dos JSON e exemplos                                                                     |
| [`app/README.md`](../app/README.md)         | Quem programa                 | Resumo rápido: como rodar, comandos e formato                                                                                                               |
| [`README.md` da raiz](../README.md)         | Todos                         | Visão geral do repositório (`app/` e `site/`)                                                                                                               |

## Por onde começar

- **Vou escrever um livro:** comece pelo [Guia do usuário](guia-do-usuario.md), seção
  [Primeiros passos](guia-do-usuario.md#1-instalar-e-abrir-o-app).
- **Quero sincronizar entre dois computadores:** veja
  [Sincronização com o Google Drive](guia-do-usuario.md#103-sincronização-google-drive).
- **Quero gerar o PDF para a gráfica:** veja [Diagramação](guia-do-usuario.md#104-diagramação)
  e o [glossário de termos editoriais](guia-do-usuario.md#glossário-de-termos-editoriais).
- **Vou mexer no código:** leia [Arquitetura](arquitetura.md) e depois
  [Formato do projeto](formato-do-projeto.md).

## Convenções desta documentação

- Atalhos aparecem como no Windows e no Linux (**Ctrl**). No Mac, use **⌘** no lugar de Ctrl.
- "Texto" é qualquer coisa que abre no editor: uma **cena** do manuscrito ou uma **nota**
  (personagem, lugar ou ideia).
- "Pasta do projeto" (no código, _vault_) é a pasta do computador onde o projeto fica guardado.
- Caminhos como `.talia/lixeira/` são relativos à pasta do projeto.
