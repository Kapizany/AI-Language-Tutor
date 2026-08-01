import { writeFileSync } from "node:fs";

const output = new URL(
  "../supabase/migrations/20260801120000_expand_quick_lessons.sql",
  import.meta.url,
);

const locales = {
  en: {
    contexts: ["this morning", "yesterday", "last weekend", "during a busy afternoon"],
    topics: [
      ["Organizing the day", "organize the day", "too many tasks", "write a short priority list", "finish the important work"],
      ["Finding an address", "meet a friend downtown", "take a wrong street", "ask a local for directions", "arrive at the right place"],
      ["Preparing a meal", "cook dinner for friends", "forget one ingredient", "use a similar ingredient", "serve dinner on time"],
      ["Solving a delay", "get to an appointment", "face a transport delay", "send a message and choose another route", "avoid a misunderstanding"],
      ["Learning a skill", "learn a new digital skill", "find the first lesson difficult", "practice in short daily sessions", "complete a small project"],
      ["Helping a neighbor", "help a new neighbor", "notice a communication problem", "speak slowly and show an example", "solve the problem together"],
      ["Planning a trip", "plan a short trip", "discover that the first option is expensive", "compare dates and alternatives", "stay within the budget"],
      ["Improving health", "build a healthier routine", "feel tired after work", "start with a short walk", "exercise consistently"],
      ["Working in a team", "prepare a team presentation", "receive different suggestions", "listen and divide the responsibilities", "deliver a clear presentation"],
      ["Making a decision", "choose an evening course", "have several similar options", "compare schedule, price, and practice", "select the most useful course"],
    ],
    question: (name) => `What helped ${name} reach the goal?`,
    distractors: ["Ignoring the situation", "Waiting without a plan"],
    bodies: {
      A1: (n, t, c) => `${n} wants to ${t[1]} ${c}. There is a problem: ${t[2]}. ${n} decides to ${t[3]} and can ${t[4]}.`,
      A2: (n, t, c) => `${n} planned to ${t[1]} ${c}, but encountered a problem: ${t[2]}. Instead of giving up, ${n} decided to ${t[3]}. This helped ${n} ${t[4]}.`,
      B1: (n, t, c) => `While trying to ${t[1]} ${c}, ${n} had to deal with an unexpected difficulty: ${t[2]}. After considering the options, ${n} chose to ${t[3]}, which made it possible to ${t[4]}.`,
      B2: (n, t, c) => `${n}'s attempt to ${t[1]} ${c} became more complicated because of an unexpected obstacle: ${t[2]}. Rather than reacting impulsively, ${n} assessed the available alternatives and decided to ${t[3]}. The strategy not only helped ${n} ${t[4]}, but also demonstrated the value of adapting a plan without losing sight of its purpose.`,
    },
  },
  es: {
    contexts: ["esta mañana", "ayer", "el fin de semana pasado", "durante una tarde ocupada"],
    topics: [
      ["Organizar el día", "organizar el día", "tener demasiadas tareas", "escribir una lista breve de prioridades", "terminar el trabajo importante"],
      ["Encontrar una dirección", "encontrarse con un amigo en el centro", "tomar una calle equivocada", "pedir indicaciones a una persona", "llegar al lugar correcto"],
      ["Preparar una comida", "preparar una cena para sus amigos", "olvidar un ingrediente", "usar un ingrediente parecido", "servir la cena a tiempo"],
      ["Resolver un retraso", "llegar a una cita", "tener un retraso en el transporte", "enviar un mensaje y elegir otra ruta", "evitar un malentendido"],
      ["Aprender una habilidad", "aprender una nueva habilidad digital", "encontrar difícil la primera lección", "practicar en sesiones cortas cada día", "completar un pequeño proyecto"],
      ["Ayudar a un vecino", "ayudar a un vecino nuevo", "notar un problema de comunicación", "hablar despacio y mostrar un ejemplo", "resolver el problema juntos"],
      ["Planear un viaje", "planear un viaje corto", "descubrir que la primera opción es cara", "comparar fechas y alternativas", "respetar el presupuesto"],
      ["Mejorar la salud", "crear una rutina más saludable", "sentirse cansado después del trabajo", "empezar con un paseo corto", "hacer ejercicio con constancia"],
      ["Trabajar en equipo", "preparar una presentación en equipo", "recibir sugerencias diferentes", "escuchar y dividir las responsabilidades", "hacer una presentación clara"],
      ["Tomar una decisión", "elegir un curso nocturno", "tener varias opciones parecidas", "comparar horario, precio y práctica", "elegir el curso más útil"],
    ],
    question: (name) => `¿Qué ayudó a ${name} a alcanzar su objetivo?`,
    distractors: ["Ignorar la situación", "Esperar sin un plan"],
    bodies: {
      A1: (n, t, c) => `${n} quiere ${t[1]} ${c}. Hay un problema: ${t[2]}. ${n} decide ${t[3]} y puede ${t[4]}.`,
      A2: (n, t, c) => `${n} pensaba ${t[1]} ${c}, pero surgió un problema: ${t[2]}. En vez de rendirse, decidió ${t[3]}. Esto le ayudó a ${t[4]}.`,
      B1: (n, t, c) => `Mientras intentaba ${t[1]} ${c}, ${n} tuvo que afrontar una dificultad inesperada: ${t[2]}. Después de considerar las opciones, decidió ${t[3]}, lo que le permitió ${t[4]}.`,
      B2: (n, t, c) => `El intento de ${n} de ${t[1]} ${c} se complicó por un obstáculo inesperado: ${t[2]}. En lugar de reaccionar impulsivamente, evaluó las alternativas y decidió ${t[3]}. La estrategia no solo le permitió ${t[4]}, sino que demostró el valor de adaptar un plan sin perder de vista su propósito.`,
    },
  },
  fr: {
    contexts: ["ce matin", "hier", "le week-end dernier", "pendant un après-midi chargé"],
    topics: [
      ["Organiser la journée", "organiser sa journée", "avoir trop de tâches", "écrire une courte liste de priorités", "terminer le travail important"],
      ["Trouver une adresse", "retrouver un ami en ville", "prendre la mauvaise rue", "demander son chemin à quelqu'un", "arriver au bon endroit"],
      ["Préparer un repas", "préparer un dîner pour ses amis", "oublier un ingrédient", "utiliser un ingrédient similaire", "servir le dîner à l'heure"],
      ["Gérer un retard", "arriver à un rendez-vous", "subir un retard de transport", "envoyer un message et choisir un autre trajet", "éviter un malentendu"],
      ["Apprendre une compétence", "apprendre une compétence numérique", "trouver la première leçon difficile", "pratiquer chaque jour pendant peu de temps", "terminer un petit projet"],
      ["Aider un voisin", "aider un nouveau voisin", "remarquer un problème de communication", "parler lentement et montrer un exemple", "résoudre le problème ensemble"],
      ["Planifier un voyage", "planifier un court voyage", "découvrir que la première option est chère", "comparer les dates et les possibilités", "respecter son budget"],
      ["Améliorer sa santé", "adopter une routine plus saine", "se sentir fatigué après le travail", "commencer par une courte promenade", "faire régulièrement de l'exercice"],
      ["Travailler en équipe", "préparer une présentation en équipe", "recevoir des suggestions différentes", "écouter et partager les responsabilités", "faire une présentation claire"],
      ["Prendre une décision", "choisir un cours du soir", "avoir plusieurs options similaires", "comparer les horaires, le prix et la pratique", "choisir le cours le plus utile"],
    ],
    question: (name) => `Qu'est-ce qui a aidé ${name} à atteindre son objectif ?`,
    distractors: ["Ignorer la situation", "Attendre sans avoir de plan"],
    bodies: {
      A1: (n, t, c) => `${n} veut ${t[1]} ${c}. Il y a un problème : ${t[2]}. ${n} décide de ${t[3]} et peut ${t[4]}.`,
      A2: (n, t, c) => `${n} avait prévu de ${t[1]} ${c}, mais le problème était de ${t[2]}. Au lieu d'abandonner, ${n} a décidé de ${t[3]}. Cela lui a permis de ${t[4]}.`,
      B1: (n, t, c) => `Alors que ${n} essayait de ${t[1]} ${c}, une difficulté inattendue est apparue : ${t[2]}. Après avoir examiné les possibilités, ${n} a choisi de ${t[3]}, ce qui lui a permis de ${t[4]}.`,
      B2: (n, t, c) => `La tentative de ${n} de ${t[1]} ${c} s'est compliquée à cause d'un obstacle inattendu : ${t[2]}. Plutôt que de réagir impulsivement, ${n} a évalué les solutions possibles et décidé de ${t[3]}. Cette stratégie lui a non seulement permis de ${t[4]}, mais elle a aussi montré l'intérêt d'adapter un projet sans perdre de vue son objectif.`,
    },
  },
  it: {
    contexts: ["questa mattina", "ieri", "lo scorso fine settimana", "durante un pomeriggio impegnativo"],
    topics: [
      ["Organizzare la giornata", "organizzare la giornata", "avere troppi impegni", "scrivere una breve lista di priorità", "finire il lavoro importante"],
      ["Trovare un indirizzo", "incontrare un amico in centro", "prendere la strada sbagliata", "chiedere indicazioni a una persona", "arrivare nel posto giusto"],
      ["Preparare un pasto", "preparare una cena per gli amici", "dimenticare un ingrediente", "usare un ingrediente simile", "servire la cena in tempo"],
      ["Gestire un ritardo", "arrivare a un appuntamento", "avere un ritardo nei trasporti", "inviare un messaggio e scegliere un altro percorso", "evitare un malinteso"],
      ["Imparare una competenza", "imparare una nuova competenza digitale", "trovare difficile la prima lezione", "esercitarsi ogni giorno per poco tempo", "completare un piccolo progetto"],
      ["Aiutare un vicino", "aiutare un nuovo vicino", "notare un problema di comunicazione", "parlare lentamente e mostrare un esempio", "risolvere il problema insieme"],
      ["Pianificare un viaggio", "pianificare un breve viaggio", "scoprire che la prima opzione è costosa", "confrontare date e alternative", "rispettare il budget"],
      ["Migliorare la salute", "creare una routine più sana", "sentirsi stanco dopo il lavoro", "iniziare con una breve passeggiata", "fare esercizio con costanza"],
      ["Lavorare in squadra", "preparare una presentazione di gruppo", "ricevere suggerimenti diversi", "ascoltare e dividere le responsabilità", "fare una presentazione chiara"],
      ["Prendere una decisione", "scegliere un corso serale", "avere diverse opzioni simili", "confrontare orario, prezzo e pratica", "scegliere il corso più utile"],
    ],
    question: (name) => `Che cosa ha aiutato ${name} a raggiungere l'obiettivo?`,
    distractors: ["Ignorare la situazione", "Aspettare senza un piano"],
    bodies: {
      A1: (n, t, c) => `${n} vuole ${t[1]} ${c}. C'è un problema: ${t[2]}. ${n} decide di ${t[3]} e può ${t[4]}.`,
      A2: (n, t, c) => `${n} aveva intenzione di ${t[1]} ${c}, ma è sorto un problema: ${t[2]}. Invece di rinunciare, ha deciso di ${t[3]}. Questo gli ha permesso di ${t[4]}.`,
      B1: (n, t, c) => `Mentre cercava di ${t[1]} ${c}, ${n} ha dovuto affrontare una difficoltà inattesa: ${t[2]}. Dopo aver considerato le possibilità, ha scelto di ${t[3]}, riuscendo così a ${t[4]}.`,
      B2: (n, t, c) => `Il tentativo di ${n} di ${t[1]} ${c} è diventato più complesso a causa di un ostacolo inatteso: ${t[2]}. Invece di reagire impulsivamente, ha valutato le alternative e ha deciso di ${t[3]}. La strategia non solo gli ha permesso di ${t[4]}, ma ha anche dimostrato il valore di adattare un piano senza perderne di vista lo scopo.`,
    },
  },
};

const names = ["Maya", "Leo", "Nina", "Sam"];
const levels = ["A1", "A2", "B1", "B2"];
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const rows = [];

for (const [language, locale] of Object.entries(locales)) {
  for (const level of levels) {
    for (let offset = 0; offset < 40; offset += 1) {
      const number = offset + 11;
      const topic = locale.topics[offset % locale.topics.length];
      const variant = Math.floor(offset / locale.topics.length);
      const name = names[variant];
      const answerIndex = number % 3;
      const options = [...locale.distractors];
      options.splice(answerIndex, 0, topic[3]);
      rows.push([
        `${language}-quick-${level.toLowerCase()}-${String(number).padStart(2, "0")}`,
        language,
        level,
        `${topic[0]} — ${locale.contexts[variant]}`,
        locale.bodies[level](name, topic, locale.contexts[variant]),
        locale.question(name),
        JSON.stringify(options),
        answerIndex,
        number,
      ]);
    }
  }
}

const values = rows.map((row) =>
  `  (${row.slice(0, 6).map(quote).join(", ")}, ${quote(row[6])}::jsonb, ${row[7]}, ${row[8]}, true)`
).join(",\n");

writeFileSync(
  output,
  `-- Gerado por scripts/generate-quick-lessons.mjs.\n` +
  `-- Completa 50 lições para cada combinação de idioma e nível.\n\n` +
  `insert into public.quick_lessons (\n` +
  `  id, language, level, title, body, question, options,\n` +
  `  answer_index, sort_order, is_published\n` +
  `) values\n${values};\n`,
);

console.log(`${rows.length} lições geradas em ${output.pathname}`);
