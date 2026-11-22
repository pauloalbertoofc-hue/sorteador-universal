# Homologação final — redesign unificado

## Evidência automatizada (22/11/2026)

Head verificado: `725aa0a22ac9d0449187142d1e469cccefbab5d5` (PR #84, aberto, em rascunho, não mesclado).

No GitHub, o último head apresentou oito checks verdes, incluindo **Theme redesign contracts** (push e pull_request), **Free tools quality checks**, **Secret Santa engine tests**, **SEO landing pages and ads regression**, **SEO metadata regression**, **Billing pilot gate** e **Workers Builds**. Os seis workflows de GitHub Actions consultados para esse SHA constavam como `completed/success`.

A falha anterior no teste visual do tema Clássico (formulário `#form` visível quando deveria estar oculto) não reapareceu nesses checks. Isso valida o cenário automatizado, **não** substitui o teste manual em dispositivos e no ambiente Cloudflare.

Cobertura automatizada: sete temas, rotas públicas, navegação por teclado, contraste do título, disclosures, tema no iframe e preservação de campos. O servidor estático e estados simulados não comprovam autenticação, cobrança, envio de e-mails nem salas reais.

## Homologação manual ainda pendente

- [ ] Comparar capturas finais em 390 e 1280 px, incluindo Original, Clássico e as páginas SEO; verificar também Android real.
- [ ] Realizar sorteios como visitante nas oito ferramentas e conferir resultados e reset, inclusive após alternar tema.
- [ ] Testar conta de homologação: login, segundo fator por e-mail, logout, recarga e login em nova sessão; não registrar códigos ou credenciais no PR.
- [ ] Confirmar que a verificação de e-mail e a autenticação em duas etapas continuam funcionando após novo deploy da prévia.
- [ ] Conferir estado da assinatura e ausência de anúncios para conta Pro de teste; usar sandbox para checkout, sem cobrança real.
- [ ] Criar sala de teste, entrar em segundo dispositivo e conferir sincronização e compartilhamento.
- [ ] Conferir consentimento de analytics, anúncios e links legais.
- [ ] Conferir no painel Cloudflare que as variáveis, segredos e binding D1 da prévia persistem após deploy; validar o envio de e-mail sem expor o segredo.
- [x] Confirmar build do Cloudflare Workers e checks do PR no SHA acima.
- [ ] Revisar diff contra main, sem alterações indevidas no Amigo Secreto.
- [ ] Obter autorização explícita para publicação.


## Pré-publicação: banco D1 de produção (somente leitura primeiro)

**Alvo:** binding `DB` em produção: `sorteador-universal-db`. **Não** confundir com `sorteador-universal-preview-db`. O repositório possui migrações `0010_password_resets.sql` a `0014_email_mfa.sql`; a existência desses arquivos **não comprova** sua aplicação no D1 de produção.

1. No painel Cloudflare, abrir Workers & Pages → D1 → **sorteador-universal-db** e confirmar o banco selecionado.
2. Antes de qualquer escrita, registrar backup/exportação recuperável do banco e seu horário. Não anexar dados pessoais ao PR.
3. Executar **somente leitura** no console SQL do banco correto:
   ```sql
   SELECT name FROM sqlite_master
   WHERE type='table' AND name IN (
     'users','password_resets','user_profiles','user_avatars',
     'email_verifications','user_email_mfa','email_mfa_challenges',
     'd1_migrations'
   ) ORDER BY name;
   SELECT name FROM sqlite_master
   WHERE type='index' AND tbl_name IN (
     'password_resets','user_profiles','user_avatars',
     'email_verifications','user_email_mfa','email_mfa_challenges'
   ) ORDER BY name;
   SELECT id, name, applied_at FROM d1_migrations ORDER BY id;
   ```
   Se a tabela `d1_migrations` não existir ou tiver esquema diferente, consultar `PRAGMA table_info(d1_migrations);` antes de adaptar a consulta; não executar inserts manuais no histórico.
4. Comparar as tabelas **e colunas** efetivas com os arquivos `migrations/0010_*.sql` até `0014_*.sql` usando `PRAGMA table_info(nome_da_tabela);` para cada tabela presente. Conferir também chaves estrangeiras e índices; não presumir equivalência apenas pelo nome.
5. Caso falte alguma estrutura, preparar plano específico e reversível para aplicar a migração correta, com confirmação do banco-alvo, backup e janela de manutenção. **Não** executar automaticamente `wrangler d1 migrations apply --remote` enquanto houver divergência entre esquema real e histórico de migrações.
6. No painel do Worker de produção, confirmar a presença (sem revelar valores) de segredos e variáveis necessários para envio de e-mail, URLs de callback, faturamento e banco D1. `keep_vars: true` não substitui essa conferência; variáveis da prévia não devem ser presumidas na produção.
7. Só após isso: testar login, MFA por e-mail, verificação, recuperação de senha, avatar e exportação de dados em conta de teste; não registrar tokens/códigos nos logs.

**Bloqueio:** ausência de tabela/coluna, divergência do histórico, segredo de e-mail ausente ou envio de códigos falhando impede o merge/deploy. Nenhuma consulta SQL desta seção foi executada remotamente durante a preparação deste documento.

## Estado da liberação gradual

Os temas `classic` e `original` estão em `SU_RELEASED_THEMES`; `modern`, `amethyst`, `ruby`, `crystal` e `abyssal` permanecem no código, mas fora do seletor público. Publicar o sistema completo não depende de concluir esses cinco estilos.

## Critérios de bloqueio

Não mesclar se houver erro de login/segundo fator, perda de variáveis de ambiente, regressão de sorteios, falha de consentimento, quebra de rotas SEO ou divergência relevante entre mobile e desktop. Se qualquer teste manual falhar, registrar **rota, tema, dispositivo, ação e resultado observado**, sem anexar senhas, tokens ou códigos.

## Liberação

Manter PR em rascunho até revisão. Não usar credenciais reais em logs, não efetuar cobrança real e não alterar Amigo Secreto. Após autorização e aprovação, registrar SHA publicado e validar produção; se houver regressão, avaliar reversão do merge.
