# Sorteador Universal 2.5 — plano de publicação controlada

**Estado em 09/11/2026:** homologação HTTP e bateria completa de qualidade **aprovadas no commit `92ab6364`** (execução #42543477855, incluindo testes Node, Chromium e navegador móvel). A inspeção remota **repetida e aprovada** #42543969138 confirmou as oito tabelas de negócio existentes e `d1_migrations`, ausência das três tabelas de salas, e histórico somente com `0001_sessions.sql` e `0002_billing_safety.sql`. **Não há autorização para migração ou deploy de produção neste documento.**

## 1. Portões obrigatórios

1. **Concluído em `a6d243d7` (#42543969138):** inspeção remota somente leitura confirmou banco correto, tabelas base e histórico coerente, sem estado parcial. Reconfirmar na janela de mudança se houver qualquer alteração intermediária.
2. Executar **Production rooms preflight (read-only)** no commit atual. A bateria automatizada geral já passou em #42543477855, mas isso não substitui a inspeção do banco remoto nem a checagem de prontidão para publicação.
3. Executar [Dependency security audit (read-only)](https://github.com/pauloalbertoofc-hue/sorteador-universal/actions/workflows/dependency-security-audit.yml) na branch `main`, baixar o relatório de artefatos e revisar cada pacote afetado. **Concluído em `a6d243d7` (#42544022209):** `npm audit` reportou **0 vulnerabilidades** (informativas, baixas, moderadas, altas e críticas). Correção de dependências aplicada no commit `0e0f83dc`.
4. Validar manualmente a interface em celular e desktop: criação, convite, inscrição, limite, fechamento, expiração, mensagens de erro e acessibilidade.
5. Criar e **verificar um backup recuperável do D1 de produção** por mecanismo oficial Cloudflare antes de qualquer alteração. Registrar horário, identificador do backup e procedimento de restauração em local privado. Nunca anexar um dump de usuários ou pagamentos a logs ou artefatos públicos do GitHub.
6. Aprovação humana explícita para a janela de mudança, com responsável disponível para acompanhar erros, logs e reversão.

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
