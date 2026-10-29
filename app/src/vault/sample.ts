import type { VaultFs } from "../platform/types";
import type { Project } from "../manuscript/types";
import { addChapter, addScene, renameChapter, renameScene } from "../manuscript/tree";
import { createVault, saveProject, writeSceneMarkdown } from "./vault";

/** Projeto de exemplo criado na primeira visita à prévia no navegador. */
export async function createSampleVault(fs: VaultFs): Promise<Project> {
  let p = await createVault(fs, "Meu Romance (exemplo)");
  const ch1 = p.chapters[0]!;
  p = renameChapter(p, ch1.id, "O começo").project;
  p = renameScene(p, ch1.scenes[0]!.id, "A carta").project;
  const helena = addScene(p, ch1.id, "Helena");
  p = helena.project;
  const ch2 = addChapter(p, "A cidade");
  p = ch2.project;
  const chegada = addScene(p, ch2.chapter.id, "Chegada");
  p = chegada.project;

  // Os arquivos de "Capítulo 1/Cena 1" foram criados antes de renomear.
  await fs.remove("manuscrito/capitulo-1");

  const texts: [string, string][] = [
    [
      p.chapters[0]!.scenes[0]!.id,
      "O vento soprava frio naquela manhã, e a cidade ainda parecia adormecida. Lucas caminhava pelas ruas estreitas carregando mais do que uma mochila: carregava as perguntas que nunca tinha feito.\n\n" +
        "A carta estava no bolso do casaco. Ele já tinha lido três vezes e ainda não acreditava na letra. Era a do pai.\n\n" +
        "* * *\n\n" +
        "*Não procure por mim*, dizia a última linha. Lucas dobrou o papel e decidiu fazer exatamente o contrário.\n",
    ],
    [
      helena.scene.id,
      "Na esquina da padaria, Helena já esperava por ele, com dois cafés e aquele olhar de quem sabe mais do que diz.\n\n" +
        "— Você vai mesmo? — perguntou, sem rodeios.\n\n" +
        "— Vou. Hoje.\n",
    ],
    [
      chegada.scene.id,
      "A estação de Vila Serena cheirava a ferrugem e chuva. Lucas desceu do trem com a sensação de que alguém o observava.\n",
    ],
  ];
  for (const [id, md] of texts) await writeSceneMarkdown(fs, p, id, md);
  await saveProject(fs, p);
  return p;
}
