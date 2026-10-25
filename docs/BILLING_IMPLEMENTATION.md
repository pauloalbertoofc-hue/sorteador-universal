> Atualização da política: a versão inicial deste relatório foi complementada por
> [CANCELLATION_POLICY.md](CANCELLATION_POLICY.md); o cancelamento não retira mais
> um período pago válido. Os 42 testes abaixo descrevem a entrega inicial.

# Sorteador Universal Pro — relatório de implementação e homologação

Data: 25/10/2026. Repositório: pauloalbertoofc-hue/sorteador-universal.
Branch de implementação: `feat/mercadopago-recurring`.

**Estado de entrega:** implementação e testes locais com provedor simulado;
**não houve assinatura real, cobrança real, aplicação de SQL remoto, merge ou deploy**.
A cobrança continua desabilitada no arquivo de configuração. Este relatório
não constitui aprovação de funcionamento em produção.

**1. Base encontrada.** A main foi atualizada por fetch e estava em
`18fedf7ad43621e2bcc5c9359b897db52bf8b4b0` (merge do PR #1). A nova branch parte
dessa main, não da antiga branch de autenticação. A árvore estava limpa.
Cadastro, login, cookies e correção de cache da PWA já estavam implementados.
Havia rotas de checkout/webhook, helpers mpGet/syncSubscription, vínculo D1 e
botão de compra desabilitado. Nenhum identificador de plano ou credencial MP
foi fornecido no ambiente; não foi possível conferir o plano preparado pelo
responsável. Não foi criado nenhum plano.

**2. Reaproveitamento.** Autenticação, cookie HttpOnly/Secure/SameSite=Strict,
verificação de origem, assinatura via preapproval, tabela subscriptions,
atualização da conta, Estúdio Pro e controle de publicidade foram preservados.
Os helpers de cobrança foram separados em src/billing.js para compartilhar a
mesma validação entre conta, listas e notificações. Não há autenticação em
localStorage nem dados de cartão no Worker.

**3. Defeitos anteriores.** O checkout gerava uma chave aleatória por requisição,
permitindo criações concorrentes; uma resposta perdida podia gerar nova compra.
O sync não conferia valor, moeda, plano, vendedor nem cobrança aprovada. Apenas
status authorized podia conceder Pro. As listas confiavam no D1 local. O webhook
não tinha registro de processamento. O frontend não iniciava a compra, não
consultava cobrança/cancelamento e não distinguia estados de pagamento.

**4. Arquivos/funções.**
- src/billing.js: mp/mpGet/context, checkout/recover/bindPending,
  subscriptionState/paidPeriod/syncSubscription, withLock, webhook e cancelSubscription.
- src/worker.js: conecta esses serviços a /api/me, /api/checkout,
  /api/subscription/cancel, /api/webhooks/mercadopago e /api/lists.
- public/index.html: habilitação condicional da compra, estados, erros,
  consulta, cancelamento, retorno e bloqueio de cliques simultâneos.
- public/sw.js: nova versão de cache, mantendo API fora do cache.
- migrations/0002_billing_safety.sql e sua cópia em migrations/preview/.
- wrangler.jsonc: BILLING_ENABLED=false em produção e prévia; UUIDs intactos.
- scripts/verify-mp-plan.mjs, package.json: preflight somente leitura e check ampliado.
- tests/auth.test.mjs, tests/billing.test.mjs: regressões, navegador e provedor mock.
- README.md e este relatório.

**5. Contratação implementada.** O usuário autenticado consulta /api/me. O botão
só é habilitado se BILLING_ENABLED=true e a configuração e o plano puderem ser
validados no provedor. São consultados GET /users/me e GET /preapproval_plan/{id}:
vendedor correto, plano active, BRL 4,90, frequência mensal 1, sem trial nem
limite de repetições. Não há criação de plano por código.

O checkout adquire um bloqueio D1 por usuário. Contratação pending é retomada;
assinaturas authorized/paused não permitem nova compra. Só após confirmação
canônica de cancelled se permite uma nova geração. A intenção de criação é
persistida ANTES do POST /preapproval/. O POST pede status pending, associa
external_reference ao UUID do usuário e recebe init_point do provedor. O
redirecionamento só aceita HTTPS no checkout hospedado brasileiro e deve
conter o preapproval_id da assinatura, não apenas um link público de plano.

Se a resposta se perder ou ficar ambígua, não se repete o POST. O próximo pedido
consulta /preapproval/search por e-mail/plano e filtra external_reference exato.
Apenas um candidato canônico pode ser associado. Sem resultado inequívoco,
bloqueia nova contratação e exige consulta posterior/reconciliação operacional.
O header X-Idempotency-Key também é enviado, mas a prevenção de duplicidade não
depende de presumir que o endpoint o honre.

O retorno usa PUBLIC_SITE_URL/?billing=return. A URL não concede Pro. A conta é
consultada novamente com o cookie existente; o navegador também atualiza após
retorno do bfcache/visibilidade. Há teste de retorno cruzando uma origem MP
simulada, com persistência do login e sem promoção por status=approved na URL.

**6. Autorização e segurança.** Cada consulta de Pro (conta e GET/POST listas)
valida recursos oficiais; o status authorized local nunca é suficiente.
Confere external_reference, binding de assinatura, plano, vendedor e recorrência.
Para authorized, consulta /authorized_payments/search por preapproval_id e lê o
pagamento vinculado em GET /v1/payments/{id}. Confere approved, BRL 4,90, vendedor,
payer_id da assinatura e ausência de valor reembolsado. A última cobrança já
vencida deve estar processed/approved; falha recente suspende acesso mesmo se
uma cobrança anterior ainda se sobrepuser. Período vencido, pagamento recusado,
reembolsado, assinatura pausada ou indisponibilidade negam Pro. Assinatura
cancelada conserva somente o período pago ainda comprovadamente válido, conforme
[política atual de cancelamento](CANCELLATION_POLICY.md).

O período é um mês civil a partir de debit_date, com ajuste para o último dia
do mês, limitado por end_date quando presente. Aprovação tardia não estende o
período automaticamente. Cobranças empatadas/ambíguas exigem reconciliação.
Pesquisas são paginadas e limitadas a 500 recursos por operação; histórico maior
ou inconsistente nega acesso até reconciliação, evitando busca sem limite.
Não há trial gratuito nem tolerância de inadimplência nesta política.

Bloqueios D1 têm lease de 120s e fencing em cada gravação. Chamadas MP têm timeout
de 8s e redirect manual; redirects não são seguidos com a credencial. Uma
instância que perdeu o lease não pode sobrescrever a substituta. Falhas de
provider não liberam acesso por fallback local. Logs não recebem payloads MP,
headers de autorização, cookies, senhas ou dados de cartão.

Webhook exige data.id na query, x-request-id e x-signature (ts/v1), valida HMAC
SHA-256 com o manifesto `id:{id_em_minusculas};request-id:{rid};ts:{ts};`, e confere
a correspondência com body.data.id. Aceita timestamp em segundos ou ms, com
janela de cinco minutos; o valor literal original entra no HMAC. Timestamp
antigo, assinatura inválida ou substituição de recurso são rejeitados.

Eventos suportados: subscription_preapproval, subscription_authorized_payment
e payment. Os IDs são consultados no provedor; eventos não vinculados a uma
assinatura local conhecida não podem associar outro usuário. O estado enviado
no corpo nunca é aplicado diretamente. Sob o mesmo lock, o recurso atual é
reconsultado: evento antigo não reativa cancelamento. billing_events grava
apenas hash da entrega assinada, tipo/ID do recurso e horário após sucesso;
replay idêntico é reconhecido. Nova entrega do mesmo evento pode reconciliar
novamente, mas não cria compra nem aplica efeitos cumulativos. Uma falha antes
do registro permite retry seguro. Manter retenção e monitoramento operacionais
para essa tabela; nenhuma rotina de limpeza remota foi executada.

Cancelamento é POST autenticado com proteção de origem, confirmação visual e
verificação de titularidade/vendedor antes de PUT status=cancelled. O servidor
reconsulta para confirmar. A política atual mantém o Pro até o término do período pago e novamente
verificado, sem iniciar reembolso nem renovar a recorrência. O cancelamento
remoto é imediato; o direito de acesso é separado e expira automaticamente.
Ver [CANCELLATION_POLICY.md](CANCELLATION_POLICY.md) para os novos campos, relógio
controlado e limitações de homologação. Cancelamento e
validação de assinaturas existentes não dependem de BILLING_ENABLED=true; essa
chave controla apenas novas contratações e o botão de compra.

**7. Banco.** UUID produção 24fe67dc-7003-4557-9de0-cf6658e713c2 e UUID prévia
9701cfcf-9c77-4b09-8411-0f4a13f8c584 foram preservados. A migration incremental
0002 cria billing_locks, billing_checkout e billing_events com índice de horário.
Não altera users, sessions, subscriptions, saved_lists nem payment_events.
Não presume o schema da tabela payment_events existente em produção.

Aplicação LOCAL validada, com repetição sem pendências:

```sh
CI=true npm run db:preview:local -- --persist-to /tmp/sorteador-billing-schema
```

Para a prévia REMOTA, em terminal autenticado e somente depois de confirmar
nome/UUID com o primeiro comando:

```sh
npx wrangler d1 info DB --config wrangler.preview-db.jsonc
npm run db:preview:remote
```

Não se executou isso remotamente nesta tarefa. O comando usa apenas o banco de
prévia. O bootstrap 0001 é exclusivo da prévia; nunca aplicar à produção.

Produção, APENAS após aprovação de release e backup: conferir PRAGMA table_info
e index_list de subscriptions, inclusive UNIQUE(user_id), e existência das
colunas utilizadas anteriormente. Revisar o histórico de migrations. Aplicar
somente o SQL incremental aprovado, por exemplo:

```sh
# SOMENTE na fase aprovada de produção, não durante desenvolvimento/homologação:
npx wrangler d1 execute DB --remote --config wrangler.jsonc --file migrations/0002_billing_safety.sql
```

execute não registra d1_migrations; documentar a aplicação no processo de release.
O SQL usa IF NOT EXISTS, mas isso não substitui a conferência do schema real.
Não executar indiscriminadamente migrations antigas ou o bootstrap de prévia.

**8. Testes.** A suíte roda em workerd/Miniflare, com D1 isolado, dados sintéticos,
fetch de saída interceptado e Chromium. Preserva os testes de autenticação,
PWA/offline, histórico, números, nomes, roleta, equipes, dados e anúncios.
Cobertura nova: plano incompatível; conta gratuita; criação/retomada pending;
concorrência; resposta de criação perdida; reconciliação ambígua; authorized
sem pagamento; cobrança aprovada; titularidade/plano/moeda/valor/vendedor;
recusa/refund/expiração/pausa/cancelamento; falha MP; HMAC inválido/antigo;
duplicidade; ordem invertida; outros usuários; eventos de pagamento; cancelamento;
lease perdido; fatura recente recusada; paginação; retorno do checkout e cliques
simultâneos. Resultado final: **42 testes aprovados, zero falhas** (18 de autenticação/navegador, 21 de cobrança com provedor simulado e três de configuração/schema de prévia). Check sintático e empacotamento dry-run aprovados. O SHA e a situação do envio/PR constam do relatório de entrega do chat.

```sh
npm ci --cache /tmp/sorteador-npm-cache --no-audit --no-fund
CHROMIUM_PATH=/usr/bin/chromium npm test
npm run check
npx wrangler deploy --dry-run --outdir /tmp/sorteador-billing-build
```

O dry-run empacota sem upload. Não é confirmação de build remota ou pagamento.

**9. Verificações externas efetivas.** Git fetch confirmou a main e seu histórico.
O SDK oficial mercadopago 3.6.1 foi consultado pelo pacote npm e pelo código-fonte
oficial no GitHub (tipos e implementação PreApproval.create). A aplicação usa
fetch nativo, sem adicionar dependência MP. O site de documentação MP retornou
HTTP 403 neste ambiente. Nenhuma chamada autenticada à API MP pôde ser feita:
não há MP_ACCESS_TOKEN, MP_PLAN_ID ou MP_WEBHOOK_SECRET disponíveis. A API GitHub
ficou Forbidden em tarefas anteriores e será tentada novamente após o push.
A situação de acesso atual, commit e PR consta do relatório final do chat.

Referências para conferir durante homologação:
- https://www.mercadopago.com.br/developers/pt/reference/subscriptions/_preapproval/post
- https://www.mercadopago.com.br/developers/pt/reference/subscriptions/_preapproval_id/get
- https://www.mercadopago.com.br/developers/pt/reference/subscriptions/_authorized_payments_search/get
- https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
- https://github.com/mercadopago/sdk-nodejs/blob/master/src/clients/preApproval/create/index.ts

**10. Configurações necessárias.** Reutilizar o plano existente se o preflight
confirmar que pertence ao vendedor da credencial e cobra BRL 4,90 mensal.
No painel Mercado Pago, abrir o plano em Assinaturas/Planos e identificar o
preapproval_plan_id. O parâmetro preapproval_plan_id do link público aponta para
o plano, mas a URL inteira não é seu ID; Application ID também não é ID do
plano. Se o painel não mostrar o ID, listar/consultar os planos da conta pela
API oficial e conferir nome, moeda, valor, recorrência e collector_id. Não criar
plano automaticamente para contornar um ID desconhecido.

Com MP_ACCESS_TOKEN injetado com segurança no terminal e MP_PLAN_ID definido:

```sh
npm run billing:verify-plan
```

Esse comando apenas consulta /users/me e /preapproval_plan/{id}; não cria nem
altera nada e não imprime tokens. Não inserir valores em commits, chat ou logs.
Não interpretar sucesso desse preflight como validação de checkout/webhook.

Cloudflare: MP_ACCESS_TOKEN e MP_WEBHOOK_SECRET são SECRETS do servidor.
MP_PLAN_ID e PUBLIC_SITE_URL são configuração do servidor, nunca parâmetros
escolhidos pelo cliente. PUBLIC_SITE_URL deve ser a origem HTTPS exata, sem
query, fragmento ou subcaminho. BILLING_ENABLED permanece false até homologação.

Prévia: as entradas vazias MP_ACCESS_TOKEN/MP_WEBHOOK_SECRET em previews.vars
são placeholders antigos, NÃO secrets. Para homologar, remover essas duas
entradas vazias da configuração de prévia antes de cadastrar secrets reais de
TESTE, evitando conflito entre binding comum e segredo. Preencher MP_PLAN_ID
e PUBLIC_SITE_URL com valores da homologação e habilitar BILLING_ENABLED apenas
nesse ambiente. Publicar a configuração de prévia revisada. Não habilitar a
chave de produção nem usar suas credenciais na prévia. O banco de prévia é
compartilhado entre PRs; coordenar secrets/base config ou isolar uma prévia.

Em conta/preview autenticados, usar o mecanismo de secrets de Previews do
Wrangler 4.152.0, que solicita valores de forma segura:

```sh
npx wrangler preview secret put MP_ACCESS_TOKEN --name NOME_REAL_DA_PREVIEW
npx wrangler preview secret put MP_WEBHOOK_SECRET --name NOME_REAL_DA_PREVIEW
```

Substituir NOME_REAL_DA_PREVIEW pelo nome real da Preview no dashboard antes: o nome padrão depende da
branch e de sua normalização no serviço. Usar o nome exibido, não presumir uma
URL a partir da branch. Se o fluxo de Builds utilizar secrets na base config,
configurá-los somente na base de TESTE correspondente e verificar a propagação
no novo deployment. Não é necessário expor tokens ao frontend.

Registrar webhook na aplicação correta do Mercado Pago:
`https://ORIGEM-EXATA-DA-PREVIA/api/webhooks/mercadopago` em homologação e
`https://sorteador-universal.paulo-alberto-ofc.workers.dev/api/webhooks/mercadopago`
somente na fase de produção aprovada. Habilitar eventos de assinaturas e
pagamentos: subscription_preapproval, subscription_authorized_payment e payment.
Usar o segredo de assinatura correspondente à URL/aplicação/ambiente.

**11. GitHub e publicação.** Fazer push apenas desta branch e preparar PR para
main; sem merge automático. O push pode iniciar uma build de prévia conforme
as configurações do Workers Builds. Não chamar npm run deploy (sem dry-run)
para homologar. Se a API GitHub negar criação do PR, usar:
https://github.com/pauloalbertoofc-hue/sorteador-universal/compare/main...feat/mercadopago-recurring?expand=1

**12. Pronto versus não validado.** A implementação local e os testes simulados
não provam compatibilidade da conta/plano real. Em especial, deve-se confirmar
que a API da conta de teste aceita criação pending com o plano associado e
retorna init_point com preapproval_id individual; não há fallback para cobrar
cartão no Worker ou abrir link público sem associação segura. Conferir os
campos reais de authorized_payments e payment, política de retry, timestamp e
assinatura recebida do provedor. Campos ausentes ou incompatíveis negam Pro;
não afrouxar as verificações para fazer a homologação passar.

Ainda não validados: plano real preparado, credenciais e permissões MP,
checkout real hospedado, entrega de webhook real, renovação de mês seguinte,
recusa/estorno/chargeback reais, cancelamento real, D1 remoto, configuração de
Builds e cobrança em produção. Usuários/test cards/credenciais devem seguir o
fluxo de testes efetivamente suportado para assinaturas no país/conta; não
presumir que qualquer token TEST funciona nem usar cartão/dados de pessoa real.

**13. Continuação exata.** Conferir o PR/commit; autenticar Cloudflare com escopo
de prévia; confirmar UUID e aplicar migrations da prévia; localizar e verificar
o plano existente com credenciais de teste; ajustar somente a configuração de
homologação; registrar webhook; iniciar preview e executar a matriz de testes
reais acima. Conservar evidências sem tokens, cookies, dados pessoais ou cartão.
Em caso de criação ambígua sem resultado, não apagar billing_checkout para
tentar novamente: o operador deve reconciliar a conta MP e confirmar ausência
ou cancelamento da contratação antes de qualquer liberação manual de retry.

Somente após aprovação explícita: backup/schema review de produção, SQL
incremental aprovado, secrets de produção, configuração de plano/site/flag,
revisão do deploy automático em main, merge/release supervisionados e smoke
test com monitoramento. Não iniciar cobrança real como teste automático.

**14. Resumo para outro assistente.** Não refazer autenticação nem desenvolver
na branch antiga. Consultar git log e o SHA remoto da feature. Os IDs D1 estão
isolados e não foram alterados. A cobrança está OFF. Nenhum plano foi criado;
o ID existente ainda precisa ser fornecido/verificado pelo responsável. Conta
e listas dependem de verificação canônica e pagamento vigente. Mocks são
explícitos e não concedem Pro em produção. Há três tabelas incrementais novas,
SQL remoto pendente, preflight somente leitura, PR/push a conferir no relatório
final. Não remover registros de intenção ou controles de assinatura para
contornar falhas. Não fazer merge, deploy de produção ou cobranças sem aprovação.
