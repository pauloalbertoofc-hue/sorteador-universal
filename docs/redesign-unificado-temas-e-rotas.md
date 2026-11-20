# Redesign unificado — Sorteador Universal

## Decisões aprovadas (18/11/2026)

- Uma plataforma, uma base de funcionalidades, sete aparências: seis conceitos novos e **Original** (interface atual).
- O **tema 1** é o padrão para novos visitantes; Original permanece selecionável.
- Tema escolhido por visitante: apenas memória durante a sessão da página (sem persistir dados de sorteios). Usuário autenticado: preferência pode ser salva na conta após implementação segura.
- Uso das ferramentas sem cadastro. Conta é necessária apenas para preservar/recuperar dados, sem avisos de cadastro intrusivos.
- Página inicial é um catálogo explorável de ferramentas; páginas específicas integram o mesmo cabeçalho, navegação e sistema visual.
- Não alterar lógica dos sorteios, pagamentos, autenticação ou salas por causa do redesign.

## Rotas verificadas no repositório

O sitemap atual contém **nove** URLs, não dez:

1. /
2. /sortear-nomes/
3. /sortear-numeros/
4. /sortear-equipes/
5. /roleta-online/
6. /sorteio-rifa-online/
7. /cara-ou-coroa-online/
8. /sortear-aluno-online/
9. /dividir-turma-em-grupos/

Existe ainda a rota **/amigo-secreto/**, com aplicação própria e `meta robots=noindex,nofollow`. Ela **não consta do sitemap**. Não presumir que esteja indexada. Antes de mudar indexação, revisar privacidade, fluxos de revelação e a intenção de busca; nunca indexar URLs privadas com tokens.

## Estratégia de integração

- Manter os endereços públicos existentes, seus canonicals e conteúdo útil; o acesso por cartão deve usar essas URLs, sem duplicar páginas SEO.
- Integrar cada página com um shell compartilhado: identidade da marca, navegação, seletor de tema e região principal da ferramenta.
- Evitar que páginas SEO sejam apenas uma vitrine com link para outra URL; permitir usar a ferramenta na própria rota, reaproveitando a lógica existente.
- Amigo secreto: preservar funcionamento do módulo, links individuais, expiração e controles de privacidade; integrar a aparência sem alterar a segurança.
- Não criar novas URLs canônicas por tema. Temas são apresentações do mesmo conteúdo.
- Manter rotas diretas para SEO e compartilhamento, com títulos e descrições específicos.
- Não remover consentimento de Analytics por confundí-lo com avisos de cadastro; respeitar escolha de privacidade.

## Sistema de temas (proposta de implementação)

IDs estáveis: `classic` (padrão), `modern`, `amethyst`, `ruby`, `crystal`, `abyssal`, `original`.

Camada 1: tokens de CSS (fundo, texto, superfície, borda, foco, botões, sombras).
Camada 2: ambientação decorativa opcional (texturas, gradientes, imagens), carregada somente no tema escolhido.
Camada 3: componentes funcionais compartilhados e responsivos.

Requisitos: contraste WCAG, foco visível, respeito a prefers-reduced-motion, performance mobile, fallback sem JavaScript e controles acessíveis.

## Plano incremental e critérios de aceite

1. Inventariar rotas, parâmetros de ferramenta, SEO e eventos antes de editar.
2. Criar shell e tokens de tema, com **Original** como fallback de segurança e `classic` como novo padrão apenas após homologação.
3. Integrar a home e uma rota piloto (por exemplo /sortear-nomes/) preservando canonical, conteúdo e uso imediato.
4. Integrar as demais rotas públicas e amigo secreto sem mudar a lógica.
5. Habilitar seletor com sete temas, preferência em conta quando autenticado e comportamento efêmero para visitante.
6. Testar mobile/desktop, navegação direta e retorno, PWA, login, pagamentos, roleta, salas, amigo secreto, sitemap, robots, canonicals e consentimento GA4.
7. Publicar gradualmente; comparar Search Console e GA4 sem assumir indexação imediata.

**Não publicar sem validar** que as rotas públicas continuam funcionando e que nenhuma URL privada foi exposta ao índice.

## Questão pendente

O usuário se refere a dez links já indexados. O repositório lista nove URLs no sitemap e uma rota de amigo secreto marcada como noindex. Confirmar no Search Console as dez URLs efetivamente indexadas antes de modificar sitemap ou robots.
