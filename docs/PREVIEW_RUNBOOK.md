# Workers Builds Previews — estado e continuação

Data: 25/10/2026. Repositório: pauloalbertoofc-hue/sorteador-universal.
Branch: fix/auth-session-cache. PR informado pelo responsável: https://github.com/pauloalbertoofc-hue/sorteador-universal/pull/1.
Correção de autenticação anterior: 0aede8df7eaa293db157887e3e26298301b759ba.

## Diagnóstico e sintaxe

O log informado da Cloudflare usa `npx wrangler preview` e propõe um binding D1
com `database_id: "<REPLACE_ME>"`. O wrangler.jsonc anterior não declarava
`previews`. O Wrangler gera marcadores ao propor bindings de prévia a partir
da produção para evitar reutilizar recursos de produção sem intenção explícita.
Assim, o marcador é uma configuração de prévia incompleta; não indica que o
UUID de produção deva ser substituído.

Foi consultado o schema, os tipos e a implementação oficiais distribuídos no
pacote npm Wrangler **4.152.0** instalado. A versão agora está fixada no manifesto
e lockfile. `wrangler preview` usa **`previews.d1_databases`**.
`preview_database_id` é uma opção de desenvolvimento remoto (`wrangler dev`),
e `env.preview` é um ambiente nomeado: nenhum deles substitui o bloco `previews`
para o comando observado. Não alteramos o comando de deploy de produção.

Referências oficiais indicadas pelo próprio Wrangler:
- https://developers.cloudflare.com/workers/previews/configuration/#wrangler-configuration-file
- https://developers.cloudflare.com/workers/wrangler/configuration/#previews

O acesso HTTP à documentação retornou 403 neste ambiente; a validação foi feita
com o schema e o normalizador da versão instalada, não com suposições sobre uma
versão diferente. `wrangler preview --help` confirma o comando em open beta e
não oferece `--dry-run`.

## Configuração final

| Uso | Binding/configuração | Banco | UUID |
| --- | --- | --- | --- |
| Produção | wrangler.jsonc → d1_databases → DB | sorteador-universal-db | 24fe67dc-7003-4557-9de0-cf6658e713c2 |
| Workers Previews | wrangler.jsonc → previews.d1_databases → DB | sorteador-universal-preview-db | 9701cfcf-9c77-4b09-8411-0f4a13f8c584 |
| Administração da prévia | wrangler.preview-db.jsonc → d1_databases → DB | sorteador-universal-preview-db | 9701cfcf-9c77-4b09-8411-0f4a13f8c584 |

Trecho da configuração usada por `wrangler preview`:

```json
"previews": {
  "d1_databases": [{
    "binding": "DB",
    "database_name": "sorteador-universal-preview-db",
    "database_id": "9701cfcf-9c77-4b09-8411-0f4a13f8c584",
    "migrations_dir": "migrations/preview"
  }],
  "vars": {
    "MP_ACCESS_TOKEN": "",
    "MP_PLAN_ID": "",
    "MP_WEBHOOK_SECRET": "",
    "PUBLIC_SITE_URL": ""
  }
}
```

As variáveis de pagamento da prévia são explicitamente vazias. Não adicionar
credenciais reais de Mercado Pago à prévia nem à sua base config no dashboard.
Nenhuma assinatura de teste foi inserida. A configuração de produção mantém
seu binding e UUID originais. O arquivo de administração contém **somente** o
banco de prévia e não possui entrypoint para publicar o Worker.

## SQL e situação dos bancos

`migrations/preview/0001_initial.sql` cria, sem inserir dados:
- users: id, email UNIQUE, password_hash e created_at;
- sessions: token_hash, user_id com FK, expires_at INTEGER e índice de expiração;
- subscriptions: user_id UNIQUE, identificadores do provedor, status inicialmente
  inactive, valor/moeda, validade e updated_at;
- saved_lists: usuário, nome, tipo, conteúdo JSON e updated_at;
- payment_events: tabela reservada mínima (id, event_type, created_at).

O Worker atual não lê/escreve payment_events. Sua estrutura mínima foi criada
somente para a prévia e NÃO reconstrói o contrato de produção ou um sistema de
pagamentos. As outras tabelas seguem as consultas atuais do Worker.
`expires_at` continua em Unix time em milissegundos.

A migration existente `migrations/0001_sessions.sql` permanece intacta.
O bootstrap de prévia está em subdiretório separado, fora do padrão direto
`migrations/*.sql` de produção. Não aplicar o bootstrap à produção.

**Remoto:** o responsável informou banco de prévia vazio, com zero tabelas.
Não foi possível conferir nem alterar esse estado: `wrangler whoami` informou
que não há autenticação Cloudflare. Nenhuma migration remota foi executada.
O banco de produção não foi consultado nem alterado. Nenhum dado pessoal foi
copiado. A autenticação GitHub injetada não dá acesso à Cloudflare.

**Local:** o bootstrap foi aplicado com Wrangler a um D1 isolado em
`/tmp/sorteador-preview-validation`. Uma segunda execução confirmou que não há
migrations pendentes. Os testes também usam D1 temporário, independente desse
estado. Cinco tabelas de aplicação foram criadas e verificadas inicialmente
vazias; a CLI cria sua própria tabela de controle d1_migrations.

## Aplicação remota pendente — somente prévia

Em terminal autenticado na conta Cloudflare correta, na branch deste PR:

```sh
npm ci
npx wrangler login
npx wrangler d1 info DB --config wrangler.preview-db.jsonc
```

Confira que o retorno é **sorteador-universal-preview-db**, UUID
**9701cfcf-9c77-4b09-8411-0f4a13f8c584**. Só então execute:

```sh
npm run db:preview:remote
npx wrangler d1 migrations list DB --remote --config wrangler.preview-db.jsonc
npx wrangler d1 execute DB --remote --config wrangler.preview-db.jsonc --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

Não omitir `--config wrangler.preview-db.jsonc`, não usar o arquivo principal
para esta operação e não executar migrations em produção. Se aparecer qualquer
UUID diferente, interromper. Não adicionar registros de produção ou Pro.
As permissões necessárias são acesso ao banco de prévia e D1 Edit; não foi
solicitado nenhum token em chat. É possível usar credenciais configuradas de
forma segura no terminal/ambiente autenticado.

## Workers Builds e verificação da publicação

No painel Cloudflare, conferir a integração do Worker sorteador-universal com
o repositório e a branch do PR. Recomendação para instalar a versão fixada:
comando de build `npm ci`; comando de implantação de prévia
`npx --no-install wrangler preview`. O comando observado `npx wrangler preview`
também usa a instalação local quando as devDependencies estão presentes.
Manter o comando de produção existente; não usar `wrangler deploy` para tentar
corrigir a prévia. Não fazer merge deste PR durante esta tarefa.

Após aplicar o SQL remoto de prévia, acompanhar/reexecutar a build correspondente
ao novo commit do PR. O upload do Worker **não aplica migrations D1 por si só**.
Uma build de upload verde não comprova que cadastro/login funcionam num banco
vazio. Confirmar o UUID do binding e testar a URL de prévia real: health,
cadastro com conta sintética, login, recarga, /api/me, logout e bloqueio Pro.

A consulta ao PR via `gh pr view 1` foi bloqueada com Forbidden pela API GraphQL.
O envio Git e a consulta dos refs são operações independentes dessa API.
Não foi possível consultar a configuração real do Workers Builds, o status da
nova build ou o resultado de uma implantação remota. O push para a branch do
PR normalmente o atualiza, mas não prova que a integração iniciou uma build.
Não declarar a build aprovada sem observar o resultado no dashboard/checks.

## Evidências de validação desta alteração

```sh
npm ci --cache /tmp/sorteador-npm-cache --no-audit --no-fund
WRANGLER_SEND_METRICS=false XDG_CONFIG_HOME=/tmp/sorteador-xdg CHROMIUM_PATH=/usr/bin/chromium npm test
npm run check
CI=true npm run db:preview:local -- --persist-to /tmp/sorteador-preview-validation
CI=true npm run db:preview:local -- --persist-to /tmp/sorteador-preview-validation
npx wrangler deploy --dry-run --outdir /tmp/sorteador-preview-build
```

Resultados: **19 testes passaram, zero falhas** (16 regressões de autenticação/
PWA e três verificações de isolamento/configuração/schema de prévia), check
sintático aprovado, migration local aplicada e repetida sem pendências,
empacotamento dry-run aprovado. Os 16 testes agora usam o SQL de prévia real.
O dry-run padrão valida o empacotamento de produção sem enviar nem implantar
nada; o bloco previews foi validado separadamente pelo normalizador Wrangler.
Não se executou `wrangler preview` remoto por falta de autenticação.

Limitações: todos os PRs que utilizarem este UUID compartilharão o mesmo banco
de prévia. Usar somente dados sintéticos; não testar alterações destrutivas ou
migrations incompatíveis sem isolar um banco por prévia. A configuração Previews
está em open beta; manter o Wrangler fixado e revisar mudanças de versão.

Para localizar o commit e conferir o envio sem depender da API GitHub:

```sh
git log -1 --format='%H %s'
git ls-remote --heads origin fix/auth-session-cache
```

O SHA remoto deve corresponder ao commit que contém este documento. O relatório
no chat registra o resultado do envio e a tentativa posterior de consultar os
checks. Não houve merge, deploy de produção nem ativação de pagamentos.
