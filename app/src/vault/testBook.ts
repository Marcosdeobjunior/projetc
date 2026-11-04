import type { VaultFs } from "../platform/types";
import type { NoteKind, Project } from "../manuscript/types";
import { addChapter, addNote, addScene, renameChapter, renameScene } from "../manuscript/tree";
import { createVault, saveProject, writeSceneMarkdown } from "./vault";

/*
 * Livro grande de teste, só para dar volume (desempenho, listas longas,
 * minimapa cheio). O texto é gerado com um sorteio de semente fixa: o mesmo
 * livro sai igual toda vez. Disponível só no modo de desenvolvimento.
 */

export const TEST_BOOK_TITLE = "Crônicas de Teste (volume)";

const CHAPTERS = 14;
const MIN_SCENES = 3;
const MAX_SCENES = 6;
const MIN_PARAGRAPHS = 8;
const MAX_PARAGRAPHS = 16;

const CHARACTERS: [string, string][] = [
  ["Aurélio Bastos", "Cartógrafo aposentado. Guarda mapas de cidades que não existem mais."],
  ["Beatriz Moura", "Faroleira. Não dorme desde a noite da tempestade."],
  ["Caio Rangel", "Contrabandista charmoso, mente quase sempre."],
  ["Dalva Prates", "Dona da pensão. Sabe o nome de todos os hóspedes, inclusive os falsos."],
  ["Elias Furtado", "Relojoeiro. Seus relógios atrasam de propósito."],
  ["Flora Antunes", "Botânica obcecada por uma flor que só abre no escuro."],
  ["Gaspar Leme", "Delegado cansado, honesto demais para o cargo."],
  ["Helô Siqueira", "Jornalista do único jornal da cidade."],
  ["Inácio Tavares", "Padre que perdeu a fé, mas não o hábito de ouvir segredos."],
  ["Joana Vidal", "Protagonista. Volta à cidade natal depois de vinte anos."],
  ["Lauro Pessoa", "Irmão mais novo de Joana. Ficou para cuidar da casa."],
  ["Marta Quintela", "Prefeita. Sorri demais."],
  ["Nestor Valença", "Pescador que encontrou a caixa de ferro."],
  ["Otília Barros", "Bibliotecária. Esconde livros proibidos atrás dos dicionários."],
  ["Pedro Assunção", "Médico da cidade, amigo de infância de Joana."],
  ["Quitéria Lins", "Benzedeira. Ninguém sabe a idade dela."],
  ["Rafael Dorneles", "Engenheiro enviado pela capital para fechar o porto."],
  ["Sílvia Arruda", "Pianista do hotel. Toca sempre a mesma música às três da manhã."],
  ["Tomás Ventura", "Menino de recados que vê tudo."],
  ["Vera Cardoso", "Mãe de Joana. Morreu há um ano, mas deixou cartas."],
];

const PLACES: [string, string][] = [
  ["Porto Velho das Garças", "A cidade costeira onde tudo acontece. Névoa todas as manhãs."],
  ["Farol da Ponta Seca", "Desativado oficialmente há dez anos. Ainda acende."],
  ["Pensão Dalva", "Três andares, escadas que rangem, um quarto sempre trancado."],
  ["Mercado do Cais", "Peixe, fofoca e mercadorias sem nota."],
  ["Igreja de São Brás", "Sino rachado. A cripta foi lacrada em 1952."],
  ["Biblioteca Municipal", "Prédio art déco com goteiras e segredos."],
  ["Hotel Atlântico", "Glória perdida. Um piano no saguão."],
  ["Ilha das Cabras", "Visível da praia na maré baixa. Ninguém vai lá."],
];

const IDEAS: [string, string][] = [
  ["A caixa de ferro", "O que Nestor encontrou na rede. Contém as cartas de Vera."],
  [
    "O mapa incompleto",
    "Aurélio desenhou a ilha com um túnel que não aparece em nenhum outro mapa.",
  ],
  ["A música das três", "A melodia de Sílvia é um código. Revelar no capítulo 9."],
  ["O fechamento do porto", "Rafael tem ordens, mas também tem dúvidas."],
  ["A noite da tempestade", "O evento de vinte anos atrás que todo mundo finge não lembrar."],
  ["Final alternativo", "E se Lauro souber de tudo desde o começo?"],
];

const CHAPTER_TITLES = [
  "A volta",
  "Névoa",
  "A pensão",
  "Cartas na gaveta",
  "O farol",
  "Maré baixa",
  "O mercado",
  "Três da manhã",
  "A cripta",
  "O mapa",
  "Tempestade",
  "A ilha",
  "O que ficou",
  "Porto",
];

const SCENE_TITLES = [
  "Chegada",
  "Conversa na cozinha",
  "O bilhete",
  "Passos no corredor",
  "No cais",
  "A visita",
  "Silêncio",
  "Na biblioteca",
  "A discussão",
  "De madrugada",
  "O reencontro",
  "Lembranças",
  "A descoberta",
  "Fuga",
  "Chuva",
  "O acordo",
];

const OPENINGS = [
  "Naquela manhã",
  "Quando a névoa baixou",
  "Sem aviso",
  "Pouco depois do almoço",
  "Ao cair da noite",
  "No meio da conversa",
  "Antes que alguém percebesse",
  "Do outro lado da rua",
  "Enquanto a chuva insistia",
  "Logo cedo",
];

const ACTIONS = [
  "atravessou a praça com pressa",
  "parou diante da janela",
  "guardou a carta no bolso",
  "olhou para o mar como quem procura uma resposta",
  "fingiu não ter ouvido",
  "subiu a escada devagar",
  "acendeu a luz da cozinha",
  "contou as moedas duas vezes",
  "fechou a porta sem fazer barulho",
  "ficou em silêncio por muito tempo",
  "riu de um jeito que não convencia ninguém",
  "anotou alguma coisa num caderno velho",
];

const DETAILS = [
  "O cheiro de sal entrava por todas as frestas.",
  "Ao longe, o sino rachado bateu uma vez.",
  "As tábuas do assoalho reclamavam a cada passo.",
  "Havia areia até dentro das gavetas.",
  "O relógio da sala estava, como sempre, atrasado.",
  "A luz do farol varreu o quarto e sumiu.",
  "Alguém tinha deixado um copo de café pela metade.",
  "Na rua, um cachorro latiu para ninguém.",
  "O vento trouxe o som de um piano distante.",
  "As gaivotas brigavam por restos no cais.",
];

const LINES = [
  "Você não devia ter voltado.",
  "Eu sei o que vi naquela noite.",
  "Ninguém aqui fala sobre isso.",
  "Tem coisa que é melhor não saber.",
  "Ela deixou isso para você.",
  "Amanhã cedo, no cais. Não se atrase.",
  "Isso não é da sua conta.",
  "Você ainda tem a chave?",
  "A cidade mudou. Você também.",
  "Eu esperei vinte anos por essa conversa.",
];

const REFLECTIONS = [
  "pensou que talvez tudo aquilo fosse só cansaço",
  "lembrou da mãe cantando na varanda",
  "sentiu que a cidade inteira prendia a respiração",
  "percebeu que estava sendo observado",
  "entendeu, enfim, por que ninguém tocava no assunto",
  "decidiu que não ia mais fugir",
  "teve vontade de rir e de chorar ao mesmo tempo",
  "achou estranho que ninguém tivesse perguntado nada",
];

/** Sorteio com semente fixa (mulberry32). */
function random(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function paragraphs(rand: () => number, count: number): string {
  const pick = <T>(list: T[]) => list[Math.floor(rand() * list.length)]!;
  const firstName = (full: string) => full.split(" ")[0]!;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const [who] = pick(CHARACTERS);
    const [other] = pick(CHARACTERS);
    const [where] = pick(PLACES);
    const roll = rand();
    // Parte dos nomes vira [[link]]; o resto conta como menção automática.
    const name = rand() < 0.3 ? `[[${who}]]` : firstName(who);
    if (roll < 0.25) {
      out.push(
        `— ${pick(LINES)} — disse ${firstName(who)}.\n\n— ${pick(LINES)} — respondeu ${firstName(other)}.`,
      );
    } else if (roll < 0.45) {
      const place = rand() < 0.4 ? `[[${where}]]` : where;
      out.push(
        `${pick(OPENINGS)}, em ${place}, ${name} ${pick(ACTIONS)}. ${pick(DETAILS)} ${pick(DETAILS)}`,
      );
    } else if (roll < 0.5) {
      out.push("* * *");
    } else {
      out.push(
        `${pick(OPENINGS)}, ${name} ${pick(ACTIONS)}. ${pick(DETAILS)} ${firstName(other)} ${pick(ACTIONS)}, e ${firstName(who)} ${pick(REFLECTIONS)}. ${pick(DETAILS)}`,
      );
    }
  }
  return out.join("\n\n") + "\n";
}

/** Cria o livro de teste na pasta indicada. */
export async function createTestBook(fs: VaultFs): Promise<Project> {
  const rand = random(20261104);
  const between = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  let p = await createVault(fs, TEST_BOOK_TITLE);
  const texts: [string, string][] = [];

  for (let c = 0; c < CHAPTERS; c++) {
    const title = CHAPTER_TITLES[c % CHAPTER_TITLES.length]!;
    let chapterId: string;
    if (c === 0) {
      chapterId = p.chapters[0]!.id;
      p = renameChapter(p, chapterId, title).project;
    } else {
      const r = addChapter(p, title);
      p = r.project;
      chapterId = r.chapter.id;
    }
    const scenes = between(MIN_SCENES, MAX_SCENES);
    for (let s = 0; s < scenes; s++) {
      const sceneTitle = SCENE_TITLES[(c * 3 + s) % SCENE_TITLES.length]!;
      let sceneId: string;
      if (c === 0 && s === 0) {
        sceneId = p.chapters[0]!.scenes[0]!.id;
        p = renameScene(p, sceneId, sceneTitle).project;
      } else {
        const r = addScene(p, chapterId, sceneTitle);
        p = r.project;
        sceneId = r.scene.id;
      }
      texts.push([sceneId, paragraphs(rand, between(MIN_PARAGRAPHS, MAX_PARAGRAPHS))]);
    }
  }

  // Os arquivos de "Capítulo 1/Cena 1" foram criados antes de renomear.
  await fs.remove("manuscrito/capitulo-1");

  const notes: [NoteKind, [string, string][]][] = [
    ["personagens", CHARACTERS],
    ["lugares", PLACES],
    ["ideias", IDEAS],
  ];
  for (const [kind, list] of notes) {
    for (const [title, about] of list) {
      const r = addNote(p, kind, title);
      p = r.project;
      texts.push([r.note.id, `${about}\n\n${paragraphs(rand, between(1, 3))}`]);
    }
  }

  for (const [id, md] of texts) await writeSceneMarkdown(fs, p, id, md);
  await saveProject(fs, p);
  return p;
}
