# Relatório técnico — cancelamento da renovação e preservação do período pago

Projeto: pauloalbertoofc-hue/sorteador-universal. Branch: feat/mercadopago-recurring.
PR informado: https://github.com/pauloalbertoofc-hue/sorteador-universal/pull/2.
Base inspecionada: ef39b8b30fcf0685829b7d079949ee48d809e9ba; branch remota sem
commits adicionais no início da tarefa. A árvore estava limpa.

**1. Diagnóstico anterior.** cancelSubscription confirmava status=cancelled no
MP, gravava current_period_end=NULL e devolvia active=false. syncSubscription
só consultava pagamentos para authorized. Além disso, o prazo era cortado pelo
end_date do contrato. Cancelamento da recorrência e invalidação de um pagamento
aprovado eram, portanto, tratados como se fossem a mesma coisa. O frontend
anunciava perda imediata de Pro.

**2. Evidência sobre a API.** Foi consultado o SDK oficial Node do Mercado Pago:
PreApproval.update usa PUT /preapproval/{id}; seus tipos incluem status cancelled,
paused e authorized. A implementação mantém PUT {status:'cancelled'} e faz GET
para confirmar. Não foi criado parâmetro de cancelamento agendado ou endpoint
novo. O agendamento do acesso restante é uma regra de direito de uso nossa,
separada da recorrência cancelada imediatamente no MP.

Referências oficiais consultadas:
- https://github.com/mercadopago/sdk-nodejs/blob/master/src/clients/preApproval/update/index.ts
- https://github.com/mercadopago/sdk-nodejs/blob/master/src/clients/preApproval/commonTypes.ts
- https://www.mercadopago.com.br/developers/pt/reference/subscriptions/_preapproval_id/put

O código-fonte público do SDK foi acessível; a página de documentação retornou
HTTP 403. **Não foi feita chamada autenticada à API real.** Não está confirmado
nesta conta se /authorized_payments/search e /v1/payments continuam retornando
os campos necessários após um cancelamento real. Isso é requisito de homologação,
não um comportamento comprovado pelos mocks. Se o recurso não estiver acessível
ou estiver incompleto, o sistema nega Pro; não substitui evidências por cache.

**3. Arquivos e funções.**
- src/billing.js: context, paidPeriod, entitlement, syncSubscription,
  subscriptionState, checkout e cancelSubscription.
- src/worker.js: reavalia o vencimento antes de serializar /api/me após consultas
  de configuração, que podem demorar. /api/lists mantém o mesmo serviço canônico.
- public/index.html: mensagens, estados de renovação/acesso, botão/diálogo,
  prazo verificado e expiração visual sem reload.
- public/sw.js: versão do cache atualizada para entregar a interface nova.
- tests/billing.test.mjs e tests/fixtures/clock-worker.js: relógio controlado
  somente no entrypoint de teste, sem header de relógio no Worker de produção.
- tests/auth.test.mjs: cancelamento, reload e expiração no navegador.
- tests/preview.test.mjs: assegura BILLING_ENABLED=false nos dois ambientes.
- README.md, BILLING_IMPLEMENTATION.md e este relatório: política atualizada.

**4. Cancelamento.** O usuário cancela a renovação, não o pagamento. Após
verificação de titularidade/vendedor, PUT cancelled e confirmação por GET,
o servidor persiste apenas o estado cancelado, sem apagar o prazo. Então
revalida plano, cobrança e pagamento para calcular o acesso. Repetir a operação
não faz novo PUT se a recorrência já estiver cancelada nem estende o período.

Se o cancelamento for confirmado mas a leitura financeira falhar, a resposta
informa renewal_status=cancelled e access_status=unverified, sem conceder Pro.
A UI distingue esse caso de um cancelamento não confirmado. Uma consulta posterior
pode restaurar somente o restante que for novamente comprovado. Nunca há nova
assinatura, retomada automática ou PUT authorized para preservar o direito pago.

**5. Cálculo do período.** A fonte é uma cobrança vinculada ao preapproval_id,
com debit_date válido, e seu pagamento canônico aprovado. Confere identidade,
external_reference, vendedor, titular, plano, BRL, R$4,90 e frequência mensal.
Busca paginada e vinculação do payment.id são preservadas. Não usa retorno do
checkout, next_payment_date, status local ou data local isolados como prova.

O término é um mês civil UTC a partir de debit_date, ajustando dias inexistentes:
31/01/2026 12:00 UTC resulta em 28/02/2026 12:00 UTC. Acesso vale enquanto
now < access_until; na igualdade, já está expirado. Aprovação tardia, notificações
ou retries não deslocam essa data. end_date do contrato cancelado não encurta
um mês efetivamente pago; não é prova de estorno. Um plano retirado de venda
(status inactive), mas com a mesma identidade e termos financeiros validados,
ainda pode provar um período existente; não habilita nova compra.

Após cancelamento, uma tentativa posterior sem pagamento aprovado não elimina
um período anterior de fato pago e ainda válido. Seleciona-se a cobrança liquidada
mais recente e reconsulta-se o pagamento correspondente. Não se transforma a
tentativa recusada em tempo pago nem se estende o término original. Se a validação
do pagamento selecionado falhar, não há fallback para data do D1. Refund, chargeback,
payment cancelled/rejected, inconsistência ou falta de evidência negam acesso.
A política anterior de suspensão por nova fatura recusada com recorrência ainda
ativa permanece fora da alteração de cancelamento.

**6. Autorização e UI.** /api/me, GET/POST /api/lists e webhooks usam o mesmo
serviço. Recursos são reconsultados no MP em cada decisão; reembolso ou estorno
posterior pode revogar o direito mesmo antes da data. Datas persistidas servem
somente para registro auxiliar. Webhooks antigos/duplicados reconciliam a verdade
atual, não reativam renovação nem acrescentam meses.

A resposta separa:
- status: estado original do contrato, como cancelled;
- renewal_status: active, cancelled, pending, paused, none ou unverified;
- access_status: pro_active, pro_cancelled, expired, free ou unverified;
- active: autorização Pro resultante, usada também por /api/lists;
- access_until e current_period_end: mesmo prazo financeiro verificado em ISO UTC;
- verified_at: horário do servidor para a UI programar o vencimento;
- can_cancel: falso para uma renovação já cancelada.

Exemplo sintético de direito restante: status=cancelled, renewal_status=cancelled,
access_status=pro_cancelled, active=true, access_until=2026-02-01T12:00:00.000Z.
Isso não significa que a assinatura continua renovando.

A UI mostra: “Sua assinatura foi cancelada. Você continuará com acesso Pro até
DD/MM/AAAA. Não haverá renovação automática.” Mantém Estúdio e oculta anúncios
apenas com active=true. Usa prazo/horário do servidor e timer monotônico; no
vencimento fecha o Estúdio, restaura publicidade e consulta novamente. Não pode
prorrogar acesso por decisão local. Reload e retorno à página também verificam
a conta. A API é a barreira de autorização mesmo se o timer do navegador atrasar.

Novas contratações são bloqueadas durante o restante pago, para não sobrescrever
o vínculo financeiro atual. Após o término verificado, uma nova contratação
exige ação explícita e os controles de idempotência já existentes. BILLING_ENABLED
continua false em produção e prévia; nos testes o true é apenas binding sintético.

**7. Migrations.** Nenhuma migration nova. Reutiliza current_period_end existente,
sem transformá-lo em prova de pagamento. Migrations anteriores da implementação
de cobrança continuam necessárias caso ainda não aplicadas na homologação, mas
não foram executadas remotamente nesta tarefa. Nenhum schema, usuário ou dado de
produção foi consultado/alterado.

**8. Verificações.** workerd/D1 temporário com provedor mock, relógio explícito
em cada requisição de teste; Chromium com relógio virtual no teste visual.
O relógio controlado não altera sessões artificialmente: testes que avançam além
da validade do login fazem login novamente com credenciais sintéticas.

Cobertura: cancelamento com pagamento aprovado; restante e listas GET/POST;
limites -1ms/0ms/+1ms; fim de mês; data D1 falsamente prorrogada; cancelamento
antes da primeira cobrança e após recusa; refund e chargeback posteriores;
notificações atrasadas/repetidas; indisponibilidade geral e apenas financeira;
repetição idempotente do cancelamento; contrato cancelado sem novas criações;
recontratação só após o prazo; reload; anúncios e expiração visual; plano
retirado de venda; tentativa posterior recusada sem apagar pagamento anterior.
As regressões de autenticação, checkout, assinaturas, sorteios e PWA são mantidas.

Comandos de validação:

```sh
CHROMIUM_PATH=/usr/bin/chromium npm test
npm run check
npx wrangler deploy --dry-run --outdir /tmp/sorteador-paid-cancellation-build
```

Resultado: **52 testes aprovados, zero falhas e zero testes ignorados**: 20 de
autenticação/navegador, 29 de cobrança e três de configuração/schema de prévia.
Checks sintáticos e empacotamento aprovados. A corrida com uma consulta
anterior ao cancelamento também foi verificada no navegador; respostas antigas
não podem restaurar a mensagem de renovação ativa. O SHA do push e a consulta
ao PR são registrados no relatório do chat. O dry-run
não envia código nem implanta em produção. Nenhuma cobrança real foi feita.

**9. Commit/PR.** A alteração é enviada à mesma feat/mercadopago-recurring do
PR #2, sem merge. Conferir a associação e os checks pelo GitHub/dashboard; se a
API responder Forbidden, apenas a atualização do ref remoto pode ser confirmada
pela máquina. O relatório do chat registra o resultado exato dessas operações.

**10. Limitações/homologação.** As regras passaram em ambiente simulado, não em
uma assinatura real. Ainda verificar na conta de teste: PUT cancelled interrompe
próximas cobranças; GET mantém dados identificadores; histórico da cobrança e
pagamento continuam consultáveis; débito identifica o início efetivo do mês pago;
refund/chargeback alteram os recursos canônicos e produzem notificações válidas.
Se o provedor alterar/suprimir evidências após cancelamento, não inventar suporte
nem usar data local como autorização; investigar o contrato/API suportado antes
de habilitar. Falhas de rede podem suspender provisoriamente Pro até nova
verificação, conforme a regra de bloqueio em falta de evidência. Limites de
paginação e reconciliação da implementação anterior continuam aplicáveis.

**11. Próximos passos e retomada.** Ler este relatório e o de cobrança; conferir
o SHA remoto/PR #2. Homologar somente com credenciais e dados de teste, sem mudar
BILLING_ENABLED de produção. Não aplicar migrations remotas nesta etapa. Usar a
matriz de cenários acima e observar também o vencimento sem reload. Registrar
evidências sem tokens, cookies, cartões ou PII. Somente após aprovação separada
considerar merge/configuração/release de produção. Não reintroduzir retirada
imediata de Pro, não reativar a assinatura para manter acesso e não confiar
apenas em current_period_end. Nenhum merge/deploy/SQL remoto foi executado aqui.
