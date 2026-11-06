# Biblioteca de música do InkFlow

Todos os arquivos desta pasta foram **gerados por síntese** pelo script
`scripts/music/render.py`, sem amostras, gravações ou trechos de terceiros.

- **Barroco**: as composições são de domínio público (J. S. Bach, 1685–1750;
  Christian Petzold, 1677–1733; Johann Pachelbel, 1653–1706). As notas foram
  transcritas para este projeto e tocadas por instrumentos sintetizados (cravo,
  cordas). No Cânone, o baixo e as duas primeiras variações são de Pachelbel;
  as demais variações são do InkFlow, sobre o mesmo baixo.
- **Piano**: _Für Elise_ e o tema da _Ode à Alegria_ (Ludwig van Beethoven,
  1770–1827) e a _Canção de ninar_ op. 49 nº 4 (Johannes Brahms, 1833–1897)
  são composições em domínio público, transcritas e arranjadas para este
  projeto (a _Für Elise_ traz só a seção A e o primeiro episódio; o
  acompanhamento da _Ode_ e da _Canção de ninar_ é do InkFlow). _Folhas de
  outono_, _Carta_ e _Valsa lenta_ são originais do InkFlow.
- **Greensleeves** (em Chill & Relax): melodia tradicional inglesa do século
  XVI, em domínio público; arranjo do InkFlow.
- **Chill & Relax**, **Foco**, **Lo-fi**, **Cinematográfica** e **Ambiente**:
  composições originais do InkFlow (as melodias e progressões são geradas pelo
  script com sementes fixas).
- **Ruído marrom, Chuva, Natureza**: sons sintetizados (ruído filtrado,
  gotas, trovões, ondas, vento, pássaros e riacho).

Os arquivos e o script são dedicados ao domínio público pela
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/deed.pt_BR):
podem ser usados, copiados e distribuídos para qualquer fim, sem atribuição.

Para gerar de novo (resultado idêntico, sementes fixas):

    python3 scripts/music/render.py          # todas
    python3 scripts/music/render.py chuva-leve floresta

Requer Python 3 com numpy e scipy, e ffmpeg com libmp3lame.

## Como adicionar faixas

1. Coloque o arquivo (MP3, 128 kbps) nesta pasta, com licença que permita
   redistribuir (domínio público, CC0 ou CC BY — neste caso, registre o crédito
   abaixo).
2. Cadastre a faixa em `src/music/library.ts` (título, autor, licença e, se for
   um som contínuo, `loop: true`).

### Créditos de faixas de terceiros

Nenhuma até agora.
