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
const CC0 = "Original do InkFlow · CC0";

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
    id: "chill",
    name: "Chill & Relax",
    description: "Piano elétrico, pads e melodias calmas.",
    icon: "moon",
    hue: 280,
    tracks: [
      track("entardecer", "Entardecer", "InkFlow · piano elétrico", CC0),
      track("brisa", "Brisa", "InkFlow · harpa e pads", CC0),
    ],
  },
  {
    id: "foco",
    name: "Foco",
    description: "Minimalismo instrumental, sem distrações.",
    icon: "target",
    hue: 190,
    tracks: [
      track("pulso", "Pulso", "InkFlow · marimba minimalista", CC0),
      track("nevoa", "Névoa", "InkFlow · drone ambiente", CC0),
    ],
  },
  {
    id: "ruido-marrom",
    name: "Ruído marrom",
    description: "Ruído grave e contínuo, para isolar o mundo.",
    icon: "wave",
    hue: 22,
    tracks: [
      track("ruido-marrom", "Ruído marrom", "InkFlow · ruído", CC0, true),
      track("ruido-marrom-suave", "Ruído marrom suave", "InkFlow · ruído", CC0, true),
    ],
  },
  {
    id: "chuva",
    name: "Chuva",
    description: "Da garoa à tempestade.",
    icon: "rain",
    hue: 215,
    tracks: [
      track("chuva-leve", "Chuva leve", "InkFlow · ambiente", CC0, true),
      track("chuva-forte", "Chuva forte", "InkFlow · ambiente", CC0, true),
      track("chuva-na-janela", "Chuva na janela", "InkFlow · ambiente", CC0, true),
      track("tempestade", "Tempestade", "InkFlow · ambiente", CC0, true),
    ],
  },
  {
    id: "natureza",
    name: "Natureza",
    description: "Floresta, mar, vento e água corrente.",
    icon: "leaf",
    hue: 120,
    tracks: [
      track("floresta", "Floresta", "InkFlow · ambiente", CC0, true),
      track("ondas-do-mar", "Ondas do mar", "InkFlow · ambiente", CC0, true),
      track("vento", "Vento", "InkFlow · ambiente", CC0, true),
      track("riacho", "Riacho", "InkFlow · ambiente", CC0, true),
    ],
  },
];

export function findPlaylist(id: string | null | undefined): Playlist | undefined {
  return PLAYLISTS.find((p) => p.id === id);
}
