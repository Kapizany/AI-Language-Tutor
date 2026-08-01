import { writeFileSync } from "node:fs";

const C = (title, explanation, target, translation) => ({
  title_pt_br: title,
  explanation_pt_br: explanation,
  examples: [{ target, translation_pt_br: translation }],
});
const M = (incorrect, correct, explanation) => ({
  incorrect, correct, explanation_pt_br: explanation,
});
const T = (level, title, concept, formation, cases, mistakes, notes) => ({
  level, title, concept, formation, cases, mistakes, notes,
});

const catalog = {
  en: [
    T("A1", "Preposições de lugar, tempo e movimento",
      "As preposições inglesas não correspondem palavra por palavra ao português. A escolha depende de como o falante representa lugar, período ou deslocamento.",
      "Lugar: at para ponto, in para área ou interior e on para superfície. Tempo: at + hora, on + dia e in + mês, ano ou período. Movimento: to, into, onto, from e through.",
      [
        C("Lugar", "Use at para um ponto, in para um espaço e on para uma superfície.", "The keys are on the table.", "As chaves estão sobre a mesa."),
        C("Tempo", "A precisão cresce de in para on e at.", "The meeting is on Monday at nine.", "A reunião é na segunda-feira às nove."),
        C("Movimento", "Into destaca entrada; to indica destino.", "She walked into the room.", "Ela entrou caminhando na sala."),
      ],
      [M("I work in Monday.", "I work on Monday.", "Dias da semana usam on."), M("She arrived to the airport.", "She arrived at the airport.", "Arrive usa at para pontos e in para cidades ou países.")],
      ["Não traduza em/no/na automaticamente como in.", "Memorize preposição junto com a expressão."]),
    T("A2", "Conjunções coordenativas e subordinativas",
      "Conjunções ligam ideias e deixam a fala menos fragmentada. Elas podem adicionar, contrastar, apresentar causa, consequência, condição ou tempo.",
      "Coordenação: and, but, or, so e yet. Subordinação: because, although, if, when, while, before e after + oração.",
      [
        C("Causa e consequência", "Because apresenta causa; so introduz resultado.", "I stayed home because it was raining.", "Fiquei em casa porque estava chovendo."),
        C("Contraste", "Although inicia uma concessão; but conecta duas orações independentes.", "Although I was tired, I finished the report.", "Embora estivesse cansado, terminei o relatório."),
        C("Condição", "If apresenta a condição necessária.", "If you need help, call me.", "Se precisar de ajuda, ligue para mim."),
      ],
      [M("Because it rained, so I stayed home.", "Because it rained, I stayed home.", "Não combine because e so na mesma relação."), M("Although she was tired, but she continued.", "Although she was tired, she continued.", "Although já marca o contraste.")],
      ["Use vírgula quando a oração subordinada vier primeiro.", "Yet expressa contraste mais enfático que but."]),
    T("A2", "Phrasal verbs essenciais",
      "Phrasal verbs combinam verbo e partícula e formam um significado próprio. A partícula pode alterar completamente o sentido do verbo original.",
      "Inseparáveis: look after someone. Separáveis: turn the light off ou turn off the light; com pronome, turn it off. Alguns são intransitivos: wake up.",
      [
        C("Rotina", "Wake up, get up, put on e take off descrevem ações frequentes.", "I wake up at seven and put on my jacket.", "Acordo às sete e visto minha jaqueta."),
        C("Interação", "Find out, look for e pick up aparecem em situações cotidianas.", "I need to find out the train time.", "Preciso descobrir o horário do trem."),
        C("Cuidado", "Look after significa cuidar, não olhar depois.", "Can you look after my dog?", "Você pode cuidar do meu cachorro?"),
      ],
      [M("Turn off it.", "Turn it off.", "Pronomes ficam entre verbo e partícula nos separáveis."), M("I am looking my keys.", "I am looking for my keys.", "Look for significa procurar.")],
      ["Aprenda cada phrasal verb com uma frase.", "Confira se ele é separável no dicionário."]),
    T("B1", "Conectores para organizar ideias",
      "Conectores orientam o leitor ou ouvinte sobre a relação lógica entre partes do discurso. Eles são essenciais para respostas longas e textos coesos.",
      "Adição: moreover, in addition. Contraste: however, whereas. Resultado: therefore, as a result. Exemplificação: for instance. Sequência: first, then, finally.",
      [
        C("Contraste formal", "However costuma iniciar uma nova oração e recebe pontuação.", "The plan is expensive. However, it may save time.", "O plano é caro. Entretanto, pode economizar tempo."),
        C("Resultado", "Therefore e as a result apresentam uma conclusão lógica.", "Demand increased; therefore, we hired more staff.", "A demanda aumentou; portanto, contratamos mais pessoas."),
        C("Exemplo", "For example e for instance concretizam uma afirmação.", "Some habits improve sleep; for instance, avoiding screens.", "Alguns hábitos melhoram o sono; por exemplo, evitar telas."),
      ],
      [M("However the plan is useful.", "However, the plan is useful.", "Como advérbio conector inicial, however pede vírgula."), M("Because demand rose. Therefore we hired.", "Demand rose; therefore, we hired.", "Evite fragmentos e pontue a relação entre orações.")],
      ["Conectores não substituem uma relação lógica clara.", "Varie os conectores sem usar termos excessivamente formais na fala casual."]),
    T("B1", "Gerúndio e infinitivo",
      "Depois de certos verbos, o inglês exige forma em -ing ou infinitivo com to. Alguns verbos aceitam ambos, às vezes com mudança importante de significado.",
      "Enjoy, avoid, suggest + -ing. Want, decide, need + to + verbo. Make/let + objeto + verbo sem to. Stop/remember/try mudam de sentido conforme a forma.",
      [
        C("Preferência e decisão", "Enjoy seleciona -ing; decide seleciona infinitivo.", "She enjoys reading but decided to study law.", "Ela gosta de ler, mas decidiu estudar direito."),
        C("Mudança de sentido", "Stop doing encerra uma ação; stop to do interrompe algo para realizar outra ação.", "He stopped smoking.", "Ele parou de fumar."),
        C("Tentativa", "Try doing testa uma solução; try to do enfatiza o esforço.", "Try restarting the computer.", "Tente reiniciar o computador."),
      ],
      [M("I enjoy to travel.", "I enjoy traveling.", "Enjoy é seguido de gerúndio."), M("She suggested to leave.", "She suggested leaving.", "Suggest seleciona forma em -ing.")],
      ["Registre o verbo junto com seu complemento.", "O uso britânico e americano pode variar na grafia de traveling/travelling."]),
    T("B1", "Collocations e expressões frequentes",
      "Collocations são combinações que os falantes consideram naturais. Mesmo uma frase gramatical pode soar artificial quando usa uma combinação improvável.",
      "Verbo + substantivo: make a decision, take a break, have a chance, do research. Adjetivo + substantivo: heavy rain, strong opinion. Expressões devem ser aprendidas em blocos.",
      [
        C("Make e do", "Make costuma criar ou produzir; do se liga a tarefas e atividades.", "We need to make a decision after doing more research.", "Precisamos tomar uma decisão após fazer mais pesquisa."),
        C("Take e have", "Take aparece em ações delimitadas; have em experiências ou posse.", "Let's take a break and have a coffee.", "Vamos fazer uma pausa e tomar um café."),
        C("Intensidade natural", "Dizemos heavy rain e strong coffee, não strong rain.", "Heavy rain caused serious damage.", "A chuva forte causou danos graves."),
      ],
      [M("Do a decision.", "Make a decision.", "Decision forma collocation com make."), M("A powerful rain.", "Heavy rain.", "Heavy é a combinação convencional com rain.")],
      ["Use corpus ou dicionário de collocations.", "Aprender blocos melhora fluência e precisão."]),
    T("B2", "Phrasal verbs avançados e registro",
      "Em níveis avançados, phrasal verbs expressam processos abstratos e variam de registro. Em textos formais, muitas vezes existe um verbo latino equivalente.",
      "Carry out = perform; put off = postpone; bring up = mention; come up with = devise; rule out = eliminate; put up with = tolerate.",
      [
        C("Trabalho e pesquisa", "Carry out e follow up descrevem execução e acompanhamento.", "The team carried out the study and followed up on the results.", "A equipe realizou o estudo e acompanhou os resultados."),
        C("Discussão", "Bring up introduz um assunto; point out chama atenção para um aspecto.", "She brought up the budget and pointed out a risk.", "Ela levantou o orçamento e apontou um risco."),
        C("Solução", "Come up with cria uma ideia; rule out elimina uma hipótese.", "We came up with a solution after ruling out two options.", "Encontramos uma solução após descartar duas opções."),
      ],
      [M("We carried the research.", "We carried out the research.", "Carry out significa realizar uma atividade planejada."), M("She brought the issue up it.", "She brought the issue up.", "Não repita o objeto após um phrasal verb separável.")],
      ["Prefira equivalentes formais quando o gênero exigir.", "A posição do objeto depende da separabilidade."]),
    T("B2", "Idioms, nuance e linguagem figurada",
      "Expressões idiomáticas não podem ser interpretadas literalmente. Elas carregam tom, contexto cultural e grau de formalidade, por isso devem ser usadas com moderação.",
      "Idioms funcionam como blocos: get the ball rolling, be on the same page, take something with a grain of salt, miss the point. O contexto determina tempo e concordância.",
      [
        C("Colaboração", "Be on the same page indica entendimento compartilhado.", "Let's confirm the goals so everyone is on the same page.", "Vamos confirmar as metas para que todos estejam alinhados."),
        C("Ceticismo", "Take with a grain of salt recomenda não aceitar algo totalmente.", "Take those predictions with a grain of salt.", "Considere essas previsões com cautela."),
        C("Início de ação", "Get the ball rolling significa iniciar um processo.", "A short meeting will get the ball rolling.", "Uma reunião curta dará início ao processo."),
      ],
      [M("We are in the same page.", "We are on the same page.", "A expressão fixa usa on."), M("Let's start the ball rolling it.", "Let's get the ball rolling.", "Não altere livremente uma expressão cristalizada.")],
      ["Evite idioms em contratos e instruções críticas.", "Confirme o registro antes de usar uma expressão cultural."]),
  ],
  es: [
    T("A1", "Preposiciones básicas: a, de, en, con",
      "As preposições espanholas parecem próximas do português, mas apresentam regências próprias. A escolha correta depende de destino, origem, localização, companhia e modo.",
      "A indica destino e hora; de indica origem e posse; en marca localização e meio; con expressa companhia ou instrumento. Al e del são contrações obrigatórias.",
      [C("Destino e localização", "Use a para movimento e en para posição.", "Voy al mercado y estoy en la tienda.", "Vou ao mercado e estou na loja."), C("Origem e posse", "De liga origem, matéria ou possuidor.", "El libro de Ana viene de Madrid.", "O livro de Ana vem de Madri."), C("Companhia", "Con apresenta companhia ou instrumento.", "Hablo con mi profesor.", "Falo com meu professor.")],
      [M("Voy en Madrid.", "Voy a Madrid.", "Destinos usam a."), M("Vengo a Brasil.", "Vengo de Brasil.", "Origem usa de.")],
      ["A + el = al; de + el = del.", "Meios de transporte geralmente usam en."]),
    T("A2", "Por e para",
      "Por e para frequentemente correspondem a por ou para em português, mas organizam causa, meio, percurso, troca, finalidade, destino e prazo de maneiras diferentes.",
      "Por: causa, meio, duração aproximada, percurso e troca. Para: finalidade, destinatário, destino, opinião e prazo.",
      [C("Causa e finalidade", "Por explica o motivo; para apresenta o objetivo.", "Estudio por interés y para trabajar en España.", "Estudo por interesse e para trabalhar na Espanha."), C("Meio e destinatário", "Por indica canal; para indica quem recebe.", "Te envié el documento por correo para tu jefe.", "Enviei o documento por e-mail para seu chefe."), C("Prazo", "Para seguido de data marca limite.", "Necesito el informe para el viernes.", "Preciso do relatório para sexta-feira.")],
      [M("Trabajo por ganar dinero.", "Trabajo para ganar dinero.", "Uma finalidade usa para."), M("Este regalo es por ti.", "Este regalo es para ti.", "Destinatário usa para.")],
      ["Gracias por e perdón por são combinações fixas.", "Estar por + infinitivo pode indicar algo ainda não feito."]),
    T("A2", "Conjunciones y conectores básicos",
      "Conjunções unem palavras e orações; conectores mostram adição, contraste, causa, consequência, condição e sequência no discurso.",
      "Y/e adicionam; o/u apresentam alternativa; pero e aunque contrastam; porque explica causa; por eso mostra consequência; si introduz condição.",
      [C("Mudanças eufônicas", "Y vira e antes de som /i/; o vira u antes de som /o/.", "Estudio español e italiano.", "Estudo espanhol e italiano."), C("Causa e resultado", "Porque responde por quê; por eso apresenta efeito.", "Llovía, por eso tomé un taxi.", "Chovia, por isso peguei um táxi."), C("Concessão", "Aunque reconhece uma dificuldade sem cancelar a ideia principal.", "Aunque estaba cansada, salió.", "Embora estivesse cansada, saiu.")],
      [M("No fui por qué estaba enfermo.", "No fui porque estaba enfermo.", "Porque causal é escrito junto e sem acento."), M("Aunque llovía, pero salimos.", "Aunque llovía, salimos.", "Embora já marca o contraste.")],
      ["E e u dependem do som seguinte.", "Sino corrige uma negação; pero apenas contrasta."]),
    T("B1", "Perífrasis verbales",
      "O espanhol usa combinações de verbo auxiliar e forma não pessoal para indicar início, continuidade, obrigação, hábito, repetição ou término de uma ação.",
      "Ir a + infinitivo; tener que/deber + infinitivo; estar/seguir + gerúndio; acabar de + infinitivo; volver a + infinitivo; dejar de + infinitivo.",
      [C("Fase da ação", "Empezar a inicia, seguir + gerúndio continua e dejar de encerra.", "Empezó a llover y siguió lloviendo toda la tarde.", "Começou a chover e continuou chovendo toda a tarde."), C("Passado recente", "Acabar de expressa algo recém-concluído.", "Acabo de terminar el informe.", "Acabei de terminar o relatório."), C("Repetição", "Volver a + infinitivo indica fazer novamente.", "Volvió a llamar por la noche.", "Ligou novamente à noite.")],
      [M("Estoy estudiar.", "Estoy estudiando.", "Estar progressivo exige gerúndio."), M("Acabo terminar.", "Acabo de terminar.", "A perífrase exige de.")],
      ["Deber de pode indicar probabilidade; deber indica obrigação.", "Nem toda sequência de dois verbos é uma perífrase."]),
    T("B1", "Usos de se",
      "Se exerce várias funções em espanhol: reflexiva, recíproca, impessoal, passiva e substituição de le/les antes de lo/la/los/las.",
      "Reflexivo: se lava. Recíproco: se ayudan. Impessoal: se vive bien. Passiva: se venden pisos. Le/les + lo vira se lo.",
      [C("Impessoal e passiva", "A impessoal não tem sujeito específico; a passiva concorda com o objeto.", "Se vive bien aquí. Se venden casas.", "Vive-se bem aqui. Vendem-se casas."), C("Pronomes combinados", "Le/les tornam-se se diante de pronome acusativo.", "Se lo expliqué ayer.", "Expliquei isso a ele ontem."), C("Mudança lexical", "Alguns verbos pronominais mudam de sentido.", "María acordó la fecha y se acordó de la cita.", "Maria combinou a data e se lembrou do compromisso.")],
      [M("Se vende casas.", "Se venden casas.", "Na passiva com nome plural, o verbo concorda."), M("Le lo dije.", "Se lo dije.", "Le muda para se antes de lo.")],
      ["Identifique primeiro se existe sujeito gramatical.", "Verbos pronominais devem ser aprendidos com a preposição."]),
    T("B1", "Conectores discursivos",
      "Conectores organizam argumentos e tornam relações explícitas. A escolha depende da função lógica e do grau de formalidade.",
      "Adição: además, asimismo. Contraste: sin embargo, en cambio. Consequência: por lo tanto, así que. Exemplo: por ejemplo. Reformulação: es decir.",
      [C("Contraste", "Sin embargo contrapõe uma ideia anterior e costuma vir isolado.", "El plan es caro; sin embargo, es eficaz.", "O plano é caro; no entanto, é eficaz."), C("Reformulação", "Es decir esclarece a mesma ideia.", "La medida es provisional, es decir, no será permanente.", "A medida é provisória, ou seja, não será permanente."), C("Conclusão", "Por lo tanto apresenta inferência.", "No había pruebas; por lo tanto, cerraron el caso.", "Não havia provas; portanto, encerraram o caso.")],
      [M("Sin embargo de ser caro.", "A pesar de ser caro.", "Sin embargo conecta orações; a pesar de rege nome ou infinitivo."), M("Pienso de que vendrá.", "Pienso que vendrá.", "Pensar que não usa de; evite dequeísmo.")],
      ["Pontue conectores parentéticos com vírgulas.", "Não acumule vários conectores com a mesma função."]),
    T("B2", "Subjuntivo e particularidades de uso",
      "O subjuntivo espanhol apresenta fatos como desejados, avaliados, duvidosos ou ainda não realizados. Ele depende do sentido da oração principal e do referente.",
      "Desejo/ordem: querer que. Avaliação: es importante que. Dúvida: dudar que. Futuro temporal: cuando + subjuntivo. Antecedente inexistente: busco alguien que sepa.",
      [C("Desejo e avaliação", "Sujeitos diferentes exigem que + subjuntivo.", "Quiero que vengas temprano.", "Quero que você venha cedo."), C("Referente desconhecido", "O subjuntivo indica que a existência não é confirmada.", "Busco un hotel que tenga piscina.", "Procuro um hotel que tenha piscina."), C("Futuro", "Depois de cuando, use subjuntivo para evento futuro.", "Cuando llegues, llámame.", "Quando você chegar, ligue para mim.")],
      [M("Quiero que vienes.", "Quiero que vengas.", "Desejo sobre outro sujeito pede subjuntivo."), M("Cuando llegarás, avísame.", "Cuando llegues, avísame.", "Evento futuro após cuando usa presente do subjuntivo.")],
      ["O mesmo verbo pode alternar modo conforme certeza.", "O pretérito imperfeito do subjuntivo tem formas -ra e -se."]),
    T("B2", "Expresiones idiomáticas y colocaciones",
      "Expressões fixas e colocações revelam naturalidade, mas não devem ser traduzidas literalmente. Elas também variam entre regiões hispânicas.",
      "Darse cuenta de, echar de menos, tener en cuenta, llevar a cabo, tomar una decisión, estar de acuerdo. A regência faz parte da expressão.",
      [C("Percepção e saudade", "Darse cuenta de é perceber; echar de menos é sentir falta.", "Me di cuenta del error y eché de menos tu ayuda.", "Percebi o erro e senti falta da sua ajuda."), C("Planejamento", "Tener en cuenta considera; llevar a cabo executa.", "Tuvimos en cuenta los riesgos antes de llevar a cabo el plan.", "Consideramos os riscos antes de executar o plano."), C("Acordo", "Estar de acuerdo con expressa concordância.", "Estoy de acuerdo contigo.", "Concordo com você.")],
      [M("Realicé cuenta del error.", "Me di cuenta del error.", "A expressão fixa é darse cuenta de."), M("Estoy de acuerdo a ti.", "Estoy de acuerdo contigo.", "A expressão rege con.")],
      ["Confira a região antes de usar gírias.", "Aprenda a expressão com seus pronomes e preposições."]),
  ],
  fr: [
    T("A1", "Prépositions de lieu et de temps",
      "As preposições francesas variam conforme gênero, número, tipo de lugar e relação espacial. Países, cidades e meios de transporte exigem padrões específicos.",
      "À + cidade; en + país feminino ou iniciado por vogal; au + país masculino; aux + plural. Tempo: à + hora, en + mês/ano, le + dia habitual, depuis + duração em curso.",
      [C("Destinos", "Cidades usam à; países alternam en, au e aux.", "Je vais à Paris et au Canada.", "Vou a Paris e ao Canadá."), C("Localização", "Dans indica interior; sur indica superfície; chez indica casa ou estabelecimento de alguém.", "Le livre est sur la table chez Marie.", "O livro está sobre a mesa na casa de Marie."), C("Tempo", "Depuis liga uma duração ao presente.", "J'habite ici depuis deux ans.", "Moro aqui há dois anos.")],
      [M("Je vais en Canada.", "Je vais au Canada.", "País masculino usa au."), M("Je suis à la maison de Paul.", "Je suis chez Paul.", "Chez expressa casa ou estabelecimento de pessoa.")],
      ["Aprenda o gênero junto com o nome do país.", "En train, en voiture, mas à pied e à vélo."]),
    T("A2", "Conjonctions essentielles",
      "Conjunções francesas ligam ideias de adição, oposição, causa, consequência, condição, finalidade e tempo. Algumas exigem indicativo e outras subjuntivo.",
      "Et, mais, ou, donc, car; parce que + causa; puisque + causa conhecida; si + condição; quand/lorsque + tempo; pour que + subjuntivo.",
      [C("Causa", "Parce que responde pourquoi; puisque retoma causa evidente.", "Je reste parce qu'il pleut.", "Fico porque está chovendo."), C("Condição", "Si + presente combina com futuro na consequência.", "Si tu viens, nous dînerons ensemble.", "Se você vier, jantaremos juntos."), C("Finalidade", "Pour + infinitivo com mesmo sujeito; pour que + subjuntivo com sujeitos diferentes.", "Je parle lentement pour que tu comprennes.", "Falo devagar para que você entenda.")],
      [M("Si j'aurai le temps, je viendrai.", "Si j'ai le temps, je viendrai.", "Depois de si condicional não se usa futuro."), M("Parce de il pleut.", "Parce qu'il pleut.", "A conjunção correta é parce que.")],
      ["Car é mais escrito e não costuma responder diretamente pourquoi.", "Embora quoique seja possível, bien que é mais frequente."]),
    T("A2", "Articles partitifs et quantité",
      "O francês usa artigos partitivos para quantidades não contáveis ou não especificadas. Depois de negação e expressões de quantidade, a forma geralmente muda para de.",
      "Du, de la, de l', des para quantidade indefinida. Depois de ne...pas: de/d'. Quantidade: beaucoup de, un peu de. Verbo aimer prefere artigo definido.",
      [C("Alimentos e matérias", "Use partitivo quando a quantidade não é contada.", "Je bois du café et je mange de la soupe.", "Bebo café e tomo sopa."), C("Negação", "O partitivo vira de na negação.", "Je ne bois pas de café.", "Não bebo café."), C("Preferência", "Aimer usa le/la/les para categoria geral.", "J'aime le fromage.", "Gosto de queijo.")],
      [M("Je veux de le pain.", "Je veux du pain.", "De + le contrai para du."), M("Je ne mange pas du sucre.", "Je ne mange pas de sucre.", "Na negação, use de.")],
      ["Com être, o artigo costuma permanecer após negação.", "Des pode ser partitivo plural ou artigo indefinido plural."]),
    T("B1", "Pronoms y et en",
      "Y e en substituem complementos e evitam repetições. A escolha depende da preposição e do tipo de referente, não apenas da tradução.",
      "Y substitui lugar ou à + coisa. En substitui de + coisa, origem ou quantidade. Ficam antes do verbo conjugado; no imperativo afirmativo, depois.",
      [C("Y", "Substitui destino/local ou complemento com à.", "Tu vas à Lyon ? Oui, j'y vais.", "Você vai a Lyon? Sim, vou."), C("En", "Substitui complemento com de ou quantidade.", "Tu veux du pain ? Oui, j'en veux deux morceaux.", "Quer pão? Sim, quero dois pedaços."), C("Imperativo", "No afirmativo, use vas-y e prends-en.", "Vas-y et prends-en un.", "Vá e pegue um.")],
      [M("Je vais à Paris, j'en vais.", "Je vais à Paris, j'y vais.", "Destino usa y."), M("J'ai trois livres. J'en ai.", "J'en ai trois.", "A quantidade permanece depois do verbo.")],
      ["Y e en normalmente não substituem pessoas.", "A ordem com outros pronomes deve ser memorizada."]),
    T("B1", "Connecteurs logiques",
      "Conectores franceses estruturam explicações e argumentos. Eles sinalizam progressão, oposição, causa, consequência, exemplo, reformulação e conclusão.",
      "D'abord/ensuite/enfin; de plus; cependant/en revanche; en effet; par conséquent; par exemple; autrement dit; en conclusion.",
      [C("Oposição", "Cependant contrapõe; en revanche introduz compensação ou contraste.", "Le trajet est long ; cependant, il est agréable.", "O trajeto é longo; contudo, é agradável."), C("Explicação", "En effet confirma ou explica a afirmação anterior.", "Il faut partir tôt. En effet, la route est chargée.", "É preciso sair cedo. De fato, a estrada está cheia."), C("Consequência", "Par conséquent apresenta resultado lógico.", "Les coûts ont augmenté ; par conséquent, le projet a changé.", "Os custos aumentaram; consequentemente, o projeto mudou.")],
      [M("Malgré il pleut.", "Bien qu'il pleuve.", "Malgré rege nome; bien que introduz oração."), M("Cependant de ce problème.", "Malgré ce problème.", "Cependant é conector, não preposição.")],
      ["Use pontuação para separar conectores parentéticos.", "À l'oral, du coup é comum, mas menos formal."]),
    T("B1", "Locutions verbales et expressions courantes",
      "O francês cotidiano utiliza locuções que funcionam como uma unidade. Traduzir cada palavra separadamente produz construções artificiais.",
      "Avoir besoin de, avoir envie de, faire attention à, se rendre compte de, être en train de, venir de + infinitif.",
      [C("Necessidade e vontade", "Avoir besoin de e avoir envie de são seguidos de nome ou infinitivo.", "J'ai besoin de partir, mais j'ai envie de rester.", "Preciso ir embora, mas quero ficar."), C("Ação em curso e recente", "Être en train de enfatiza processo; venir de marca passado recente.", "Je viens de finir ce que j'étais en train de lire.", "Acabei de terminar o que estava lendo."), C("Percepção", "Se rendre compte de significa perceber.", "Elle s'est rendu compte de son erreur.", "Ela percebeu seu erro.")],
      [M("Je suis besoin d'aide.", "J'ai besoin d'aide.", "A locução usa avoir."), M("Je réalise mon erreur.", "Je me rends compte de mon erreur.", "Para perceber, a expressão idiomática comum é se rendre compte de.")],
      ["Rendu permanece invariável nessa construção tradicional.", "Aprenda a preposição como parte da locução."]),
    T("B2", "Subjonctif et particularités",
      "O subjuntivo francês aparece após vontade, necessidade, emoção, dúvida, finalidade e várias conjunções. A alternância com indicativo depende de certeza e afirmação.",
      "Il faut que, vouloir que, bien que, pour que, avant que + subjonctif. Je pense que + indicatif; je ne pense pas que + subjonctif frequente.",
      [C("Necessidade", "Il faut que exige subjuntivo.", "Il faut que vous soyez prêts.", "É preciso que vocês estejam prontos."), C("Concessão", "Bien que apresenta fato reconhecido com subjuntivo.", "Bien qu'il soit tard, nous continuons.", "Embora seja tarde, continuamos."), C("Certeza e dúvida", "A negação de opinião frequentemente abre espaço para subjuntivo.", "Je ne crois pas qu'il ait raison.", "Não acredito que ele tenha razão.")],
      [M("Il faut que tu es prêt.", "Il faut que tu sois prêt.", "Il faut que seleciona subjuntivo."), M("Après qu'il soit parti.", "Après qu'il est parti.", "Na norma-padrão, après que usa indicativo.")],
      ["Ne explétif pode aparecer após avant que sem negar.", "O subjuntivo imperfeito é literário; na fala usa-se o presente."]),
    T("B2", "Registre, liaison et expressions idiomatiques",
      "O francês muda bastante entre registro formal, neutro e familiar. Liaison, redução oral e expressões idiomáticas afetam compreensão e adequação social.",
      "Formal: nous, ne...pas, cela. Informal: on, queda de ne, ça. Liaison obrigatória em les amis; proibida após et; opcional em muitos contextos.",
      [C("Registro", "On substitui nous na fala sem mudar necessariamente o sentido.", "On se retrouve vers huit heures ?", "A gente se encontra por volta das oito?"), C("Idioms", "Avoir le cafard, coûter les yeux de la tête e poser un lapin são figurativos.", "Ce billet coûte les yeux de la tête.", "Esse bilhete custa os olhos da cara."), C("Liaison", "Faça liaison em grupos fixos e evite após et.", "Les enfants ont un ami.", "As crianças têm um amigo.")],
      [M("Nous on allons partir.", "On va partir.", "Com on, o verbo fica na terceira pessoa singular."), M("Je suis chaud.", "J'ai chaud.", "Sensação de calor usa avoir chaud.")],
      ["Evite gíria regional sem conhecer o contexto.", "A queda de ne é comum na fala, mas não na escrita formal."]),
  ],
  it: [
    T("A1", "Preposizioni semplici e articolate",
      "As preposições italianas combinam-se frequentemente com artigos. A escolha depende de lugar, origem, companhia, assunto, meio e finalidade.",
      "Di, a, da, in, con, su, per, tra/fra. Com artigo: del, al, dal, nel, sul etc. Cidades usam a; muitos países usam in; pessoas e profissionais usam da.",
      [C("Destino e localização", "Use a com cidades e in com países ou certos lugares.", "Vado a Roma e vivo in Italia.", "Vou a Roma e moro na Itália."), C("Da", "Da marca origem e também casa/consultório de alguém.", "Vengo dal Brasile e vado dal medico.", "Venho do Brasil e vou ao médico."), C("Preposição articulada", "Preposição e artigo concordam com o nome.", "Il libro è sul tavolo.", "O livro está sobre a mesa.")],
      [M("Vado in Roma.", "Vado a Roma.", "Cidades normalmente usam a."), M("Sono a Italia.", "Sono in Italia.", "Países normalmente usam in.")],
      ["Aprenda exceções como a casa e in ufficio.", "Con il pode permanecer separado; col também existe."]),
    T("A2", "Congiunzioni essenziali",
      "Conjunções italianas conectam ideias de adição, alternativa, oposição, causa, consequência, condição, tempo e finalidade.",
      "E, o/oppure, ma/però; perché para causa ou finalidade; quindi/perciò para consequência; se para condição; quando/mentre para tempo.",
      [C("Causa e consequência", "Perché explica; quindi apresenta resultado.", "Sono stanco perché ho lavorato, quindi riposo.", "Estou cansado porque trabalhei, então descanso."), C("Contraste", "Ma conecta diretamente; però pode mover-se na oração.", "È difficile, però è utile.", "É difícil, porém é útil."), C("Condição", "Se + presente pode ter presente ou futuro na consequência.", "Se ho tempo, ti chiamerò.", "Se eu tiver tempo, ligarei para você.")],
      [M("Perché ero stanco, quindi sono uscito.", "Poiché ero stanco, sono rimasto a casa.", "Evite duplicar causa e consequência e preserve a lógica."), M("Anche se ma piove.", "Anche se piove, usciamo.", "Anche se já marca concessão.")],
      ["Perché também significa para que com subjuntivo em registro cuidado.", "Oppure é alternativa mais explícita que o."]),
    T("A2", "Essere, avere e particularidades",
      "Italiano usa essere ou avere em expressões que nem sempre coincidem com o português. A escolha também determina o auxiliar dos tempos compostos.",
      "Avere fame/sete/caldo/freddo/paura e idade. Essere stanco/felice. Passato prossimo: muitos intransitivos de movimento usam essere e concordam.",
      [C("Sensações", "Fome, sede, calor e frio usam avere.", "Ho fame e ho freddo.", "Estou com fome e com frio."), C("Idade", "Idade é expressa com avere.", "Mia sorella ha vent'anni.", "Minha irmã tem vinte anos."), C("Auxiliar", "Com essere, o particípio concorda com sujeito.", "Maria è arrivata ieri.", "Maria chegou ontem.")],
      [M("Sono 30 anni.", "Ho 30 anni.", "Idade usa avere."), M("Ho arrivato tardi.", "Sono arrivato tardi.", "Arrivare forma passato prossimo com essere.")],
      ["Verbos reflexivos sempre usam essere nos tempos compostos.", "Alguns verbos mudam auxiliar conforme uso transitivo."]),
    T("B1", "Ci e ne",
      "Ci e ne substituem complementos e aparecem em muitos verbos pronominais. A interpretação depende da regência e do contexto.",
      "Ci: lugar, a/su + coisa, companhia em algumas expressões. Ne: di + coisa, origem e quantidade. Antes do verbo; ligados ao infinitivo e imperativo.",
      [C("Ci", "Substitui lugar ou complemento com a.", "Vai a Milano? Sì, ci vado domani.", "Vai a Milão? Sim, vou amanhã."), C("Ne", "Substitui di ou quantidade.", "Quanti libri hai? Ne ho tre.", "Quantos livros você tem? Tenho três."), C("Verbos pronominais", "Farcela, andarsene e pensarci têm sentido próprio.", "Non ce la faccio; me ne vado.", "Não consigo; vou embora.")],
      [M("Vado a Roma e ne resto.", "Vado a Roma e ci resto.", "Lugar usa ci."), M("Ho tre libri. Ne ho.", "Ne ho tre.", "A quantidade permanece expressa.")],
      ["Ci e ne normalmente não substituem pessoas.", "Ce la e me ne mostram alteração dos pronomes combinados."]),
    T("B1", "Connettivi per argomentare",
      "Conectores italianos tornam explícita a estrutura de um argumento. Eles ajudam a ordenar, contrastar, explicar, exemplificar, concluir e reformular.",
      "Innanzitutto, inoltre, tuttavia, invece, infatti, di conseguenza, per esempio, in altre parole, infine.",
      [C("Contraste", "Tuttavia introduz ressalva; invece opõe dois elementos.", "Il progetto è costoso; tuttavia, è efficace.", "O projeto é caro; contudo, é eficaz."), C("Explicação", "Infatti confirma ou explica o que veio antes.", "Dobbiamo partire presto; infatti, ci sarà traffico.", "Precisamos sair cedo; de fato, haverá trânsito."), C("Consequência", "Di conseguenza mostra resultado.", "I costi sono aumentati; di conseguenza, il piano è cambiato.", "Os custos aumentaram; consequentemente, o plano mudou.")],
      [M("Nonostante è caro.", "Nonostante sia caro.", "Nonostante + oração pede congiuntivo."), M("Tuttavia di questo problema.", "Nonostante questo problema.", "Tuttavia não funciona como preposição.")],
      ["Comunque é versátil, mas pode soar vago se repetido.", "Use pontuação ao deslocar conectores."]),
    T("B1", "Verbi pronominali ed espressioni comuni",
      "Verbos pronominais combinam verbo e partículas e adquirem significado idiomático. São o equivalente funcional mais próximo de muitos phrasal verbs.",
      "Farcela = conseguir; cavarsela = se virar; andarsene = ir embora; metterci = levar tempo; volerci = ser necessário; prendersela = ficar ofendido.",
      [C("Capacidade", "Farcela e cavarsela avaliam capacidade ou desempenho.", "È difficile, ma ce la faccio.", "É difícil, mas eu consigo."), C("Tempo necessário", "Metterci tem sujeito pessoal; volerci concorda com o que é necessário.", "Ci metto un'ora, ma ci vogliono due giorni per finire.", "Levo uma hora, mas são necessários dois dias para terminar."), C("Reação", "Prendersela con alguém significa descontar ou ficar bravo.", "Non prendertela con me.", "Não fique bravo comigo.")],
      [M("Io faccio la.", "Io ce la faccio.", "Farcela exige as partículas ce e la."), M("Ci vuole due ore.", "Ci vogliono due ore.", "Volerci concorda com o elemento plural.")],
      ["Conjugue o verbo e preserve as partículas.", "No infinitivo, os pronomes ficam ligados: farcela."]),
    T("B2", "Congiuntivo e periodo ipotetico",
      "O congiuntivo italiano marca opinião subjetiva, dúvida, desejo, emoção e concessão. No período hipotético, tempos verbais distinguem possibilidade e irrealidade.",
      "Penso che sia; dubito che venga; benché abbia. Hipótese real: se + indicativo. Possível: se + congiuntivo imperfetto, condizionale. Irreal passada: se + trapassato, condizionale passato.",
      [C("Opinião e dúvida", "Expressões não factuais selecionam congiuntivo.", "Penso che sia una buona idea.", "Acho que seja uma boa ideia."), C("Hipótese possível", "Use imperfeito do subjuntivo e condicional.", "Se avessi tempo, viaggerei di più.", "Se tivesse tempo, viajaria mais."), C("Irreal passada", "Use trapassato congiuntivo e condizionale passato.", "Se avessi studiato, avrei superato l'esame.", "Se tivesse estudado, teria passado na prova.")],
      [M("Penso che è giusto.", "Penso che sia giusto.", "Na norma cuidada, opinião subjetiva pede congiuntivo."), M("Se avrei tempo, viaggerei.", "Se avessi tempo, viaggerei.", "A oração com se não usa condicional.")],
      ["Na fala informal, o indicativo cresce, mas o congiuntivo segue importante.", "Depois de secondo me, o indicativo é comum."]),
    T("B2", "Espressioni idiomatiche e collocazioni",
      "Expressões idiomáticas e colocações tornam o italiano natural, mas carregam registro e contexto cultural. A tradução literal costuma falhar.",
      "Prendere una decisione, fare attenzione, tenere conto di, rendersi conto di, dare una mano; idioms: essere al verde, in bocca al lupo, non vedere l'ora.",
      [C("Colocações", "Verbo e substantivo formam combinações convencionais.", "Dobbiamo prendere una decisione tenendo conto dei rischi.", "Precisamos tomar uma decisão considerando os riscos."), C("Ajuda e percepção", "Dare una mano é ajudar; rendersi conto é perceber.", "Mi ha dato una mano e mi sono reso conto dell'errore.", "Ele me ajudou e percebi o erro."), C("Idioms", "Non vedere l'ora expressa expectativa; essere al verde significa sem dinheiro.", "Non vedo l'ora di partire, ma sono al verde.", "Mal posso esperar para viajar, mas estou sem dinheiro.")],
      [M("Fare una decisione.", "Prendere una decisione.", "Decisione forma colocação com prendere."), M("Non vedo l'ora per partire.", "Non vedo l'ora di partire.", "A expressão rege di + infinitivo.")],
      ["In bocca al lupo recebe tradicionalmente crepi il lupo.", "Evite expressões muito regionais em contexto formal."]),
  ],
};

const localizedQuestion = {
  en: "Choose the correct sentence.",
  es: "Elige la frase correcta.",
  fr: "Choisissez la phrase correcte.",
  it: "Scegli la frase corretta.",
};
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const topicRows = [];
const exerciseRows = [];

for (const [language, topics] of Object.entries(catalog)) {
  topics.forEach((topic, index) => {
    const number = index + 1;
    const topicId = `${language}-grammar-extra-${String(number).padStart(2, "0")}`;
    const overview = `${topic.concept}\n\nO módulo compara os contextos mais frequentes, a estrutura exigida e as diferenças que costumam causar interferência para falantes de português.`;
    topicRows.push([
      topicId, language, topic.level, topic.title, overview, topic.formation,
      JSON.stringify(topic.cases), JSON.stringify(topic.mistakes),
      JSON.stringify(topic.notes), 100 + number,
    ]);
    topic.mistakes.forEach((mistake, mistakeIndex) => {
      const other = topic.mistakes[(mistakeIndex + 1) % topic.mistakes.length].incorrect;
      exerciseRows.push([
        `${topicId}-ex-${mistakeIndex + 1}`, topicId, language, topic.level,
        `${topic.title} · exercício ${mistakeIndex + 1}`,
        mistake.explanation_pt_br, mistake.correct, localizedQuestion[language],
        JSON.stringify([mistake.incorrect, mistake.correct, other]), 1,
        1000 + number * 10 + mistakeIndex,
      ]);
    });
  });
}

const topicsSql = topicRows.map((row) =>
  `  (${row.slice(0, 6).map(quote).join(", ")}, ${quote(row[6])}::jsonb, ` +
  `${quote(row[7])}::jsonb, ${quote(row[8])}::jsonb, ${row[9]})`
).join(",\n");
const exercisesSql = exerciseRows.map((row) =>
  `  (${row.slice(0, 8).map(quote).join(", ")}, ${quote(row[8])}::jsonb, ` +
  `${row[9]}, ${row[10]}, true)`
).join(",\n");

const output = new URL(
  "../supabase/migrations/20260801121000_expand_grammar_curriculum.sql",
  import.meta.url,
);
writeFileSync(output,
  `-- Gerado por scripts/generate-extended-grammar.mjs.\n\n` +
  `insert into public.grammar_topics (\n` +
  `  id, language, level, title, overview_pt_br, formation_pt_br,\n` +
  `  use_cases, common_mistakes, notes_pt_br, sort_order\n` +
  `) values\n${topicsSql};\n\n` +
  `insert into public.grammar_exercises (\n` +
  `  id, topic_id, language, level, title, explanation, example,\n` +
  `  question, options, answer_index, sort_order, is_published\n` +
  `) values\n${exercisesSql};\n`
);
console.log(`${topicRows.length} temas e ${exerciseRows.length} exercícios gerados.`);
