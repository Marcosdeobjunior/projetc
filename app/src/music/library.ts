/*
 * Biblioteca de música embutida: arquivos em public/music, gerados por
 * scripts/music/render.py (veja public/music/LICENSE.md). Funciona sem
 * internet e sem conta em serviço nenhum.
 */

export interface Track {
  id: string;
  title: string;
  /** Compositor ou origem. */
  by: string;
  /** Endereço do arquivo, relativo à raiz do app. */
  src: string;
  /** Som contínuo (chuva, ruído…): repete sem emenda enquanto tocar. */
  loop?: boolean;
  license: string;
}

export interface Playlist {
  id: string;
  name: string;
  description: string;
  /** Nome do ícone (veja Icon.tsx). */
  icon: string;
  /** Matiz da capa. */
  hue: number;
  tracks: Track[];
}

const PD = "Composição em domínio público · gravação sintetizada CC0";
const TRAD = "Melodia tradicional (domínio público) · arranjo e gravação CC0";
const CC0 = "Original da Tália · CC0";

const file = (id: string) => `${import.meta.env.BASE_URL}music/${id}.mp3`;

const track = (id: string, title: string, by: string, license: string, loop = false): Track => ({
  id,
  title,
  by,
  src: file(id),
  license,
  ...(loop ? { loop } : {}),
});

export const PLAYLISTS: Playlist[] = [
  {
    id: "barroco",
    name: "Barroco",
    description: "Cravo e cordas: música elegante para concentrar.",
    icon: "lyre",
    hue: 32,
    tracks: [
      track("bach-preludio-bwv846", "Prelúdio em Dó maior, BWV 846", "J. S. Bach · cravo", PD),
      track("minueto-em-sol", "Minueto em Sol maior", "Christian Petzold · cravo", PD),
      track("canone-pachelbel", "Cânone em Ré", "Johann Pachelbel · cordas e cravo", PD),
    ],
  },
  {
    id: "piano",
    name: "Piano",
    description: "Piano solo: clássicos em domínio público e peças calmas para escrever.",
    icon: "piano",
    hue: 40,
    tracks: [
      track("fur-elise", "Für Elise", "Ludwig van Beethoven · piano", PD),
      track(
        "cancao-de-ninar-brahms",
        "Canção de ninar (Wiegenlied)",
        "Johannes Brahms · piano e celesta",
        PD,
      ),
      track("ode-a-alegria", "Ode à Alegria", "Ludwig van Beethoven · piano", PD),
      track("folhas-de-outono", "Folhas de outono", "Tália · piano", CC0),
      track("carta", "Carta", "Tália · piano", CC0),
      track("valsa-lenta", "Valsa lenta", "Tália · piano", CC0),
    ],
  },
  {
    id: "lofi",
    name: "Lo-fi",
    description: "Batidas suaves, teclados com swing e chiado de vinil.",
    icon: "headphones",
    hue: 330,
    tracks: [
      track("cafe-da-tarde", "Café da tarde", "Tália · lo-fi", CC0),
      track("caderno-aberto", "Caderno aberto", "Tália · lo-fi com piano", CC0),
      track("madrugada", "Madrugada", "Tália · lo-fi", CC0),
    ],
  },
  {
    id: "cinematica",
    name: "Cinematográfica",
    description: "Cordas, metais e tímpanos: trilha para cenas grandes.",
    icon: "film",
    hue: 12,
    tracks: [
      track("horizonte", "Horizonte", "Tália · orquestra e piano", CC0),
      track("reinos-distantes", "Reinos distantes", "Tália · orquestra épica", CC0),
      track("primeira-luz", "Primeira luz", "Tália · cordas, harpa e celesta", CC0),
    ],
  },
  {
    id: "ambiente",
    name: "Ambiente",
    description: "Texturas atmosféricas que se movem devagar.",
    icon: "sparkle",
    hue: 250,
    tracks: [
      track("aurora", "Aurora", "Tália · pads e celesta", CC0),
      track("constelacoes", "Constelações", "Tália · celesta e pads", CC0),
      track("mare-lenta", "Maré lenta", "Tália · pads e mar distante", CC0),
      track("profundezas", "Profundezas", "Tália · drone grave", CC0),
    ],
  },
  {
    id: "chill",
    name: "Chill & Relax",
    description: "Piano elétrico, pads e melodias calmas.",
    icon: "moon",
    hue: 280,
    tracks: [
      track("entardecer", "Entardecer", "Tália · piano elétrico", CC0),
      track("brisa", "Brisa", "Tália · harpa e pads", CC0),
      track("greensleeves", "Greensleeves", "Tradicional inglesa · harpa e cordas", TRAD),
    ],
  },
  {
    id: "foco",
    name: "Foco",
    description: "Minimalismo instrumental, sem distrações.",
    icon: "target",
    hue: 190,
    tracks: [
      track("pulso", "Pulso", "Tália · marimba minimalista", CC0),
      track("nevoa", "Névoa", "Tália · drone ambiente", CC0),
      track("fluxo", "Fluxo", "Tália · piano minimalista", CC0),
      track("engrenagens", "Engrenagens", "Tália · marimba e harpa", CC0),
    ],
  },
  {
    id: "ruido-marrom",
    name: "Ruído marrom",
    description: "Ruído grave e contínuo, para isolar o mundo.",
    icon: "wave",
    hue: 22,
    tracks: [
      track("ruido-marrom", "Ruído marrom", "Tália · ruído", CC0, true),
      track("ruido-marrom-suave", "Ruído marrom suave", "Tália · ruído", CC0, true),
    ],
  },
  {
    id: "chuva",
    name: "Chuva",
    description: "Da garoa à tempestade.",
    icon: "rain",
    hue: 215,
    tracks: [
      track("chuva-leve", "Chuva leve", "Tália · ambiente", CC0, true),
      track("chuva-forte", "Chuva forte", "Tália · ambiente", CC0, true),
      track("chuva-na-janela", "Chuva na janela", "Tália · ambiente", CC0, true),
      track("tempestade", "Tempestade", "Tália · ambiente", CC0, true),
    ],
  },
  {
    id: "natureza",
    name: "Natureza",
    description: "Floresta, mar, vento e água corrente.",
    icon: "leaf",
    hue: 120,
    tracks: [
      track("floresta", "Floresta", "Tália · ambiente", CC0, true),
      track("ondas-do-mar", "Ondas do mar", "Tália · ambiente", CC0, true),
      track("vento", "Vento", "Tália · ambiente", CC0, true),
      track("riacho", "Riacho", "Tália · ambiente", CC0, true),
    ],
  },
];

export function findPlaylist(id: string | null | undefined): Playlist | undefined {
  return PLAYLISTS.find((p) => p.id === id);
}
