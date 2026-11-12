import { hashSeed, rng } from "./geom";
import { makeMarkovNamer, NAME_BASES } from "./names";
import {
  cellOf,
  COLS,
  dCol,
  Heap,
  N8,
  ROWS,
  SEA,
  stepLen,
  wrapCol,
  type Derived,
  type StateForm,
  type WorldMap,
  eraOf,
} from "./worldgen";

/*
 * Províncias, religiões e marcadores do mapa-múndi. Tudo é derivado do mapa
 * (relevo, cidades, estados, culturas e a semente), como rios e estradas: não
 * vai para o arquivo e se refaz sozinho quando o mapa muda.
 */

export interface Province {
  name: string;
  state: number;
  /** Cidade que é a sede da província. */
  seat: string;
  cells: number;
}

export type ReligionType = "Folclórica" | "Organizada" | "Culto";
export interface Religion {
  name: string;
  type: ReligionType;
  form: string;
  deity: string;
  color: string;
  /** Onde nasceu (célula). */
  origin: number;
}

export const MARKER_TYPES = {
  vulcao: { icon: "🌋", label: "Vulcão" },
  termas: { icon: "♨️", label: "Fontes termais" },
  cachoeira: { icon: "💧", label: "Cachoeira" },
  mina: { icon: "⛏️", label: "Mina" },
  ruinas: { icon: "🏛️", label: "Ruínas" },
  farol: { icon: "🗼", label: "Farol" },
  estalagem: { icon: "🍺", label: "Estalagem" },
  caverna: { icon: "🕳️", label: "Caverna" },
  bosque: { icon: "🌳", label: "Bosque sagrado" },
  batalha: { icon: "⚔️", label: "Campo de batalha" },
  // Época atual
  parque: { icon: "🏞️", label: "Parque nacional" },
  estancia: { icon: "♨️", label: "Estância termal" },
  hidreletrica: { icon: "⚡", label: "Usina hidrelétrica" },
  mineradora: { icon: "⛏️", label: "Mineradora" },
  arqueologico: { icon: "🏛️", label: "Sítio arqueológico" },
  porto: { icon: "🚢", label: "Porto de contêineres" },
  posto: { icon: "⛽", label: "Posto de serviços" },
  gruta: { icon: "🕳️", label: "Gruta turística" },
  reserva: { icon: "🌲", label: "Reserva florestal" },
  memorial: { icon: "🎖️", label: "Memorial de guerra" },
  aeroporto: { icon: "✈️", label: "Aeroporto internacional" },
  universidade: { icon: "🎓", label: "Universidade" },
  // Época futurista
  geotermica: { icon: "🌋", label: "Usina geotérmica" },
  spa: { icon: "♨️", label: "Spa geotermal" },
  barragem: { icon: "⚡", label: "Barragem automatizada" },
  extracao: { icon: "🤖", label: "Extração robótica" },
  antigas: { icon: "🏚️", label: "Ruínas da Era Antiga" },
  hiperporto: { icon: "🚢", label: "Hiperporto" },
  estacao: { icon: "🚄", label: "Estação maglev" },
  bunker: { icon: "🛡️", label: "Bunker" },
  domo: { icon: "🧬", label: "Domo biológico" },
  exclusao: { icon: "☢️", label: "Zona de exclusão" },
  espacoporto: { icon: "🚀", label: "Espaçoporto" },
  arcologia: { icon: "🏙️", label: "Arcologia" },
  elevador: { icon: "🛰️", label: "Elevador orbital" },
} as const;
export type MarkerType = keyof typeof MARKER_TYPES;

export interface Marker {
  type: MarkerType;
  x: number;
  y: number;
  name: string;
  legend: string;
}

export interface Society {
  province: Int16Array;
  provinces: Province[];
  religion: Int16Array;
  religions: Religion[];
  markers: Marker[];
}

/** Como se chama a subdivisão em cada forma de governo. */
const PROVINCE_FORM: Record<StateForm, string> = {
  Federação: "Estado",
  União: "Região",
  Estado: "Departamento",
  Corporação: "Setor",
  Consórcio: "Distrito",
  Diretório: "Zona",
  Colônia: "Assentamento",
  Hegemonia: "Domínio",
  Reino: "Condado",
  Império: "Província",
  Principado: "Marca",
  Ducado: "Baronato",
  República: "Distrito",
  Teocracia: "Diocese",
  Canato: "Ulus",
  Liga: "Cantão",
};

const RELIGION_COLORS = [
  "#c9a227",
  "#8e5ea2",
  "#3c8dbc",
  "#d2694a",
  "#5aa469",
  "#b84a6e",
  "#4a7fb8",
  "#a0784a",
  "#6a8f3a",
  "#c47fb0",
  "#3aa0a0",
  "#9a6a3a",
];

const neighbours = (i: number) => {
  const x = i % COLS;
  const y = (i / COLS) | 0;
  const out: [number, number, number][] = [];
  for (const [dx, dy] of N8) {
    const ny = y + dy;
    if (ny < 0 || ny >= ROWS) continue;
    out.push([ny * COLS + wrapCol(x + dx), stepLen(dx, dy, y), y]);
  }
  return out;
};

type EraMarker = {
  type: MarkerType;
  name: (place: string) => string;
  legend: (place: string) => string;
};
const ERA_MARKERS: Record<"atual" | "futurista", Partial<Record<MarkerType, EraMarker>>> = {
  atual: {
    vulcao: {
      type: "parque",
      name: (p) => `Parque Nacional do Vulcão ${p}`,
      legend: () =>
        "Trilhas até a cratera, monitorada por sismógrafos; erupção mais recente há 80 anos.",
    },
    termas: {
      type: "estancia",
      name: (p) => `Estância de ${p}`,
      legend: () => "Hotéis e piscinas de água quente; lotada nos feriados.",
    },
    cachoeira: {
      type: "hidreletrica",
      name: (p) => `Usina Hidrelétrica ${p}`,
      legend: () => "A barragem abastece de energia meia dúzia de cidades da região.",
    },
    mina: {
      type: "mineradora",
      name: (p) => `Mineradora ${p}`,
      legend: () => "Mina a céu aberto; a ferrovia leva o minério até o porto.",
    },
    ruinas: {
      type: "arqueologico",
      name: (p) => `Sítio Arqueológico de ${p}`,
      legend: () => "Escavações revelaram uma cidade de dois mil anos; há museu no local.",
    },
    farol: {
      type: "porto",
      name: (p) => `Porto de ${p}`,
      legend: () => "Terminal de contêineres e guindastes que não param, dia e noite.",
    },
    estalagem: {
      type: "posto",
      name: (p) => `Posto ${p}`,
      legend: () => "Combustível, restaurante 24 horas e descanso para caminhoneiros.",
    },
    caverna: {
      type: "gruta",
      name: (p) => `Gruta de ${p}`,
      legend: () => "Visitas guiadas por galerias iluminadas e um lago subterrâneo.",
    },
    bosque: {
      type: "reserva",
      name: (p) => `Reserva Florestal ${p}`,
      legend: () => "Área protegida com espécies que só existem aqui.",
    },
    batalha: {
      type: "memorial",
      name: (p) => `Memorial de ${p}`,
      legend: () => "Monumento aos mortos da última guerra de fronteira.",
    },
  },
  futurista: {
    vulcao: {
      type: "geotermica",
      name: (p) => `Usina Geotérmica ${p}`,
      legend: () => "Sondas no magma do vulcão alimentam a rede elétrica do continente.",
    },
    termas: {
      type: "spa",
      name: (p) => `Spa ${p}`,
      legend: () => "Piscinas termais com regeneração celular; reservas com um ano de espera.",
    },
    cachoeira: {
      type: "barragem",
      name: (p) => `Barragem ${p}`,
      legend: () => "Operada só por máquinas; ninguém entra lá há décadas.",
    },
    mina: {
      type: "extracao",
      name: (p) => `Extração ${p}`,
      legend: () => "Enxames de robôs mineram terras raras sem parar.",
    },
    ruinas: {
      type: "antigas",
      name: (p) => `Ruínas de ${p}`,
      legend: () => "Uma cidade do século XXI, abandonada e tomada pela vegetação.",
    },
    farol: {
      type: "hiperporto",
      name: (p) => `Hiperporto ${p}`,
      legend: () => "Cargueiros autônomos e hidroaviões atracam a cada minuto.",
    },
    estalagem: {
      type: "estacao",
      name: (p) => `Estação ${p}`,
      legend: () => "Parada da linha maglev, a 900 km/h entre as megacidades.",
    },
    caverna: {
      type: "bunker",
      name: (p) => `Bunker ${p}`,
      legend: () => "Abrigo das guerras antigas, hoje um arquivo de sementes e dados.",
    },
    bosque: {
      type: "domo",
      name: (p) => `Domo ${p}`,
      legend: () =>
        "Floresta restaurada sob uma cúpula, com espécies trazidas de volta da extinção.",
    },
    batalha: {
      type: "exclusao",
      name: (p) => `Zona de Exclusão ${p}`,
      legend: () => "Contaminada desde a última guerra; drones patrulham o perímetro.",
    },
  },
};

export function deriveSociety(map: WorldMap, d: Derived): Society {
  const era = eraOf(map);
  const n = COLS * ROWS;
  const h = map.heights;
  const seed = map.options.seed;
  const cults = map.cultures ?? [];
  const used = new Set<string>();
  const namers = new Map<string, () => string>();
  /** Nome no idioma do povo da célula (ou de uma base qualquer). */
  const nameAt = (cell: number, salt: number) => {
    const base = cults[d.culture[cell]!]?.base ?? NAME_BASES[(cell + salt) % NAME_BASES.length]!.id;
    let f = namers.get(base);
    if (!f) {
      f = makeMarkovNamer(base, seed + hashSeed(base) + 0x51, used);
      namers.set(base, f);
    }
    return f();
  };
  const terrain = (j: number) => {
    const e = Math.max(0, (h[j]! - SEA) / 127);
    return 1 + (e > 0.45 ? 3 : e > 0.25 ? 1 : 0) + (d.flux[j]! >= d.riverMin ? 1.5 : 0);
  };

  /* ---------- Províncias ---------- */
  // Em cada estado, as sedes são a capital e as cidades mais afastadas umas das
  // outras; cada célula do estado fica com a sede mais perto (pelo terreno).
  const province = new Int16Array(n).fill(-1);
  const provinces: Province[] = [];
  {
    const area = new Array<number>(map.states.length).fill(0);
    for (let i = 0; i < n; i++) if (d.owner[i]! >= 0) area[d.owner[i]!]!++;
    const pq = new Heap();
    const cost = new Float64Array(n).fill(Infinity);
    map.states.forEach((s, k) => {
      const own = map.burgs.filter((b) => d.owner[cellOf(b.x, b.y)] === k);
      const cap = own.find((b) => b.id === s.capital);
      if (!cap) return;
      const want = Math.max(1, Math.min(own.length, Math.round(area[k]! / 260)));
      const seats = [cap];
      while (seats.length < want) {
        let best = null;
        let bestD = -1;
        for (const b of own) {
          if (seats.includes(b)) continue;
          const dist = Math.min(...seats.map((o) => Math.hypot(dCol(b.x, o.x) * 0.8, b.y - o.y)));
          if (dist > bestD) {
            bestD = dist;
            best = b;
          }
        }
        if (!best || bestD < 3) break;
        seats.push(best);
      }
      const form = PROVINCE_FORM[s.form ?? "Reino"] ?? "Condado";
      for (const b of seats) {
        const c = cellOf(b.x, b.y);
        const id = provinces.length;
        provinces.push({
          name:
            b === cap
              ? `${form} ${era === "fantasia" ? "Real" : "Capital"} de ${b.name}`
              : `${form} de ${b.name}`,
          state: k,
          seat: b.id,
          cells: 0,
        });
        province[c] = id;
        cost[c] = 0;
        pq.push(c, 0);
      }
    });
    while (pq.size) {
      const i = pq.pop();
      const ci = pq.lastKey;
      if (ci > cost[i]!) continue;
      for (const [j, len] of neighbours(i)) {
        if (d.owner[j] !== d.owner[i] || !d.land[j]) continue;
        const nc = ci + len * terrain(j);
        if (nc < cost[j]!) {
          cost[j] = nc;
          province[j] = province[i]!;
          pq.push(j, nc);
        }
      }
    }
    for (let i = 0; i < n; i++) if (province[i]! >= 0) provinces[province[i]!]!.cells++;
  }

  /* ---------- Religiões ---------- */
  // Cada povo tem a sua crença (folclórica); algumas religiões organizadas nascem
  // em capitais e se espalham pelos caminhos (mais depressa dentro do próprio
  // estado); e há cultos pequenos em volta de uma cidade.
  const religion = new Int16Array(n).fill(-1);
  const religions: Religion[] = [];
  {
    const rr = rng(seed ^ 0x7e11);
    const pick = <T>(a: readonly T[]) => a[Math.floor(rr() * a.length)]!;
    const FOLK = ["Xamanismo", "Animismo", "Culto aos ancestrais", "Politeísmo"];
    const ORG = ["Monoteísmo", "Politeísmo", "Dualismo", "Panteísmo"];
    cults.forEach((c, k) => {
      const deity = nameAt(cellOf(c.x, c.y), k);
      religions.push({
        name: `Fé dos ${c.name}`,
        type: "Folclórica",
        form: pick(FOLK),
        deity,
        color: RELIGION_COLORS[k % RELIGION_COLORS.length]!,
        origin: cellOf(c.x, c.y),
      });
    });
    for (let i = 0; i < n; i++) if (d.culture[i]! >= 0) religion[i] = d.culture[i]!;

    const spread = (id: number, from: number, limit: number, state: number) => {
      const cost = new Map<number, number>([[from, 0]]);
      const q = new Heap();
      q.push(from, 0);
      religion[from] = id;
      while (q.size) {
        const i = q.pop();
        const ci = q.lastKey;
        if (ci > (cost.get(i) ?? Infinity)) continue;
        for (const [j, len] of neighbours(i)) {
          if (!d.land[j]) continue;
          const nc = ci + len * terrain(j) * (d.owner[j] === state ? 0.55 : 1.2);
          if (nc < limit && nc < (cost.get(j) ?? Infinity)) {
            cost.set(j, nc);
            religion[j] = id;
            q.push(j, nc);
          }
        }
      }
    };
    const capitals = map.states
      .map((s, k) => ({ k, b: map.burgs.find((b) => b.id === s.capital) }))
      .filter((s) => s.b && d.land[cellOf(s.b.x, s.b.y)]);
    const landCells = d.land.reduce((a, v) => a + v, 0);
    const orgCount = Math.max(1, Math.min(5, Math.round(capitals.length / 3)));
    const shuffled = [...capitals].sort(() => rr() - 0.5).slice(0, orgCount);
    const FORMS = ["Igreja de", "Caminho de", "Ordem de", "Templo de", "Luz de"];
    for (const { k, b } of shuffled) {
      const c = cellOf(b!.x, b!.y);
      const deity = nameAt(c, k + 7);
      const id = religions.length;
      religions.push({
        name: `${pick(FORMS)} ${deity}`,
        type: "Organizada",
        form: pick(ORG),
        deity,
        color: RELIGION_COLORS[(cults.length + id) % RELIGION_COLORS.length]!,
        origin: c,
      });
      spread(id, c, Math.sqrt(landCells) * (1.2 + rr() * 1.4), k);
    }
    const cultCount = Math.min(3, Math.floor(map.burgs.length / 25));
    for (let t = 0; t < cultCount; t++) {
      const b = pick(map.burgs);
      const c = cellOf(b.x, b.y);
      if (!d.land[c]) continue;
      const deity = nameAt(c, t + 13);
      const id = religions.length;
      religions.push({
        name: `Culto de ${deity}`,
        type: "Culto",
        form: pick(["Culto secreto", "Seita", "Mistérios"]),
        deity,
        color: RELIGION_COLORS[(id * 5) % RELIGION_COLORS.length]!,
        origin: c,
      });
      spread(id, c, 7 + rr() * 6, -2);
    }
  }

  /* ---------- Marcadores ---------- */
  const markers: Marker[] = [];
  {
    const mr = rng(seed ^ 0x3a9c);
    const pick = <T>(a: readonly T[]) => a[Math.floor(mr() * a.length)]!;
    const landCells: number[] = [];
    for (let i = 0; i < n; i++) if (d.land[i]) landCells.push(i);
    const scale = Math.max(0.5, Math.min(1.2, landCells.length / 11000));
    const taken: number[] = [];
    const freeAt = (c: number, r = 3) =>
      !taken.some(
        (t) => Math.hypot(dCol(t % COLS, c % COLS), ((t / COLS) | 0) - ((c / COLS) | 0)) < r,
      );
    const add = (type: MarkerType, c: number, name: string, legend: string, ox = 0.5, oy = 0.5) => {
      taken.push(c);
      markers.push({ type, x: (c % COLS) + ox, y: Math.floor(c / COLS) + oy, name, legend });
    };
    const quota = (k: number) => Math.round(k * scale);
    const e = (c: number) => (h[c]! - SEA) / 127;
    const shuffled = [...landCells].sort(() => mr() - 0.5);
    const burgCells = map.burgs.map((b) => cellOf(b.x, b.y));
    const nearBurg = (c: number, r: number) =>
      burgCells.some(
        (b) => Math.hypot(dCol(b % COLS, c % COLS), ((b / COLS) | 0) - ((c / COLS) | 0)) < r,
      );

    // Vulcões: picos altos (o ponto mais alto da vizinhança).
    const peaks = landCells
      .filter((c) => e(c) > 0.62 && neighbours(c).every(([j]) => h[j]! <= h[c]!))
      .sort(() => mr() - 0.5);
    const volcanoes: number[] = [];
    for (const c of peaks) {
      if (volcanoes.length >= quota(5) || !freeAt(c, 6)) continue;
      volcanoes.push(c);
      const active = mr() < 0.4;
      add(
        "vulcao",
        c,
        `Monte ${nameAt(c, 1)}`,
        active
          ? `Vulcão ativo: a fumaça sobe do cume e a terra treme em volta; ninguém mora na encosta leste.`
          : `Vulcão adormecido há séculos; a cratera guarda um lago verde e cinzas antigas.`,
      );
    }
    // Fontes termais perto dos vulcões.
    for (const v of volcanoes) {
      const near = neighbours(v)
        .flatMap(([j]) => neighbours(j).map(([k]) => k))
        .filter((k) => d.land[k] && freeAt(k, 2));
      if (!near.length || mr() < 0.35) continue;
      const c = pick(near);
      add(
        "termas",
        c,
        `Termas de ${nameAt(c, 2)}`,
        "Águas quentes e sulfurosas; dizem que curam febres e males dos ossos.",
      );
    }
    // Cachoeiras: onde o rio cai de um degrau alto do relevo.
    const falls = landCells
      .filter((c) => {
        const t = d.down[c]!;
        return d.flux[c]! >= d.riverMin && t >= 0 && d.land[t] && h[c]! - h[t]! >= 5;
      })
      .sort((a, b) => h[b]! - h[d.down[b]!]! - (h[a]! - h[d.down[a]!]!));
    let nFalls = 0;
    for (const c of falls) {
      if (nFalls >= quota(6) || !freeAt(c)) continue;
      nFalls++;
      const drop = Math.round((h[c]! - h[d.down[c]!]!) * 9);
      add(
        "cachoeira",
        c,
        `Cachoeira ${nameAt(c, 3)}`,
        `Queda de uns ${drop} metros; o barulho se ouve de longe e há sempre névoa e arco-íris.`,
      );
    }
    // Minas nas serras.
    const ORES = [
      "ferro",
      "prata",
      "ouro",
      "cobre",
      "estanho",
      "sal",
      "pedras preciosas",
      "carvão",
    ];
    let nMines = 0;
    for (const c of shuffled) {
      if (nMines >= quota(8)) break;
      if (e(c) < 0.22 || e(c) > 0.6 || !freeAt(c) || mr() > 0.08) continue;
      nMines++;
      const ore = pick(ORES);
      add(
        "mina",
        c,
        `Mina de ${ore} de ${nameAt(c, 4)}`,
        mr() < 0.3
          ? `Mina de ${ore} abandonada depois de um desabamento; os mineiros juram que algo vive lá embaixo.`
          : `Mina de ${ore} em atividade; carroças descem a serra carregadas toda semana.`,
      );
    }
    // Ruínas longe das cidades de hoje.
    let nRuins = 0;
    for (const c of shuffled) {
      if (nRuins >= quota(7)) break;
      if (d.biome[c] === 11 || nearBurg(c, 4) || !freeAt(c, 5) || mr() > 0.05) continue;
      nRuins++;
      add(
        "ruinas",
        c,
        `Ruínas de ${nameAt(c, 5)}`,
        pick([
          "Restos de uma cidade antiga, engolida pela mata; colunas tombadas e inscrições que ninguém lê.",
          "Uma fortaleza em pedaços, de uma guerra esquecida; os pastores evitam passar ali à noite.",
          "Um templo sem telhado, de deuses que já não têm fiéis.",
        ]),
      );
    }
    // Faróis nos portos.
    let nLights = 0;
    for (const b of [...map.burgs].sort(() => mr() - 0.5)) {
      const c = cellOf(b.x, b.y);
      if (nLights >= quota(6) || d.oceanDist[c]! > 1 || !freeAt(c, 4) || mr() > 0.5) continue;
      nLights++;
      add(
        "farol",
        c,
        `Farol de ${b.name}`,
        "Guia os navios até o porto; o faroleiro mantém o fogo aceso nas noites de tempestade.",
        0.5 + (mr() - 0.5) * 0.6,
        0.1,
      );
    }
    // Estalagens nas estradas, longe das cidades.
    const INNS = [
      "do Javali Dourado",
      "da Lua Cheia",
      "do Viajante Cansado",
      "da Ferradura",
      "do Corvo Branco",
      "das Três Pontes",
      "do Caldeirão",
      "da Estrela do Norte",
    ];
    let nInns = 0;
    for (const r of [...d.roads].sort(() => mr() - 0.5)) {
      if (nInns >= quota(8) || !INNS.length) break;
      if (r.type === "trilha" || r.type === "maritima" || r.cells.length < 10) continue;
      const c = r.cells[Math.floor(r.cells.length / 2)]!;
      if (!d.land[c] || nearBurg(c, 2.5) || !freeAt(c)) continue;
      nInns++;
      add(
        "estalagem",
        c,
        `Estalagem ${INNS.splice(Math.floor(mr() * INNS.length), 1)[0]}`,
        `Parada na ${r.name}: cama, ensopado quente e notícias de todos os cantos.`,
      );
    }
    // Cavernas nas colinas.
    let nCaves = 0;
    for (const c of shuffled) {
      if (nCaves >= quota(5)) break;
      if (e(c) < 0.12 || e(c) > 0.45 || !freeAt(c) || mr() > 0.05) continue;
      nCaves++;
      add(
        "caverna",
        c,
        `Caverna ${nameAt(c, 6)}`,
        pick([
          "Galerias fundas com pinturas antigas nas paredes.",
          "Toca de ursos no inverno, e de contrabandistas no verão.",
          "Um rio subterrâneo corre lá dentro; ninguém achou o fim.",
        ]),
      );
    }
    // Bosques sagrados nas matas.
    let nGroves = 0;
    for (const c of shuffled) {
      if (nGroves >= quota(5)) break;
      const b = d.biome[c]!;
      if (b < 5 || b > 9 || !freeAt(c) || mr() > 0.04) continue;
      nGroves++;
      const rel = religions[religion[c]!];
      add(
        "bosque",
        c,
        `Bosque de ${nameAt(c, 8)}`,
        rel
          ? `Lugar sagrado da ${rel.name}; ali se fazem oferendas a ${rel.deity}.`
          : "Árvores antiquíssimas onde se fazem oferendas aos espíritos da mata.",
      );
    }
    // Campos de batalha nas fronteiras.
    let nBattles = 0;
    for (const c of shuffled) {
      if (nBattles >= quota(4)) break;
      const o = d.owner[c]!;
      if (o < 0 || !freeAt(c, 4) || mr() > 0.3) continue;
      const other = neighbours(c).find(([j]) => d.owner[j]! >= 0 && d.owner[j] !== o);
      if (!other) continue;
      nBattles++;
      const a = map.states[o]?.name ?? "";
      const b2 = map.states[d.owner[other[0]]!]?.name ?? "";
      add(
        "batalha",
        c,
        `Campo de ${nameAt(c, 9)}`,
        `Aqui ${a} e ${b2} travaram a batalha que fixou a fronteira; ainda se acham pontas de lança no chão.`,
      );
    }
  }

  // Noutras épocas, os mesmos lugares viram o que seriam hoje ou no futuro
  // (a cachoeira vira usina, o farol vira porto…), e as capitais ganham aeroporto
  // ou espaçoporto.
  if (era !== "fantasia") {
    const table = ERA_MARKERS[era];
    const mr = rng(seed ^ 0x5eed);
    for (const m of markers) {
      const v = table[m.type];
      if (!v) continue;
      const place = nameAt(cellOf(m.x, m.y), 17);
      m.type = v.type;
      m.name = v.name(place);
      m.legend = v.legend(place);
    }
    map.states.forEach((s, k) => {
      const b = map.burgs.find((x) => x.id === s.capital);
      if (!b || !d.land[cellOf(b.x, b.y)]) return;
      const at = (type: MarkerType, name: string, legend: string, dx: number) =>
        markers.push({ type, x: b.x + dx, y: b.y + 0.6, name, legend });
      if (era === "atual") {
        at(
          "aeroporto",
          `Aeroporto Internacional de ${b.name}`,
          "Voos para todos os continentes; o terminal novo foi inaugurado há poucos anos.",
          0.8,
        );
        if (k % 2 === 0)
          at(
            "universidade",
            `Universidade de ${b.name}`,
            "A maior do país, com hospital-escola e um observatório no campus.",
            -0.8,
          );
      } else if (mr() < 0.6)
        at(
          "espacoporto",
          `Espaçoporto de ${b.name}`,
          "Lançamentos diários para as estações em órbita e as colônias lunares.",
          0.8,
        );
      else
        at(
          "arcologia",
          `Arcologia ${b.name}`,
          "Uma torre-cidade de dois quilômetros, com fazendas verticais e um milhão de moradores.",
          0.8,
        );
    });
    if (era === "futurista") {
      // Elevador orbital: na terra mais perto do equador.
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < n; i++) {
        if (!d.land[i]) continue;
        const dist = Math.abs(((i / COLS) | 0) + 0.5 - ROWS / 2);
        if (dist < bestD) {
          bestD = dist;
          best = i;
        }
      }
      if (best >= 0)
        markers.push({
          type: "elevador",
          x: (best % COLS) + 0.5,
          y: Math.floor(best / COLS) + 0.5,
          name: `Elevador Orbital ${nameAt(best, 23)}`,
          legend:
            "O cabo sobe 36 mil quilômetros até a estação geoestacionária; a viagem leva cinco dias.",
        });
    }
  }

  return { province, provinces, religion, religions, markers };
}
