# Sorteador Universal 2.5 — plano de publicação controlada

**Estado em 09/11/2026:** homologação HTTP e bateria completa de qualidade **aprovadas no commit `92ab6364`** (execução #42543477855, incluindo testes Node, Chromium e navegador móvel). A inspeção remota **repetida e aprovada** #42543969138 confirmou as oito tabelas de negócio existentes e `d1_migrations`, ausência das três tabelas de salas, e histórico somente com `0001_sessions.sql` e `0002_billing_safety.sql`. **Não há autorização para migração ou deploy de produção neste documento.**

## 1. Portões obrigatórios

1. **Concluído em `a6d243d7` (#42543969138):** inspeção remota somente leitura confirmou banco correto, tabelas base e histórico coerente, sem estado parcial. Reconfirmar na janela de mudança se houver qualquer alteração intermediária.
2. Executar [**Production rooms preflight (read-only)**](https://github.com/pauloalbertoofc-hue/sorteador-universal/actions/workflows/production-rooms-preflight.yml) no commit atual. A bateria automatizada geral já passou em #42543477855, mas isso não substitui a inspeção do banco remoto nem a checagem de prontidão para publicação.
3. **Concluído em `a6d243d7` (#42544022209):** `npm audit` reportou **0 vulnerabilidades** (informativas, baixas, moderadas, altas e críticas). Correção de dependências aplicada no commit `0e0f83dc`.
4. Validar manualmente a interface em celular e desktop: criação, convite, inscrição, limite, fechamento, expiração, mensagens de erro e acessibilidade.
5. Criar e **verificar um backup recuperável do D1 de produção** por mecanismo oficial Cloudflare antes de qualquer alteração. Registrar horário, identificador do backup e procedimento de restauração em local privado. Nunca anexar um dump de usuários ou pagamentos a logs ou artefatos públicos do GitHub.
6. Aprovação humana explícita para a janela de mudança, com responsável disponível para acompanhar erros, logs e reversão.


## 1A. Procedimento de backup e verificação (antes de qualquer escrita)

**Executar fora de logs públicos do GitHub.** O banco contém dados de contas e faturamento. Não copiar dumps para issues, artefatos públicos, commits ou conversas. Usar apenas a conta Cloudflare autorizada.

1. No painel Cloudflare, abrir **Workers & Pages → D1** e selecionar **`sorteador-universal-db`**. Conferir o identificador de produção **`24fe67dc-7003-4557-9de0-cf6658e713c2`**; não selecionar a base de prévia.
2. Verificar as opções de recuperação/backup disponíveis para esse banco e plano (por exemplo, **Time Travel / Restore** quando disponível). Registrar **privadamente** o instante UTC de recuperação e a retenção disponível. Uma referência de restauração não deve ser confundida com uma cópia exportada independente.
3. Se a estratégia adotada for exportação independente, criar o backup **somente em ambiente privado controlado**, conforme as instruções atuais do Cloudflare D1, e guardá-lo criptografado, com acesso restrito. Não executar exportação para GitHub Actions ou anexar o arquivo ao repositório.
4. Verificar que o mecanismo realmente permite recuperar o estado escolhido: conferir existência, integridade e instruções de restauração, idealmente ensaiando a recuperação em um **banco separado**, nunca sobrescrevendo a produção durante o ensaio. Se não houver como verificar recuperação, **interromper o lançamento**.
5. Registrar privadamente: responsável, data/hora UTC, identificador do banco, método de backup, referência de recuperação, prazo de retenção, verificação realizada e procedimento de reversão. Não incluir tokens ou dados pessoais.
6. Repetir a inspeção de metadados somente leitura se o estado do banco mudar entre a verificação anterior e a janela de publicação.

**Portão obrigatório:** sem backup comprovadamente recuperável, sem aprovação explícita ou com migração parcial detectada, **não aplicar migrações e não fazer deploy**.

## 2. Ordem da mudança (somente após aprovação)

1. Confirmar novamente o ID de produção `24fe67dc-7003-4557-9de0-cf6658e713c2` e que não é o ID de prévia `9701cfcf-9c77-4b09-8411-0f4a13f8c584`.
2. Confirmar backup e testar plano de recuperação antes de qualquer escrita.
3. Aplicar **somente** as migrações aditivas `0003_public_rooms.sql` e `0004_room_rate_limits.sql` com Wrangler apontando explicitamente para o D1 de produção. Não executar migrações antigas novamente sem inspecionar `d1_migrations`.
4. Inspecionar a estrutura criada e a integridade das tabelas existentes; interromper se qualquer checagem falhar.
5. Publicar a versão 2.5 do Worker e os assets no projeto de produção somente depois da confirmação da migração. Validar configurações de cobrança e segredos existentes sem divulgá-los.
6. Executar testes de fumaça em produção com contas/recursos de teste, sem pagamentos reais e sem dados pessoais de terceiros; monitorar erros e taxa de requisições.

## 3. Reversão e limites

- Se o deploy falhar **após** a migração, reverter primeiro o código/Worker para a versão anterior. Como as tabelas são aditivas, normalmente podem permanecer sem afetar as funcionalidades antigas; **não executar DROP TABLE** como rollback automático.
- Se houver problema com dados ou migração, suspender novas alterações e avaliar restauração do backup verificado, considerando o impacto em registros criados após o backup. A restauração pode causar perda de alterações posteriores; requer decisão explícita.
- Nunca executar comandos de escrita no banco de produção em um workflow de inspeção; manter migração e deploy em procedimentos separados, manuais e auditáveis.

## 4. Evidências

- Inspeção remota inicial: https://github.com/pauloalbertoofc-hue/sorteador-universal/actions/runs/42541049684
- Pré-produção isolada: https://github.com/pauloalbertoofc-hue/sorteador-universal/actions/runs/42540304572
- Teste HTTP de homologação: https://github.com/pauloalbertoofc-hue/sorteador-universal/actions/runs/42539982879
- Bateria completa de qualidade (Node 24.14 + Chromium + testes móveis), aprovada: https://github.com/pauloalbertoofc-hue/sorteador-universal/actions/runs/42543477855
- Correção de dependências aplicada: https://github.com/pauloalbertoofc-hue/sorteador-universal/actions/runs/42542550316
- Inspeção remota D1 de produção, aprovada: https://github.com/pauloalbertoofc-hue/sorteador-universal/actions/runs/42543969138
- Auditoria de dependências, 0 vulnerabilidades: https://github.com/pauloalbertoofc-hue/sorteador-universal/actions/runs/42544022209

**Status:** somente preparação; nenhuma migração nem publicação de produção autorizada ou executada.
