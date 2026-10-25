# Sorteador Universal 2.0 — integração inicial

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
