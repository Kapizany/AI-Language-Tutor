export type LearningLanguage = "en" | "es" | "fr" | "it";
export type LearningLevel = "A1" | "A2" | "B1" | "B2";

export type ReadingActivity = {
  id: string;
  language: LearningLanguage;
  level: LearningLevel;
  title: string;
  text: string;
  question: string;
  options: string[];
  answer: number;
};

export type GrammarActivity = {
  id: string;
  language: LearningLanguage;
  level: LearningLevel;
  title: string;
  explanation: string;
  example: string;
  question: string;
  options: string[];
  answer: number;
};

export type Flashcard = {
  front: string;
  back: string;
};

type LanguageContent = {
  readings: Array<Omit<ReadingActivity, "id" | "language" | "level">>;
  grammar: Array<Omit<GrammarActivity, "id" | "language" | "level">>;
  flashcards: Flashcard[];
};

const levels: LearningLevel[] = ["A1", "A2", "B1", "B2"];

const content: Record<LearningLanguage, LanguageContent> = {
  en: {
    readings: [
      { title: "My morning", text: "I wake up at seven. I drink coffee and eat bread. Then I walk to work.", question: "How does the person go to work?", options: ["By bus", "On foot", "By car"], answer: 1 },
      { title: "A weekend plan", text: "Laura is visiting her sister on Saturday. They want to cook lunch and watch a film if it rains.", question: "What will they do if it rains?", options: ["Watch a film", "Go swimming", "Visit a museum"], answer: 0 },
      { title: "Working from home", text: "Remote work saves commuting time, but it also requires clear routines. Daniel starts each day by listing three priorities and turns off notifications while he focuses.", question: "How does Daniel protect his focus?", options: ["He works at night", "He turns off notifications", "He skips planning"], answer: 1 },
      { title: "Cities for people", text: "When cities replace parking spaces with trees and cycle lanes, local shops sometimes fear losing customers. Evidence from several districts, however, suggests that pleasant streets can increase foot traffic and longer visits.", question: "What does the evidence suggest?", options: ["Parking always increases sales", "Pleasant streets may attract more visitors", "Cycle lanes close local shops"], answer: 1 },
    ],
    grammar: [
      { title: "Verb to be", explanation: "Use am with I, is with he/she/it, and are with you/we/they.", example: "She is Brazilian. They are students.", question: "Choose the correct sentence.", options: ["I is ready.", "I am ready.", "I are ready."], answer: 1 },
      { title: "Simple present", explanation: "Use the base verb for routines; add -s with he, she or it.", example: "I work. She works.", question: "Tom ___ English every day.", options: ["study", "studies", "studying"], answer: 1 },
      { title: "Present perfect", explanation: "Use have/has + past participle for experiences or past actions connected to now.", example: "I have visited London twice.", question: "She ___ the report already.", options: ["has finished", "finished has", "have finish"], answer: 0 },
      { title: "Conditionals", explanation: "Use if + past simple, would + verb for hypothetical situations.", example: "If I had time, I would travel more.", question: "If he knew, he ___ us.", options: ["would tell", "will told", "tells"], answer: 0 },
    ],
    flashcards: [{ front: "How are you?", back: "Como você está?" }, { front: "Could you help me?", back: "Você poderia me ajudar?" }, { front: "I would like…", back: "Eu gostaria de…" }, { front: "It depends", back: "Depende" }, { front: "That makes sense", back: "Isso faz sentido" }],
  },
  es: {
    readings: [
      { title: "Mi mañana", text: "Me despierto a las siete. Bebo café y como pan. Después camino al trabajo.", question: "¿Cómo va la persona al trabajo?", options: ["En autobús", "A pie", "En coche"], answer: 1 },
      { title: "Un plan de fin de semana", text: "Laura visita a su hermana el sábado. Quieren cocinar y ver una película si llueve.", question: "¿Qué harán si llueve?", options: ["Ver una película", "Nadar", "Ir al museo"], answer: 0 },
      { title: "Trabajar desde casa", text: "El trabajo remoto ahorra tiempo, pero exige rutinas claras. Daniel escribe tres prioridades y apaga las notificaciones para concentrarse.", question: "¿Cómo protege Daniel su concentración?", options: ["Trabaja de noche", "Apaga las notificaciones", "No hace planes"], answer: 1 },
      { title: "Ciudades para las personas", text: "Al sustituir aparcamientos por árboles y ciclovías, algunos comercios temen perder clientes. Sin embargo, calles agradables pueden aumentar las visitas y el tiempo que la gente permanece allí.", question: "¿Qué pueden producir las calles agradables?", options: ["Más visitantes", "Menos peatones", "El cierre de tiendas"], answer: 0 },
    ],
    grammar: [
      { title: "Ser y estar", explanation: "Ser expresa identidad o características; estar expresa estado o ubicación.", example: "Soy brasileño. Estoy cansado.", question: "Madrid ___ en España.", options: ["es", "está", "soy"], answer: 1 },
      { title: "Presente regular", explanation: "Los verbos regulares cambian su terminación según la persona.", example: "Yo hablo. Ella aprende.", question: "Nosotros ___ español.", options: ["estudiamos", "estudian", "estudia"], answer: 0 },
      { title: "Pretérito perfecto", explanation: "Usa haber en presente + participio para hechos recientes o conectados con el presente.", example: "He terminado el libro.", question: "Ellos ___ llegado.", options: ["han", "has", "hemos"], answer: 0 },
      { title: "Subjuntivo", explanation: "Se usa para deseos, dudas y recomendaciones.", example: "Espero que tengas un buen día.", question: "Quiero que tú ___ aquí.", options: ["vienes", "vengas", "vendrás"], answer: 1 },
    ],
    flashcards: [{ front: "¿Cómo estás?", back: "Como você está?" }, { front: "¿Me puedes ayudar?", back: "Você pode me ajudar?" }, { front: "Me gustaría…", back: "Eu gostaria de…" }, { front: "Depende", back: "Depende" }, { front: "Tiene sentido", back: "Faz sentido" }],
  },
  fr: {
    readings: [
      { title: "Mon matin", text: "Je me réveille à sept heures. Je bois du café et je mange du pain. Ensuite, je vais au travail à pied.", question: "Comment va-t-on au travail ?", options: ["En bus", "À pied", "En voiture"], answer: 1 },
      { title: "Un projet pour samedi", text: "Laura rend visite à sa sœur samedi. Elles veulent cuisiner et regarder un film s'il pleut.", question: "Que feront-elles s'il pleut ?", options: ["Regarder un film", "Nager", "Visiter un musée"], answer: 0 },
      { title: "Travailler chez soi", text: "Le télétravail fait gagner du temps, mais exige des habitudes claires. Daniel note trois priorités et désactive les notifications pour se concentrer.", question: "Comment Daniel protège-t-il son attention ?", options: ["Il travaille la nuit", "Il désactive les notifications", "Il ne planifie rien"], answer: 1 },
      { title: "Des villes humaines", text: "Quand une ville remplace des parkings par des arbres et des pistes cyclables, certains magasins craignent de perdre des clients. Pourtant, des rues agréables peuvent attirer davantage de visiteurs.", question: "Quel peut être l'effet des rues agréables ?", options: ["Attirer plus de visiteurs", "Supprimer les piétons", "Fermer les magasins"], answer: 0 },
    ],
    grammar: [
      { title: "Être et avoir", explanation: "Être décrit l'identité ou l'état; avoir exprime la possession et sert dans plusieurs expressions.", example: "Je suis prêt. J'ai vingt ans.", question: "Nous ___ contents.", options: ["sommes", "avons", "êtes"], answer: 0 },
      { title: "Le présent", explanation: "La terminaison du verbe change selon le sujet.", example: "Je parle. Nous parlons.", question: "Elle ___ français.", options: ["parles", "parle", "parlons"], answer: 1 },
      { title: "Le passé composé", explanation: "Utilisez avoir ou être au présent avec le participe passé.", example: "J'ai terminé. Elle est arrivée.", question: "Ils ___ mangé.", options: ["ont", "sont", "avez"], answer: 0 },
      { title: "Le conditionnel", explanation: "Le conditionnel exprime une hypothèse, un souhait ou une demande polie.", example: "Je voudrais voyager.", question: "Nous ___ partir plus tôt.", options: ["pourrions", "pouvons hier", "pourront si"], answer: 0 },
    ],
    flashcards: [{ front: "Comment allez-vous ?", back: "Como você está?" }, { front: "Pouvez-vous m'aider ?", back: "Você pode me ajudar?" }, { front: "Je voudrais…", back: "Eu gostaria de…" }, { front: "Ça dépend", back: "Depende" }, { front: "C'est logique", back: "Faz sentido" }],
  },
  it: {
    readings: [
      { title: "La mia mattina", text: "Mi sveglio alle sette. Bevo il caffè e mangio il pane. Poi vado al lavoro a piedi.", question: "Come va al lavoro la persona?", options: ["In autobus", "A piedi", "In macchina"], answer: 1 },
      { title: "Un piano per sabato", text: "Laura visita sua sorella sabato. Vogliono cucinare e guardare un film se piove.", question: "Cosa faranno se piove?", options: ["Guarderanno un film", "Nuoteranno", "Visiteranno un museo"], answer: 0 },
      { title: "Lavorare da casa", text: "Il lavoro da remoto fa risparmiare tempo, ma richiede abitudini chiare. Daniel scrive tre priorità e disattiva le notifiche per concentrarsi.", question: "Come protegge la concentrazione?", options: ["Lavora di notte", "Disattiva le notifiche", "Non pianifica"], answer: 1 },
      { title: "Città per le persone", text: "Quando le città sostituiscono i parcheggi con alberi e piste ciclabili, alcuni negozi temono di perdere clienti. Le strade piacevoli, però, possono aumentare le visite.", question: "Cosa possono fare le strade piacevoli?", options: ["Aumentare le visite", "Eliminare i pedoni", "Chiudere i negozi"], answer: 0 },
    ],
    grammar: [
      { title: "Essere e avere", explanation: "Essere descrive identità o stato; avere indica possesso ed età.", example: "Sono brasiliano. Ho trent'anni.", question: "Loro ___ studenti.", options: ["sono", "hanno", "siamo"], answer: 0 },
      { title: "Il presente", explanation: "La desinenza del verbo cambia secondo la persona.", example: "Io parlo. Noi parliamo.", question: "Lei ___ italiano.", options: ["studio", "studia", "studiamo"], answer: 1 },
      { title: "Il passato prossimo", explanation: "Usa avere o essere al presente con il participio passato.", example: "Ho mangiato. Sono arrivata.", question: "Noi ___ finito.", options: ["abbiamo", "siamo", "avete"], answer: 0 },
      { title: "Il condizionale", explanation: "Esprime desideri, ipotesi e richieste cortesi.", example: "Vorrei un caffè.", question: "Io ___ viaggiare di più.", options: ["vorrei", "voglio ieri", "vorrà"], answer: 0 },
    ],
    flashcards: [{ front: "Come stai?", back: "Como você está?" }, { front: "Puoi aiutarmi?", back: "Você pode me ajudar?" }, { front: "Vorrei…", back: "Eu gostaria de…" }, { front: "Dipende", back: "Depende" }, { front: "Ha senso", back: "Faz sentido" }],
  },
};

export function getLearningContent(language: LearningLanguage) {
  const selected = content[language];
  return {
    readings: selected.readings.map((activity, index) => ({
      ...activity,
      id: `${language}-reading-${levels[index]}`,
      language,
      level: levels[index],
    })),
    grammar: selected.grammar.map((activity, index) => ({
      ...activity,
      id: `${language}-grammar-${levels[index]}`,
      language,
      level: levels[index],
    })),
    flashcards: selected.flashcards,
  };
}
