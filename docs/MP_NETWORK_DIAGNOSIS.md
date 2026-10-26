# Relatório técnico — Node versus curl e integração Mercado Pago

Branch: feat/mercadopago-recurring. PR informado: #2.
Base: 65c631240f08dcdd83110138df74dfa561ac4b8b; árvore inicialmente limpa e
branch remota sem commits adicionais no início desta tarefa.

**1. Evidências e diagnóstico.** O responsável confirmou localmente HTTP 200
num GET autenticado /preapproval_plan/search?limit=1 com curl.exe e token de
produção. Essa evidência foi aceita; não se presume que o token esteja inválido.
Não há MP_ACCESS_TOKEN injetado nesta máquina, portanto essa consulta autenticada
não foi repetida aqui e o ID real do plano continua não confirmado.

Na máquina desta execução, com Node 24.19.0 e variáveis HTTP_PROXY/HTTPS_PROXY
presentes, o mesmo caminho de leitura, SEM Authorization, produziu:
- curl: tentativa de túnel pelo proxy, recusada com CONNECT HTTP 403;
- fetch nativo padrão: acesso direto, falha DNS EAI_AGAIN;
- fetch após ativar o suporte nativo a proxy: tenta o proxy e encontra o bloqueio
  de saída existente, agora classificado como proxy_rejected/403.

O script anterior não ativava o suporte do fetch às variáveis de proxy e seu
catch convertia qualquer causa em network_error, descartando DNS, certificados,
timeout e erro de túnel. Isso é um defeito de transporte/diagnóstico demonstrado
neste ambiente. **Não comprova que o Windows do responsável tenha exatamente
a mesma falha**: curl.exe e Node também podem diferir em cadeia de certificados,
regras de firewall/antivírus, DNS/IPv6 ou processo/configuração de proxy.
O novo diagnóstico permite distinguir essas causas sem expor credenciais.

HTTP 200 em search não comprova acesso a users/me ou a cada detalhe de plano.
Se esses endpoints negarem acesso, agora há stage=identity/search/plan_detail
e http_status em erros 401/403. Falha de transporte não é erro de token nem
prova de inexistência do plano.

**2. Correção de transporte.** As duas CLIs administrativas inicializam
http.setGlobalProxyFromEnv antes das requisições e restauram os agentes ao sair.
Respeitam HTTP_PROXY, HTTPS_PROXY, versões minúsculas, NO_PROXY e fallback
ALL_PROXY para URLs HTTP/HTTPS. Não seguem redirects autenticados. Proxy SOCKS
ou URL inválida recebe erro explícito, sem imprimir URL, usuário ou senha.
Não há fallback para curl com o token na linha de comando.

Foi consultada a documentação oficial Node 24:
- https://nodejs.org/docs/latest-v24.x/api/http.html#httpsetglobalproxyfromenvproxyenv
- https://nodejs.org/docs/latest-v24.x/api/http.html#built-in-proxy-support
- https://nodejs.org/docs/latest-v24.x/api/cli.html#--use-system-ca

setGlobalProxyFromEnv foi adicionado em Node 24.14.0. O modo de proxy automático
da ferramenta requer essa versão ou superior. Em runtime antigo com proxy,
a CLI orienta atualizar em vez de ignorar silenciosamente a configuração. Sem
proxy, o fluxo direto permanece disponível em runtime com fetch suportado.
Não foi adicionada dependência npm ou alteração no Worker para resolver a rede
do computador administrativo.

**3. Erros seguros.** A classificação percorre cause/AggregateError com limites
e usa códigos permitidos, sem serializar mensagens brutas ou stacks:
- dns_error: EAI_AGAIN/ENOTFOUND;
- network_timeout: timeout de conexão/headers/body e cancelamento;
- connection_error: conexão recusada/interrompida/sem rota;
- tls_error: cadeia, emissor, validade ou nome do certificado;
- proxy_rejected: HTTP numérico de CONNECT reconhecido no erro do Undici;
- proxy_invalid/proxy_unsupported/proxy_runtime_unsupported;
- network_error: transporte não classificado, sem afirmar token inválido.

O JSON pode conter versão Node, etapa, códigos conhecidos e booleanos sobre
proxy/CA extra/CA do sistema/NO_PROXY. Não inclui token, proxy URL, caminho de
certificado, perfil, plano bruto, senha, cabeçalho ou corpo de erro do provedor.
A validação TLS permanece obrigatória. O runtime rejeita
NODE_TLS_REJECT_UNAUTHORIZED=0. Certificados corporativos precisam de uma fonte
de confiança aprovada, não de desligamento da verificação. Um timeout enquanto
o corpo JSON é recebido também é diagnosticado como transporte.

**4. Arquivos modificados.**
- scripts/lib/mp-admin-transport.mjs: bootstrap de proxy, classes de erro,
  sanitização de causas e probe sem credencial.
- scripts/check-mp-network.mjs: npm run billing:network-check.
- scripts/find-mp-plan.mjs e scripts/verify-mp-plan.mjs: inicialização/restauração
  do transporte na CLI.
- scripts/lib/mp-plan-admin.mjs: diagnóstico de transporte e etapa de negação HTTP.
- tests/mp-admin-transport.test.mjs: unitários e integração local real de TLS/proxy.
- package.json: novo comando e checks sintáticos.
- README.md, MP_PLAN_DISCOVERY.md e este relatório: instruções atualizadas.

Worker, frontend, migrations, IDs D1, MP_PLAN_ID e BILLING_ENABLED não foram
alterados. Nenhum banco remoto ou configuração Cloudflare foi modificado.

**5. Diagnóstico sem token.**

```sh
npm run billing:network-check
```

Executa somente GET /preapproval_plan/search?limit=1, sem Authorization mesmo se
MP_ACCESS_TOKEN existir no ambiente. Descarta o corpo. http_response significa
que houve resposta HTTP; não confirma autenticação, identidade do respondente,
compatibilidade do plano ou checkout. Um 401 é esperado se o provedor exigir
autenticação. Um proxy_rejected/403 significa resolver a política/túnel de saída,
não trocar ou expor o token.

Na máquina atual esse comando efetivamente retornou proxy_rejected, status 403.
A correção torna os clientes consistentes quanto à escolha do proxy; não remove
um bloqueio externo de rede. É necessário permitir api.mercadopago.com no proxy
aprovado ou executar a ferramenta onde o curl autenticado já funcionou.

**6. Localização do plano.** O mecanismo de descoberta anterior é preservado:
GET users/me; catálogo paginado por limit/offset; GET de cada detalhe; único
compatível; nova consulta antes de retornar preapproval_plan_id. Valida vendedor,
aplicação 4465213801165623, nome Sorteador Universal Pro, R$4,90, BRL, mensal,
status ativo, ausência de trial/repetições finitas/rateio. Compara a referência
SORTEADOR-PRO-MENSAL quando retornada. Não deduz ID do código/link abreviado.
Ambiente explícito, testes de identidade e limites de busca são mantidos.
Ver MP_PLAN_DISCOVERY.md para critérios e limitações de campos opcionais.

Com MP_ACCESS_TOKEN já injetado de forma segura no PROCESSO Node, em PowerShell:

```powershell
node --version
npm run billing:network-check
$env:MP_ENVIRONMENT = 'production'
npm run billing:find-plan
```

Não é necessário reenviar o token ao chat. Se o token estiver apenas em uma
variável de sessão usada no curl, ele precisa ser disponibilizado por ambiente
ao processo Node de forma segura. Não colocar Authorization ou token como
argumento do comando, não salvar em arquivo versionado e não usar transcrição
ou tracing de sessão contendo valores sensíveis.

Se e SOMENTE se a saída for found, usar manualmente o ID confirmado na variável
local de verificação (não na configuração de produção):

```powershell
$env:MP_PLAN_ID = 'ID_CONFIRMADO_PELA_API'
npm run billing:verify-plan
```

Retorno not_found/ambiguous/incomplete não autoriza escolher o primeiro resultado
ou afrouxar critérios. O HTTP 200 isolado informado não trouxe um ID para esta
máquina, e não se inventou um.

**7. Certificados e Windows.** Se o novo erro for tls_error, confira a cadeia,
validade e inspeção HTTPS. curl.exe com Schannel pode confiar no repositório de
certificados Windows, enquanto o Node pode estar usando só suas CAs padrão.
Quando a organização já confia na CA do sistema, uma opção suportada é:

```powershell
node --use-system-ca scripts/find-mp-plan.mjs
```

Outra opção, com certificado PEM aprovado e íntegro fornecido pela organização,
antes de iniciar o processo Node:

```powershell
$env:NODE_EXTRA_CA_CERTS = 'C:\caminho\CA-aprovada.pem'
npm run billing:find-plan
```

Não copiar certificados de fontes desconhecidas. SSL_CERT_FILE sozinho não deve
ser presumido equivalente a NODE_EXTRA_CA_CERTS ou --use-system-ca no Node.
As URLs de proxy devem vir da configuração aprovada; não alterar NO_PROXY para
contornar políticas. A ferramenta não imprime os valores dessas variáveis.

**8. Auditoria do fluxo comercial.** Foi revisado o código existente, sem mudar
as operações financeiras nesta tarefa:
- checkout exige usuário, flag, plano e vendedor; grava intenção, serializa por
  usuário e reconcilia resposta ambígua, sem criar plano duplicado;
- redirect usa init_point individual validado; retorno de URL não concede Pro;
- assinatura, invoice e pagamento canônico são consultados antes de autorização;
- plano, vendedor, titular, valor BRL 4,90, periodicidade e validade são conferidos;
- assinatura authorized local não basta para GET/POST listas;
- webhook HMAC, deduplicação e reconciliação de recurso atual são preservados;
- cancelamento interrompe a recorrência e conserva apenas tempo pago verificado;
- falhas, estorno/reembolso, vencimento e inconsistências bloqueiam o benefício.

As regressões verificam esses caminhos com mocks no runtime Workers e Chromium.
Isso comprova comportamento implementado/local, NÃO que a conta real aceite
pending com plano associado ou que o histórico continue visível após cancelamento.
Nenhuma dessas operações foi executada contra a API real nesta tarefa.

**9. Testes e evidências.** A suíte de transporte inclui um subprocesso CLI real,
proxy HTTP CONNECT local e origem HTTPS local que simula api.mercadopago.com.
Um certificado efêmero com SAN correto é criado só para o teste e confiado via
NODE_EXTRA_CA_CERTS no subprocesso. A verificação TLS fica habilitada; nenhuma
chave é commitada. O proxy não recebe Bearer; só a origem após o túnel/TLS o
recebe. A CLI encontra um plano SINTÉTICO único, sem vazar token ou perfil.
Outro teste de processo confirma a sanitização de um CONNECT 403.

Os testes locais de TLS exigem OpenSSL com req -addext, além de Node 24.14+;
a suíte de navegador mantém a necessidade de Chromium. A ferramenta em si não
precisa de OpenSSL nem de curl. Dados/chaves desses testes são temporários e
removidos. Nenhum tráfego financeiro real é gerado por essa integração local.

Os testes novos cobrem proxy/env/precedência/NO_PROXY/ALL_PROXY, configuração
inválida/SOCKS, runtime antigo, TLS obrigatório, DNS, timeout, conexão recusada,
CONNECT 403/407, ausência de token no probe, erro de body e etapa de HTTP 403.
A suíte anterior cobre descoberta e todo o fluxo de autenticação, cobrança,
cancelamento, listas, publicidade e PWA com provedor simulado.

```sh
CHROMIUM_PATH=/usr/bin/chromium npm test
npm run check
```

Resultado final: **89 testes aprovados, zero falhas e zero ignorados**: 12 de
transporte, 25 administrativos e 52 regressões de autenticação/cobrança/PWA.
Check sintático e git diff --check aprovados. Commit e situação do envio/PR
são registrados no chat.
Probe externo real: falha de proxy 403, sem autenticação. Consulta autenticada
real: não executada nesta máquina por falta de token e bloqueio de saída.

**10. Pendências e próximos passos.** Executar a CLI atualizada no mesmo Windows
onde curl.exe retornou 200, com Node compatível e a mesma credencial segura no
ambiente; comparar o diagnóstico sanitizado. Resolver proxy/CA conforme o código,
sem revalidar ou expor o segredo desnecessariamente. Se a rede responder mas
users/me ou detalhe der 401/403, conferir o escopo específico da credencial.
Quando found, verificar o ID e registrar apenas o resultado não sensível.
Depois planejar homologação de checkout/webhook/cancelamento com recursos e
credenciais de teste aprovados. Nenhum teste simulado autoriza cobranças reais.

Ainda não verificados: plano real e seu ID, compatibilidade real de criação
pending+plano, checkout hospedado, pagamento, webhook, renovação e estorno reais,
configuração efetiva de produção e resultado de builds externas.
BILLING_ENABLED=false permanece versionado; não houve migrations remotas,
merge, deploy de produção, criação de plano, assinatura ou cobrança real.

**11. Continuidade e GitHub.** As mudanças seguem na feat/mercadopago-recurring,
associada ao PR #2 informado. Conferir o SHA remoto e a consulta de checks no
relatório do chat. Não alterar produção com base no sucesso do proxy de teste.
A API GitHub pode continuar bloqueada, independentemente do push via Git.
