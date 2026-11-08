# Sorteador Universal 2.0 — integração inicial

## Aplicativo publicado

**Acessar Sorteador Universal:** https://sorteador-universal.paulo-alberto-ofc.workers.dev/

Este é o endereço de produção informado pelo responsável pelo projeto. As alterações enviadas ao GitHub só aparecem no site depois do deploy no Cloudflare.

**ATENÇÃO: não ativar cobrança real antes de concluir testes e validação.** Este pacote é uma base de integração, não um produto de pagamentos auditado.

## 1. Preparação do GitHub
Extraia o ZIP e envie **o conteúdo da pasta**, mantendo `public/`, `src/`, `migrations/`, `package.json` e `wrangler.jsonc` na raiz do repositório `sorteador-universal`. Não envie o ZIP como único arquivo.

## 2. Banco D1
No painel do D1, abra o banco criado e copie seu **Database ID** (UUID). Substitua `COLE_AQUI_O_DATABASE_ID` em `wrangler.jsonc`. O nome `database_name` também deve coincidir com o nome real do seu banco.

As tabelas `users`, `subscriptions`, `payment_events`, `saved_lists` já foram criadas manualmente. Confira o esquema antes de publicar. Rode no console D1:

```sql
PRAGMA table_info(users);
PRAGMA table_info(subscriptions);
PRAGMA table_info(saved_lists);
```

O backend exige as colunas de `subscriptions`: `id`, `user_id`, `mp_subscription_id`, `mp_plan_id`, `status`, `amount_cents`, `currency`, `current_period_end`, `updated_at`. As capturas mostram `mp_subscription_id`, `mp_plan_id`, `current_period_end`.

**A tabela `sessions` não foi mostrada nas capturas**. Crie-a com o SQL em `migrations/0001_sessions.sql` antes de testar cadastro/login.

## 3. Cloudflare
Crie um **novo** Worker a partir do repositório GitHub, sem substituir o antigo `red-band-2e9a`. `Build command`: vazio. `Deploy command`: `npx wrangler deploy`. O nome do Worker novo é `sorteador-universal`.

O arquivo `wrangler.jsonc` configura Worker, ativos estáticos e vínculo D1. Antes do primeiro deploy, preencha o ID do banco e envie ao GitHub.

Em Worker > Settings > Variables and Secrets, cadastre **como segredos** `MP_ACCESS_TOKEN`, `MP_PLAN_ID`, `MP_WEBHOOK_SECRET`; configure `PUBLIC_SITE_URL` com a URL real HTTPS do novo Worker (pode ser variável comum). **Nunca envie tokens ao GitHub ou ao chat.**

## 4. Mercado Pago
No painel de desenvolvedor do Mercado Pago, configure a URL do webhook como `https://SEU-NOVO-WORKER.workers.dev/api/webhooks/mercadopago`. Use a chave secreta correspondente a esse webhook. Configure o plano de assinatura e seu ID (`MP_PLAN_ID`). Verifique se plano, moeda e recorrência estão corretos no Mercado Pago; o frontend apenas exibe R$ 4,90.

## 5. Testes antes de cobrar
- `GET /api/health` deve retornar `ok:true`.
- Cadastro e login devem funcionar com `sessions` existente.
- `GET /api/me` deve retornar `active:false` para usuários gratuitos.
- Checkout deve ser testado com credenciais e fluxo de testes apropriados.
- Teste webhook legítimo, assinatura ativa, pausa, cancelamento, falha da API e tentativa de acesso Pro sem pagamento.
- Confirme que as configurações do provedor não permitem divergência entre preço, plano e assinatura.

## Limitações importantes
- A interface Pro ainda salva/importa presets **localmente no navegador**, não sincroniza as listas pelo D1. As rotas `/api/lists` são a base para uma futura integração da interface.
- Webhook só trata notificações de preapproval e valida HMAC; outras notificações e reconciliação operacional precisam ser avaliadas.
- `GET /api/me` verifica a assinatura no Mercado Pago antes de liberar o Pro, mas o endpoint de listas ainda confia no status armazenado: não considerar a API de listas pronta para produção sem alinhar a verificação.
- Não existe fluxo de recuperação de senha, confirmação de e-mail, proteção contra força bruta, nem painel administrativo.
- Os anúncios de terceiros e tratamento de dados pessoais exigem revisão de privacidade/consentimento e termos de serviço.
- Para produção, acrescentar monitoramento, testes automatizados, política de retenção e rotina de suporte/cancelamento.


## Atualização 2.0.2 — publicidade e assinatura

- Removidos os botões públicos de ocultar e reexibir anúncios.
- A antiga preferência local `su-ads-hidden` não é mais consultada.
- Os anúncios são mostrados por padrão, inclusive quando o serviço de contas está indisponível.
- Apenas uma resposta `/api/me` autenticada com `subscription.active: true` oculta os anúncios.
- A cobrança ainda precisa ser configurada no servidor e no provedor; não há pagamento ativo nesta versão.
- A apresentação dos banners mantém dimensões 320x50 e 300x250.


## Diagnóstico da autenticação (2.0.3)
Esta versão registra erros de execução da API com prefixo `[SU_API]` no console do
Cloudflare Workers, sem imprimir corpo de requisições, senhas, cookies ou tokens.
Após publicar, abra Workers & Pages > sorteador-universal > Observability > Live
e tente criar uma conta. Verifique a mensagem de erro e não compartilhe segredos.
Não execute novamente migrações de criação de tabelas já existentes.

## Versão 2.0.4 — correção do cadastro

Corrige a incompatibilidade da API WebCrypto PBKDF2 com o limite de 100.000 iterações do Cloudflare Workers. A rotina agora usa PBKDF2-HMAC-SHA256 com salt aleatório de 16 bytes e 100.000 iterações. O esquema de armazenamento anterior foi preservado; não há necessidade de recriar tabelas. Como o banco de produção ainda tinha zero usuários na verificação anterior, não há hashes antigos a migrar. Não compartilhar senhas nos logs.

## Correção da autenticação — cache da PWA

Causa reproduzida no Chromium: o service worker antigo (`sorteador-universal-v2-0-2`)
armazenava qualquer GET da mesma origem, inclusive `/api/me`, em Cache Storage.
Essa API respondia `Cache-Control: no-store`, mas a gravação explícita com
`cache.put()` ignorava essa diretiva. Após armazenar a resposta anônima, cadastro
ou login retornava sucesso e gravava o cookie corretamente, enquanto a PWA
continuava lendo `user:null` do cache. A consulta direta ao backend com o mesmo
cookie retornava o usuário. O problema inverso também era possível: exibir uma
resposta autenticada antiga depois do logout.

O novo service worker sempre consulta a rede para `/api` e `/api/*`, remove os
caches anteriores ao ativar e mantém o funcionamento offline dos ativos estáticos.
A interface usa `cache: 'no-store'`, só limpa a senha após confirmar o usuário em
`/api/me`, informa sucesso/erro e impede operações simultâneas. Respostas antigas
da consulta inicial não sobrescrevem um login novo. Depois de um logout aceito
pelo servidor, a interface deixa de exibir a conta mesmo se a consulta de
confirmação falhar.

A regra CSS de publicidade também respeita `#adArea[hidden]`: o estilo de layout
não pode forçar a exibição do bloco quando uma conta Pro ativa o oculta.

O backend continua usando o binding `DB` do `wrangler.jsonc`. O token aleatório
entregue no cookie tem 32 bytes (64 caracteres hexadecimais); somente seu SHA-256
é armazenado em `sessions.token_hash`. `expires_at` é um INTEGER com Unix time em
**milissegundos**, comparado com `Date.now()`. A validade é de 30 dias. O logout
invalida somente a sessão atual e envia o mesmo cookie com `Max-Age=0`.
`Path=/api`, `HttpOnly`, `Secure` e `SameSite=Strict` foram preservados; os fetches
usam a mesma origem com `credentials: 'same-origin'`. Cookies com caracteres
extras após o token agora são rejeitados. Não se armazena autenticação em
localStorage e o cadastro não concede Pro.

### Executar os testes

Use Node.js 24:

```sh
npm ci
npx playwright install chromium
npm test
npm run check
npx wrangler deploy --dry-run --outdir /tmp/sorteador-build
```

Se o sistema já tiver Chromium, dispense o download e use:

```sh
CHROMIUM_PATH=/usr/bin/chromium npm test
```

A suíte executa o Worker no runtime `workerd` com D1 temporário e isolado,
compatibility date `2026-10-24`. O navegador usa um servidor de ativos de teste
com proxy para esse Worker. Os cookies e o service worker são reais. Apenas
cenários de falha deliberada interceptam respostas; os fluxos principais usam
o backend real. Anúncios externos são bloqueados **somente nos testes**.

Cobertura: cadastro, duplicidade, validação, senha incorreta, login, hash e
expiração da sessão, cookies ausentes/inválidos, persistência, `/api/me`, logout,
proteção de origem, bloqueio Pro, mensagens e preservação da senha, corrida com
a consulta inicial, atualização do service worker antigo, modo offline,
histórico, números, nomes, roleta, equipes e dados.

### Banco e publicação

Esta correção **não exige migration nova**, nem exclui usuários ou sessões.
A migration existente `migrations/0001_sessions.sql` é compatível com as consultas
atuais. `tests/fixtures/local-schema.sql` é um esquema mínimo inferido para
**testes**, não uma migration nem uma cópia do esquema de produção. As tabelas
pré-existentes `users`, `subscriptions`, `saved_lists` e `payment_events` não têm
migrations completas neste repositório. O esquema remoto não foi inspecionado
com credenciais Cloudflare durante esta correção.

Para conferir o esquema real sem ler dados pessoais, execute no console D1:

```sql
PRAGMA table_info(users);
PRAGMA table_info(sessions);
PRAGMA table_info(subscriptions);
PRAGMA table_info(saved_lists);
PRAGMA table_info(payment_events);
PRAGMA foreign_key_list(sessions);
```

Confirme `sessions(token_hash TEXT PRIMARY KEY, user_id TEXT, expires_at INTEGER)`
e a referência a `users(id)`. Não converta nem recrie tabelas existentes sem antes
avaliar o esquema real. Se a tabela `sessions` estiver ausente, aplique somente a
migration já existente após essa conferência; ela usa `IF NOT EXISTS`.

Depois de revisar e integrar a branch com a correção, publique **Worker e ativos
juntos**, pelo pipeline Cloudflare existente ou por um terminal autenticado:

```sh
npm ci
npm run check
npm run deploy
```

Preserve o vínculo D1 e os segredos já configurados. Nenhum segredo de pagamento
é necessário para validar contas gratuitas. A alteração não ativa cobranças.
Abra a PWA com internet para permitir a atualização de `sw.js`; o novo worker
usa `skipWaiting` e `clients.claim`. Recarregue a página após a atualização.
O cache antigo será removido, preservando o histórico em localStorage.
Não é necessário apagar todos os dados do site nem desinstalar a PWA.

Na URL publicada, confirme cadastro/login, `/api/me` autenticado após recarregar,
logout e `/api/me` anônimo. Em DevTools, verifique a presença do cookie em
Application e o envio em Network sem copiar ou compartilhar seu valor.
`/api/me` deve vir da rede e não aparecer em Cache Storage. A validação nesta
branch é local; não comprova que a nova versão já foi publicada. Continuam
válidas as limitações de produção e assinaturas descritas acima no README.

## Workers Builds Previews e D1 separado

A configuração atual de `wrangler preview`, o bootstrap SQL exclusivo da prévia,
os comandos de migration e o estado dos acessos/builds estão documentados em
[docs/PREVIEW_RUNBOOK.md](docs/PREVIEW_RUNBOOK.md). Esta seção complementa a
correção de autenticação acima: os testes agora usam a migration de prévia, e
não apenas o antigo fixture local. O banco de produção permanece inalterado.

## Implementação de cobrança recorrente — homologação pendente

A integração foi ampliada com validação de plano/pagamento, proteção contra
contratações duplicadas, reconciliação de webhooks e autorização canônica das
listas Pro. A cobrança permanece **desabilitada por padrão**. As limitações da
integração inicial descritas acima são histórico; o estado atual, migrations,
secrets, testes e pendências de homologação estão em
[docs/BILLING_IMPLEMENTATION.md](docs/BILLING_IMPLEMENTATION.md). Não ativar
cobranças reais com base apenas nos testes simulados.

## Cancelamento da renovação e período pago

Cancelar a renovação agora preserva o Pro até o fim do mês pago e verificado,
sem reativar a recorrência. A autorização continua consultando o pagamento real,
inclusive para detectar reembolsos/estornos. A política, testes com relógio
controlado e pendências de homologação estão em
[docs/CANCELLATION_POLICY.md](docs/CANCELLATION_POLICY.md).

## Localizar o plano existente sem criar cobranças

`npm run billing:find-plan` pesquisa planos exclusivamente por GET, com
MP_ACCESS_TOKEN injetado com segurança e MP_ENVIRONMENT explícito. O comando
`billing:verify-plan` compartilha as validações e também exige o ambiente.
Nenhum comando altera MP_PLAN_ID de produção ou habilita pagamentos. Veja o
[relatório e instruções de execução segura](docs/MP_PLAN_DISCOVERY.md).

## Node falha, mas curl funciona

As CLIs administrativas agora respeitam proxy HTTP/HTTPS/NO_PROXY e emitem
causas sanitizadas de DNS, TLS, timeout e CONNECT. Use Node 24.14+ para o suporte
automático de proxy e execute `npm run billing:network-check` sem token para
isolar o transporte. Veja [MP_NETWORK_DIAGNOSIS.md](docs/MP_NETWORK_DIAGNOSIS.md)
para instruções Windows, segurança de certificados e limites da validação real.

## Versão 2.4 — Estúdio de Sorteios (ferramentas gratuitas)

- **Modelos reutilizáveis:** salve até 20 configurações no navegador, separadas por ferramenta; carregue, atualize ou exclua sem cadastro. Os modelos não são sincronizados entre aparelhos.
- **Comprovante técnico:** após cada sorteio, baixe um JSON com resultado, parâmetros, identificador aleatório, data UTC e hash SHA-256. A verificação no próprio aplicativo recalcula o hash e detecta alterações sem atualização correspondente.
- **Comprovante legível:** exporte HTML com resultado, parâmetros e hash; abra no navegador para imprimir ou salvar como PDF. Os dados dos participantes são escapados para não executar HTML inserido como nome.
- **Modo Evento:** apresentação com contagem regressiva e revelação progressiva dos resultados, incluindo comandos para revelar o próximo ou todos. O modo pode ser fechado por Esc.
- **Limites de verificação:** um hash sem assinatura externa não autentica a origem, não impede substituição integral do arquivo e não comprova aleatoriedade ou imparcialidade. Não é certificação de sorteios regulamentados.
- **Privacidade:** modelos e históricos permanecem no armazenamento local deste navegador. O arquivo de comprovante pode conter nomes e outras informações inseridas pelo usuário; revise antes de compartilhar.
- **Validação:** o workflow `.github/workflows/free-tools-quality.yml` executa testes estáticos e testes de navegador Chromium, incluindo cenários de 320 e 390 px. Sucesso do workflow não significa que o Cloudflare publicou a revisão.

### Conferência de publicação

Após confirmar o deploy no Cloudflare, abra a URL real do Worker em uma janela privada e confira a identificação `Versão 2.4`, os botões de modelos, comprovantes e Modo Evento. No celular, recarregue a PWA após a ativação do service worker novo. O deploy de produção não é executado pelo workflow de qualidade.
