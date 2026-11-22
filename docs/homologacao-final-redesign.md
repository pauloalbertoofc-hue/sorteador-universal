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

## Critérios de bloqueio

Não mesclar se houver erro de login/segundo fator, perda de variáveis de ambiente, regressão de sorteios, falha de consentimento, quebra de rotas SEO ou divergência relevante entre mobile e desktop. Se qualquer teste manual falhar, registrar **rota, tema, dispositivo, ação e resultado observado**, sem anexar senhas, tokens ou códigos.

## Liberação

Manter PR em rascunho até revisão. Não usar credenciais reais em logs, não efetuar cobrança real e não alterar Amigo Secreto. Após autorização e aprovação, registrar SHA publicado e validar produção; se houver regressão, avaliar reversão do merge.
