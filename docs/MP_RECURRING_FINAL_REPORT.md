# Relatório de continuidade — Mercado Pago recorrente

Data: 2026-10-27. Branch: `feat/mercadopago-recurring`.

## Evidência externa fornecida pelo responsável

No Windows, o responsável obteve HTTP 200 autenticado em `GET /users/me` e `GET /preapproval_plan/search?limit=100` via PowerShell. A busca retornou um plano `Sorteador Universal Pro`, status `active`, ID `9650746c85ca4811aca022610e2696b4`. Estas consultas **não foram reproduzidas nesta execução**. Não foram confirmados por essa busca o vendedor, a aplicação, a periodicidade ou o preço do detalhe do plano.

## Inspeção efetivamente realizada

Foram lidos diretamente da branch GitHub os arquivos `scripts/find-mp-plan.mjs`, `scripts/verify-mp-plan.mjs`, `scripts/lib/mp-admin-transport.mjs`, `scripts/lib/mp-plan-admin.mjs`, testes administrativos, `package.json` e o relatório anterior.

O cliente administrativo utiliza `fetch` nativo com `configureAdminNetwork`, que configura proxy explícito quando existem variáveis HTTP(S)_PROXY. A etapa de identidade exige `/users/me`, ID válido e `tags` como array. A validação de plano exige vendedor, aplicação, nome, status ativo, BRL 4,90 mensais, ausência de trial e condições adicionais. **Não há evidência suficiente para atribuir a falha do Node a uma causa específica.**

## Alterações nesta rodada

- `scripts/lib/mp-plan-admin.mjs`: separação da etapa de erro de requisição (`identity_request`, `search_request`, `plan_detail_request`), leitura do corpo (`*_body`) e interpretação de JSON inválido (`*_json`). Erros continuam sanitizados; nenhum corpo ou cabeçalho é incluído no diagnóstico.
- `tests/mp-admin-transport.test.mjs`: ajuste da expectativa do timeout do corpo para `identity_body` e dois testes de regressão para DNS na requisição e JSON inválido.

A alteração melhora o diagnóstico, **não afirma corrigir o transporte**. Não foram modificados os critérios de autorização, validação comercial ou segurança de TLS.

## Testes e limitações

As alterações foram gravadas na branch via API do GitHub. **Não foram executados testes, checks sintáticos, build ou testes de integração real nesta execução.** O histórico anterior registrou 89 testes aprovados antes destas alterações; não é correto atribuir esse resultado aos commits atuais.

## Próximos passos no Windows

1. `git pull origin feat/mercadopago-recurring`
2. `npm run check`
3. `npm test`
4. Configurar `MP_ENVIRONMENT=production`, `MP_PLAN_ID=9650746c85ca4811aca022610e2696b4` e `MP_ACCESS_TOKEN` com segurança na sessão local.
5. `npm run billing:verify-plan`. Se houver `network_error`, registrar apenas código e estágio sanitizados, sem imprimir token.
6. Investigar a diferença entre o transporte PowerShell e Node, conforme resultado observado; não desabilitar TLS.
7. Homologar checkout, notificações e concessão do benefício Pro em ambiente de testes antes de ativar produção.

## Operações não realizadas

Não houve cobrança, criação de plano, alteração D1, deploy, merge, alteração de segredos Cloudflare ou ativação de `BILLING_ENABLED`. O ID real é uma evidência externa; não foi injetado em produção.
