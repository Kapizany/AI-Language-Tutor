-- Catálogo inicial de cenários de conversa.
--
-- Os textos de abertura ficam no banco para que um editor de conteúdo possa
-- ajustar cenários e falas sem republicar o frontend. `icon` e `accent` são
-- chaves simbólicas resolvidas pela aplicação, não classes CSS arbitrárias.

insert into public.conversation_scenarios (
  id,
  category,
  title_pt_br,
  description_pt_br,
  objective_pt_br,
  min_level,
  max_level,
  planned_minutes,
  icon,
  accent,
  openings,
  goals_pt_br,
  sort_order
) values
(
  'coffee',
  'daily',
  'Na cafeteria',
  'Faça pedidos e fale sobre preferências.',
  'Faça um pedido completo e pergunte o preço.',
  'A1',
  'B2',
  10,
  'coffee',
  'coral',
  jsonb_build_object(
    'en', 'Good afternoon! Welcome. What can I get started for you?',
    'es', '¡Buenas tardes! ¿Qué te gustaría pedir?',
    'fr', 'Bonjour ! Qu''est-ce que vous souhaitez commander ?',
    'it', 'Buon pomeriggio! Cosa desidera ordinare?'
  ),
  jsonb_build_array(
    'Cumprimentar a pessoa que atende',
    'Fazer o pedido de uma bebida',
    'Escolher o tamanho ou a variação',
    'Perguntar o preço e finalizar'
  ),
  1
),
(
  'airport',
  'travel',
  'No aeroporto',
  'Check-in, bagagem e orientações.',
  'Faça o check-in e confirme o portão de embarque.',
  'A1',
  'B2',
  12,
  'plane',
  'blue',
  jsonb_build_object(
    'en', 'Good morning! May I see your passport and booking confirmation?',
    'es', '¡Buenos días! ¿Puedo ver tu pasaporte y tu reserva?',
    'fr', 'Bonjour ! Puis-je voir votre passeport et votre réservation ?',
    'it', 'Buongiorno! Posso vedere il passaporto e la prenotazione?'
  ),
  jsonb_build_array(
    'Apresentar documentos e reserva',
    'Despachar a bagagem',
    'Perguntar sobre o portão de embarque',
    'Confirmar o horário do voo'
  ),
  2
),
(
  'restaurant',
  'daily',
  'No restaurante',
  'Reserve, escolha e peça a conta.',
  'Escolha um prato, faça perguntas e peça a conta.',
  'A1',
  'B2',
  10,
  'utensils',
  'amber',
  jsonb_build_object(
    'en', 'Good evening! Do you have a reservation?',
    'es', '¡Buenas noches! ¿Tienes una reserva?',
    'fr', 'Bonsoir ! Avez-vous une réservation ?',
    'it', 'Buonasera! Ha una prenotazione?'
  ),
  jsonb_build_array(
    'Informar a reserva ou pedir uma mesa',
    'Perguntar sobre um prato do menu',
    'Fazer o pedido',
    'Pedir a conta'
  ),
  3
),
(
  'free',
  'daily',
  'Conversa livre',
  'Escolha qualquer assunto com o tutor.',
  'Mantenha uma conversa livre no idioma estudado.',
  'A1',
  'B2',
  10,
  'globe',
  'purple',
  jsonb_build_object(
    'en', 'Hello! What would you like to talk about today?',
    'es', '¡Hola! ¿De qué te gustaría hablar hoy?',
    'fr', 'Bonjour ! De quoi souhaitez-vous parler aujourd''hui ?',
    'it', 'Ciao! Di cosa vorresti parlare oggi?'
  ),
  jsonb_build_array(
    'Escolher um assunto e apresentá-lo',
    'Responder às perguntas do tutor',
    'Fazer uma pergunta ao tutor'
  ),
  4
),
(
  'interview',
  'professional',
  'Entrevista de emprego',
  'Conte sua experiência e objetivos.',
  'Apresente sua experiência e responda sobre seus objetivos.',
  'B1',
  'B2',
  15,
  'briefcase',
  'teal',
  jsonb_build_object(
    'en', 'Welcome! Could you start by telling me a little about yourself?',
    'es', '¡Bienvenido! ¿Puedes contarme un poco sobre ti?',
    'fr', 'Bienvenue ! Pouvez-vous vous présenter brièvement ?',
    'it', 'Benvenuto! Può raccontarmi qualcosa di lei?'
  ),
  jsonb_build_array(
    'Fazer uma apresentação pessoal curta',
    'Descrever uma experiência profissional',
    'Explicar seus objetivos de carreira',
    'Fazer uma pergunta sobre a vaga'
  ),
  5
),
(
  'meeting',
  'professional',
  'Reunião de trabalho',
  'Opine, concorde e peça esclarecimentos.',
  'Compartilhe uma opinião e peça um esclarecimento.',
  'B1',
  'B2',
  15,
  'headphones',
  'navy',
  jsonb_build_object(
    'en', 'Thanks for joining. What is your view on today''s proposal?',
    'es', 'Gracias por participar. ¿Qué opinas de la propuesta de hoy?',
    'fr', 'Merci d''être là. Que pensez-vous de la proposition ?',
    'it', 'Grazie per essere qui. Cosa ne pensa della proposta?'
  ),
  jsonb_build_array(
    'Compartilhar uma opinião sobre a proposta',
    'Concordar ou discordar com educação',
    'Pedir um esclarecimento',
    'Resumir o próximo passo'
  ),
  6
);
