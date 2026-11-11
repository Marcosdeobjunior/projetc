import { rng } from "./geom";

/*
 * Nomes por cadeias de Markov: cada cultura tem uma base de nomes de lugar com
 * um "sotaque" (escritas aqui, para este app). A cadeia aprende que letra vem
 * depois de cada par de letras e inventa nomes novos que soam como a base.
 */

export interface NameBase {
  id: string;
  label: string;
  names: string[];
  min: number;
  max: number;
}

export const NAME_BASES: NameBase[] = [
  {
    id: "lusitana",
    label: "Lusitana",
    min: 5,
    max: 11,
    names:
      "Alcarva Belmira Corvela Sertela Valdouro Montarel Ribamar Aldeira Pedralva Vilarim Fonteira Lagoal Sobreda Alvaral Terreira Castanhal Moirinha Penedela Serrada Vargelas Almoural Cabrela Ferreiral Gouveal Lameirão Mirandela Ourival Pinheira Quintela Rosmaninhal Soutelo Tabuaço Valverde Ervedal Alvorinha Carvalhal Barrancos Sabugal Marvela Oleiros".split(
        " ",
      ),
  },
  {
    id: "nordica",
    label: "Nórdica",
    min: 5,
    max: 10,
    names:
      "Skarvik Hallden Ostrum Breidal Kjellvik Tornholm Asgren Frostad Vargnes Lindvik Ravnsund Eidfjord Hjalmar Solvang Bergnes Grimstad Hvitaby Ulvaker Sandvik Torsby Kolbotn Eldheim Jarnvik Mosvatn Nordal Rimfrost Skogby Stavang Trollvik Vikholm Ytrebo Ormsund Haugland Isfjell Brattli Djupvik Fjellby Gudvang Kvitnes".split(
        " ",
      ),
  },
  {
    id: "elfica",
    label: "Élfica",
    min: 6,
    max: 11,
    names:
      "Aelindor Sirithel Elarion Myrwen Thalanis Ithirel Caelith Naerwen Ylmaris Faelora Lirandel Saelith Vaeriel Aranthil Elowen Ithrandis Nimrael Quessir Thaerin Ullasel Yvaine Celebrin Maerith Lothiel Esseril Ilvaris Seraphel Aeloria Valindra Mirethil Taelor Cirwen Elandris Faenor Ithalis Lyrael Naevaris Oriel Sylvaris".split(
        " ",
      ),
  },
  {
    id: "desertica",
    label: "Desértica",
    min: 5,
    max: 10,
    names:
      "Qaradan Zahirah Almadir Sabbak Kharzim Mirabad Tazrit Oudara Samarkh Nefrah Bashira Dunezar Hamadan Jaffar Kassira Marrakh Nizarin Qasbah Rimal Sahran Tarim Waddan Yazira Zarqan Alkhem Bahrein Darabi Faruq Ghazir Ifran Jalur Khamsin Luxar Mazir Qadar Sirwah Tafilal Ubar".split(
        " ",
      ),
  },
  {
    id: "eslava",
    label: "Eslava",
    min: 5,
    max: 10,
    names:
      "Vlodrin Bryazhev Korosten Velimir Dravsk Zoltavy Mirogrod Stanevo Krasivo Bolotnik Gorodec Zlatovo Rudnya Volkovo Lisichka Medvezh Ozersk Polyana Rovno Sosnovka Tverdin Uglich Vyshgor Yarovo Zabolot Belogor Chernov Dubrava Kamensk Lugovo Morozov Novgrad Ostrov Prilesk Radomir Svetlov Tumanov Ulyansk".split(
        " ",
      ),
  },
  {
    id: "latina",
    label: "Latina",
    min: 5,
    max: 11,
    names:
      "Aurelia Castrum Valentia Tiberna Marcelium Severa Corvinum Lucana Octavium Albanum Brevia Calvisa Decimum Faustina Gratiana Hispalia Iulium Laurentum Mediola Nervia Portunum Quirina Ravenum Sabinum Tarracum Umbria Veletra Antium Bellona Claudium Drusilla Etruria Flavium Hadria Lavinium Minervum Nonnium Ostium".split(
        " ",
      ),
  },
  {
    id: "celta",
    label: "Celta",
    min: 5,
    max: 11,
    names:
      "Dunmorrow Kilrenna Glenmoor Aberdyn Carrowen Lismore Dunarra Penmorva Ballinor Caerwyn Drumlee Inverlach Kilbrennan Llanfair Moyvalley Rathcoole Strathan Tullamore Aranmor Bryncarrig Cairnloch Dalwhinny Eskadale Fernabhal Glenshee Innisfree Kincaid Lochgarry Morvenna Nairnach Penrhyn Rosgael Skerrin Tralee Uisneach Wynmorrow".split(
        " ",
      ),
  },
];

export const nameBase = (id: string) => NAME_BASES.find((b) => b.id === id) ?? NAME_BASES[0]!;

type Chain = Map<string, string[]>;
const chains = new Map<string, Chain>();

/** Cadeia de ordem 2: para cada par de letras, as letras que vêm depois ("$" = fim). */
function chainFor(base: NameBase): Chain {
  const cached = chains.get(base.id);
  if (cached) return cached;
  const chain: Chain = new Map();
  for (const raw of base.names) {
    const word = "^^" + raw.toLowerCase() + "$";
    for (let i = 2; i < word.length; i++) {
      const key = word.slice(i - 2, i);
      const list = chain.get(key) ?? [];
      list.push(word[i]!);
      chain.set(key, list);
    }
  }
  chains.set(base.id, chain);
  return chain;
}

/** Gerador de nomes de uma base, com semente; não repete nomes já dados. */
export function makeMarkovNamer(baseId: string, seed: number, used = new Set<string>()) {
  const base = nameBase(baseId);
  const chain = chainFor(base);
  const rand = rng(seed ^ 0x2f6e2b1);
  const known = new Set(base.names.map((n) => n.toLowerCase()));
  return () => {
    for (let tries = 0; tries < 60; tries++) {
      let key = "^^";
      let out = "";
      for (let k = 0; k < 16; k++) {
        const next = chain.get(key);
        if (!next) break;
        const c = next[Math.floor(rand() * next.length)]!;
        if (c === "$") break;
        out += c;
        key = key[1] + c;
      }
      if (out.length < base.min || out.length > base.max) continue;
      if (/(.)\1\1/.test(out)) continue;
      // Prefere nomes novos (não copiados da base); depois de muitas tentativas aceita.
      if (known.has(out) && tries < 40) continue;
      const name = out.charAt(0).toUpperCase() + out.slice(1);
      if (used.has(name)) continue;
      used.add(name);
      return name;
    }
    const fallback = base.names[Math.floor(rand() * base.names.length)]! + " " + (used.size + 1);
    used.add(fallback);
    return fallback;
  };
}
