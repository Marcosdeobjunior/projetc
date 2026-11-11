/*
 * Diagnóstico da ficha de personagem: sugestões tiradas das próprias perguntas
 * da ficha (desejo × necessidade, mentira → fantasma, fraqueza → oponente…).
 * Cada sugestão aponta o campo onde agir.
 */

export interface CharacterTip {
  /** Campo da ficha a preencher ou rever. */
  key: string;
  text: string;
}

const has = (f: Record<string, string>, ...keys: string[]) => keys.every((k) => !!f[k]?.trim());

export function characterTips(fields: Record<string, string> | undefined): CharacterTip[] {
  const f = fields ?? {};
  const tips: CharacterTip[] = [];
  const add = (key: string, text: string) => tips.push({ key, text });
  const coadjuvante = f.papel === "Coadjuvante";

  if (!has(f, "papel")) add("papel", "Escolha o papel na história: muda o que a ficha precisa.");
  if (coadjuvante) {
    if (!has(f, "funcaoQuer"))
      add("funcaoQuer", "Todo coadjuvante quer algo, nem que seja um copo d’água.");
    if (!has(f, "funcaoServe")) add("funcaoServe", "Para que ele serve à história?");
  }
  if (!has(f, "objetivo"))
    add("objetivo", "Defina o que ele quer, concreto e visível em cena: o desejo move as cenas.");
  else if (!has(f, "desejoCena"))
    add("desejoCena", "Mostre o desejo em ação: o que ele faz numa cena comum para conseguir?");
  if (!coadjuvante) {
    if (has(f, "objetivo") && !has(f, "mentira"))
      add("mentira", "Em que mentira ele acredita? Muitas vezes é ela que gera o desejo.");
    if (has(f, "mentira") && !has(f, "fantasma"))
      add("fantasma", "De onde veio a mentira? Um evento do passado que a fez parecer verdade.");
    if (has(f, "mentira") && !has(f, "necessidade"))
      add("necessidade", "A necessidade é a verdade que desmente a mentira. Qual é?");
    if (has(f, "objetivo", "necessidade"))
      add(
        "necessidade",
        "Teste: ele consegue o desejo e a necessidade ao mesmo tempo? Se sim, falta conflito.",
      );
    if (!has(f, "fraquezaPsicologica") && !has(f, "fraquezaMoral"))
      add(
        "fraquezaPsicologica",
        "Dê a ele uma fraqueza: uma que só o machuca e outra que fere os outros.",
      );
    else if (!has(f, "oponente"))
      add("oponente", "Quem ou o que ataca exatamente essa fraqueza? Esse é o oponente.");
    if (f.papel === "Protagonista" && !has(f, "torcida"))
      add("torcida", "Por que o leitor torce por ele? Uma qualidade que desperte simpatia.");
    if (!has(f, "arcoTipo"))
      add("arcoTipo", "Escolha o tipo de arco: positivo, negativo ou plano.");
    else if (!has(f, "arcoInicio", "arcoVirada", "arcoFim"))
      add(
        has(f, "arcoInicio") ? (has(f, "arcoVirada") ? "arcoFim" : "arcoVirada") : "arcoInicio",
        "Desenhe o arco: início, ponto de virada e fim.",
      );
  }
  if (!has(f, "contradicao"))
    add("contradicao", "Um traço que não combina com o resto, mas convence, o torna vivo.");
  if (!has(f, "voz"))
    add("voz", "Como ele fala? Teste: sem o nome, dá para saber que é ele falando?");
  return tips;
}
