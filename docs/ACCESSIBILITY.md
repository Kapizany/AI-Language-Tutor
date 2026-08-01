# Requisitos de acessibilidade

Meta: WCAG 2.2 nível AA para as jornadas essenciais.

## Critérios obrigatórios

- Todas as ações funcionam por teclado, sem armadilha de foco.
- Foco visível possui contraste de pelo menos 3:1.
- Texto normal possui contraste mínimo de 4,5:1.
- Zoom de 200% não perde conteúdo ou funcionalidade.
- Layout funciona a 320 CSS pixels sem rolagem horizontal global.
- Alvos de toque têm pelo menos 44 × 44 CSS pixels quando possível.
- Inputs possuem nome acessível, instrução e erro associado.
- Erros não dependem somente de cor e usam `role="alert"` quando imediatos.
- Loadings usam `aria-busy` ou status anunciado sem roubar foco.
- Modais movem o foco para dentro, prendem-no enquanto abertos e devolvem-no ao
  elemento de origem ao fechar.
- Conteúdo dinâmico relevante usa regiões `aria-live` com parcimônia.
- Ícones decorativos ficam ocultos da árvore de acessibilidade.
- Áudio nunca inicia automaticamente; controles têm nome, estado e alternativa
  textual.
- Animações respeitam `prefers-reduced-motion`.
- Idioma da página e mudanças de idioma em exemplos são identificáveis.

## Testes

- Playwright cobre teclado e fluxos essenciais.
- Uma ferramenta automatizada de acessibilidade será executada na CI.
- Antes de cada release: VoiceOver/Safari e NVDA/Chrome nas jornadas de login,
  onboarding, aprendizagem e conversa.
- Problemas críticos de teclado, nome acessível ou contraste bloqueiam release.

## Definition of Done visual

Uma tela não está concluída sem estados de loading, vazio, erro, desabilitado,
foco, zoom e celular. O teste manual deve ser registrado na pull request.
