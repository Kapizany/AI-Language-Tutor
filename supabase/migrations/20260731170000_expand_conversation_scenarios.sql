-- Dois cenários exclusivos para cada nível. Cenários com faixa ampla da
-- primeira versão continuam disponíveis como prática adicional.
insert into public.conversation_scenarios (
  id, category, title_pt_br, description_pt_br, objective_pt_br,
  min_level, max_level, planned_minutes, icon, accent, openings,
  goals_pt_br, sort_order
) values
(
  'introductions', 'daily', 'Conhecendo alguém', 'Apresente-se e troque informações básicas.',
  'Diga seu nome, origem e interesses e faça perguntas simples.', 'A1', 'A1', 8,
  'users', 'teal',
  '{"en":"Hi! My name is Alex. What is your name?","es":"¡Hola! Me llamo Alex. ¿Cómo te llamas?","fr":"Salut ! Je m''appelle Alex. Comment vous appelez-vous ?","it":"Ciao! Mi chiamo Alex. Come ti chiami?"}'::jsonb,
  '["Cumprimentar e dizer seu nome","Informar de onde você é","Falar de um interesse","Fazer duas perguntas simples"]'::jsonb, 7
),
(
  'supermarket', 'daily', 'No supermercado', 'Encontre produtos, quantidades e preços.',
  'Peça ajuda para encontrar produtos e confirme quantidade e preço.', 'A1', 'A1', 8,
  'shopping', 'coral',
  '{"en":"Hello! Can I help you find something?","es":"¡Hola! ¿Te ayudo a encontrar algo?","fr":"Bonjour ! Je peux vous aider à trouver quelque chose ?","it":"Buongiorno! Posso aiutarla a trovare qualcosa?"}'::jsonb,
  '["Pedir um produto","Informar uma quantidade","Perguntar onde ele fica","Confirmar o preço"]'::jsonb, 8
),
(
  'hotel', 'travel', 'No hotel', 'Faça check-in e resolva necessidades da estadia.',
  'Confirme sua reserva, conheça os horários e peça uma comodidade.', 'A2', 'A2', 10,
  'hotel', 'blue',
  '{"en":"Welcome to our hotel. Do you have a reservation?","es":"Bienvenido al hotel. ¿Tiene una reserva?","fr":"Bienvenue à l''hôtel. Avez-vous une réservation ?","it":"Benvenuto in hotel. Ha una prenotazione?"}'::jsonb,
  '["Confirmar nome e reserva","Perguntar o horário do café","Pedir a senha do Wi-Fi","Solicitar uma comodidade"]'::jsonb, 9
),
(
  'doctor', 'daily', 'Consulta médica', 'Descreva sintomas e entenda orientações básicas.',
  'Explique como se sente, há quanto tempo e confirme as recomendações.', 'A2', 'A2', 10,
  'health', 'amber',
  '{"en":"Hello. What brings you in today?","es":"Hola. ¿Qué le trae por aquí hoy?","fr":"Bonjour. Qu''est-ce qui vous amène aujourd''hui ?","it":"Buongiorno. Qual è il motivo della visita?"}'::jsonb,
  '["Descrever sintomas simples","Dizer quando começaram","Responder sobre hábitos","Confirmar a orientação recebida"]'::jsonb, 10
),
(
  'apartment', 'daily', 'Alugando um apartamento', 'Compare condições e esclareça regras.',
  'Avalie um imóvel perguntando sobre custos, contrato e vizinhança.', 'B1', 'B1', 12,
  'home', 'purple',
  '{"en":"Thanks for coming to see the apartment. What would you like to know?","es":"Gracias por venir a ver el piso. ¿Qué le gustaría saber?","fr":"Merci d''être venu visiter l''appartement. Que souhaitez-vous savoir ?","it":"Grazie per essere venuto a vedere l''appartamento. Cosa vorrebbe sapere?"}'::jsonb,
  '["Perguntar o que está incluído","Entender as regras do contrato","Conhecer a vizinhança","Negociar uma condição"]'::jsonb, 11
),
(
  'customer-support', 'professional', 'Atendimento ao cliente', 'Explique um problema e negocie uma solução.',
  'Relate um problema com clareza e chegue a uma solução aceitável.', 'B1', 'B1', 12,
  'support', 'navy',
  '{"en":"Customer support, how can I help you today?","es":"Atención al cliente, ¿en qué puedo ayudarle?","fr":"Service client, comment puis-je vous aider ?","it":"Servizio clienti, come posso aiutarla?"}'::jsonb,
  '["Explicar o problema em ordem","Informar o que já tentou","Responder a perguntas de diagnóstico","Propor ou aceitar uma solução"]'::jsonb, 12
),
(
  'negotiation', 'professional', 'Negociação comercial', 'Defenda prioridades e construa um acordo.',
  'Negocie prazo, escopo e preço preservando a relação profissional.', 'B2', 'B2', 15,
  'handshake', 'teal',
  '{"en":"Thank you for meeting with us. Shall we begin with the proposed terms?","es":"Gracias por reunirse con nosotros. ¿Empezamos por las condiciones propuestas?","fr":"Merci de nous rencontrer. Commençons-nous par les conditions proposées ?","it":"Grazie per l''incontro. Possiamo iniziare dai termini proposti?"}'::jsonb,
  '["Apresentar prioridades e limites","Justificar uma contraproposta","Explorar concessões possíveis","Resumir o acordo e próximos passos"]'::jsonb, 13
),
(
  'public-debate', 'professional', 'Debate de ideias', 'Argumente, conteste e reconheça nuances.',
  'Defenda uma posição complexa com evidências e responda a objeções.', 'B2', 'B2', 15,
  'debate', 'purple',
  '{"en":"Today we will discuss whether remote work benefits society overall. What is your position?","es":"Hoy debatiremos si el trabajo remoto beneficia a la sociedad. ¿Cuál es su postura?","fr":"Aujourd''hui, nous débattons des bénéfices du télétravail pour la société. Quelle est votre position ?","it":"Oggi discutiamo se il lavoro da remoto giovi alla società. Qual è la sua posizione?"}'::jsonb,
  '["Apresentar uma tese clara","Sustentar um argumento com exemplo","Responder a uma objeção","Reconhecer limites e concluir"]'::jsonb, 14
);

