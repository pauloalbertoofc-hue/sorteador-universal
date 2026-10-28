> Atualização de transporte: as CLIs usam proxy nativo e diagnósticos sanitizados;
> consulte [MP_NETWORK_DIAGNOSIS.md](MP_NETWORK_DIAGNOSIS.md) se curl funcionar e Node falhar.

# Relatório técnico — descoberta administrativa do plano Mercado Pago

Repositório: pauloalbertoofc-hue/sorteador-universal.
Branch: feat/mercadopago-recurring. PR informado: #2.
Base desta alteração: 71164517bd68a61b82c30ee53d0dbb9b0c8ad074.

**Estado:** ferramenta implementada e testada com respostas simuladas. Não foi
possível identificar o MP_PLAN_ID real: MP_ACCESS_TOKEN não está disponível no
ambiente. A tentativa de execução real parou em missing_credentials ANTES de
qualquer requisição. Isso não significa que o plano não exista.

**1. Endpoints oficiais e investigação.**
- GET https://api.mercadopago.com/users/me: identidade da credencial.
- GET https://api.mercadopago.com/preapproval_plan/search: pesquisa paginada.
- GET https://api.mercadopago.com/preapproval_plan/{id}: detalhe de cada plano.

Foram consultados o pacote oficial mercadopago 3.6.1 e os arquivos oficiais
PreApprovalPlan.search/types e sua implementação no GitHub. O SDK documenta
q (texto livre), status, sort, criteria, limit e offset. Não documenta filtros
específicos por external_reference, collector_id ou application_id nessa
interface; não foram inventados. O script percorre o catálogo acessível com
limit/offset e valida o vendedor no detalhe, sem presumir que q busca código de
referência ou que pesquisar apenas active detectaria todas as inconsistências.

Referências:
- https://github.com/mercadopago/sdk-nodejs/blob/master/src/clients/preApprovalPlan/search/index.ts
- https://github.com/mercadopago/sdk-nodejs/blob/master/src/clients/preApprovalPlan/search/types.ts
- https://github.com/mercadopago/sdk-nodejs/blob/master/src/clients/preApprovalPlan/commonTypes.ts
- https://www.mercadopago.com.br/developers/pt/reference/subscriptions/_preapproval_plan_search/get

O site de documentação retornou HTTP 403; o código-fonte público do SDK foi
acessado com sucesso. Não se confundem essas consultas públicas com acesso
à conta real. Um GET público, sem credencial e sem seguir redirects, foi tentado em
https://mpago.la/2MRWxgi e bloqueado pelo proxy com CONNECT HTTP 403. Não houve
resolução do destino nem transformação do link em ID. O código 2MRWxgi não é tratado como preapproval_plan_id.

**2. Autenticação e segurança.** MP_ACCESS_TOKEN vem exclusivamente da variável
de ambiente. Só é enviado no header Authorization: Bearer para o host fixo
api.mercadopago.com. O cliente permite apenas os três caminhos GET listados,
sem método configurável, corpo de requisição ou URL arbitrária. Não segue
redirects; mantém verificação TLS. Timeout por requisição de até 8 segundos,
orçamento total de dois minutos, dez páginas de até 50 registros, máximo 500
planos. Não usa credenciais para abrir o link público.

Erros HTTP, JSON inválido e exceções são convertidos em códigos/mensagens
controlados. Não há dump de perfil, catálogo, headers, corpo de erro, token,
senha, e-mail ou ID do vendedor. Nenhuma credencial é salva em arquivo.

**3. Arquivos.**
- scripts/find-mp-plan.mjs: CLI de descoberta, npm run billing:find-plan.
- scripts/verify-mp-plan.mjs: CLI existente aprimorada, mesma validação compartilhada.
- scripts/lib/mp-plan-admin.mjs: cliente GET, identidade, paginação, critérios e erros seguros.
- tests/mp-plan-admin.test.mjs: cenários de descoberta, incompatibilidade e segurança.
- package.json: comando novo e ampliação do check sintático.
- README.md e este relatório: instruções e estado de homologação.

Worker, frontend, configuração de produção/prévia, MP_PLAN_ID e migrations não
foram alterados. BILLING_ENABLED=false permanece nos dois ambientes.

**4. Funcionamento.** Valida configuração e ambiente; consulta /users/me;
percorre completamente as páginas, recusando total variável, IDs repetidos,
página vazia antes do fim e catálogo acima dos limites. Busca individualmente
o detalhe de TODOS os resultados, pois o resumo pode omitir campos. Se algum
detalhe necessário estiver incompleto, não afirma identificação inequívoca.
O candidato único é consultado novamente antes da saída, para detectar mudança
de status/termos durante a operação. Não há snapshot transacional da API:
a identificação descreve o catálogo observado, não garante que ele não mude
após a última consulta. Revalidar antes de usar o ID em uma release.

Saídas JSON:
- found: único compatível; inclui preapproval_plan_id, ambiente, scanned e evidências.
- not_found: nenhum compatível; inclui contagem de incompatíveis e códigos de motivo.
- ambiguous: mais de um compatível; inclui contagem, sem escolher/expor um ID.
- erros: code e message sanitizados; não inclui resposta bruta do provedor.

Exit codes: 0 para found/verified; 2 para not_found/ambiguous; 1 para erro,
credencial ausente, limite ou inconsistência. Não inicia automaticamente a
validação, compra ou atualização de configuração de produção.

**5. Identificação inequívoca e verificação completa.** Requer simultaneamente:
- ID técnico de plano com formato de 32 caracteres hexadecimais;
- collector_id igual à identidade autenticada;
- application_id igual a 4465213801165623;
- reason igual a Sorteador Universal Pro, normalizando apenas caixa/espaços/NFC;
- status active;
- valor numérico exato 4,90, moeda BRL, frequency 1 e frequency_type months;
- ausência de free_trial; ausência/null de repetitions e end_date;
- ausência de cobrança inicial proporcional;
- external_reference igual a SORTEADOR-PRO-MENSAL, SE esse campo for retornado;
- live_mode coerente com o ambiente solicitado, SE esse campo for retornado.

O SDK não declara external_reference nem live_mode no modelo de plano consultado.
Por isso o script não presume sua presença, não inventa filtros e retorna
reference_checked/live_mode_checked. false significa NÃO verificado por esse
campo; a identidade usa os outros critérios e unicidade do catálogo. Se aparecer
uma referência diferente, o candidato é recusado. Valor repetitions=0 não é
assumido como ilimitado sem semântica confirmada: é recusado conservadoramente.

Application ID (4465213801165623), código SORTEADOR-PRO-MENSAL, URL mpago.la e
preapproval_plan_id têm papéis distintos. Nenhum é convertido no outro.
verify-mp-plan agora reutiliza exatamente esses critérios, inclusive aplicação,
nome/referência, duração e ambiente, em vez de validar só preço e vendedor.

**6. Teste versus produção.** MP_ENVIRONMENT=test ou production é obrigatório.
A ferramenta confere a marca test_user em users/me.tags: modo test exige conta
de teste; modo production recusa conta de teste. Tags ausentes/inválidas não
são presumidas como produção. Também recusa prefixo TEST- quando o operador
seleciona production e verifica live_mode do plano quando presente.

IMPORTANTE: essas verificações NÃO provam isoladamente o modo efetivo de todas
as modalidades de credencial da API. APP_USR não é usado para concluir que a
conta é real; contas de teste também podem ter credenciais de aparência similar.
O resultado informa environment (selecionado pelo operador), environment_evidence
(account_tags) e live_mode_checked. Sem live_mode, a evidência é o tipo de conta,
não uma prova de autorização para cobrança produtiva. Nenhuma cobrança é feita
em qualquer um dos modos.

Planos de uma conta real não devem ser presumidos acessíveis por credenciais
de outro usuário de teste. Mesmo uma credencial de teste da aplicação pode ter
escopo/visibilidade diferente conforme a API/conta. Não foi possível verificar
essa combinação real aqui. 401/403, 404 ou catálogo vazio não demonstram que o
plano inexista na conta produtiva: indicam somente o resultado para a credencial
usada. Não existe fallback automático de credencial de teste para produção.

Procedimento seguro: localizar o plano existente com credencial produtiva da
conta correta, somente GET, verificar o resultado e não iniciar contratação.
Para homologar pagamentos posteriormente, usar conta/credenciais e recursos de
teste efetivamente compatíveis e autorizados. Conferir se existe plano de teste
adequado. Se não existir ou exigir outra aplicação, registrar a necessidade de
uma decisão separada: não criar plano, não alterar o Application ID esperado e
não contornar o bloqueio automaticamente. Consultar o plano real não exige
habilitar cobrança, aplicar migrations ou publicar Worker.

**7. Testes.** Há 25 cenários administrativos simulados: encontrado, inexistente,
ambíguo, referência ausente/diferente, conta/credencial/ambiente incompatível,
paginação completa/incompleta, duplicação de IDs, limite de catálogo, valor,
moeda, frequência/unidade, trial, duração limitada/indefinida ambígua, rateio,
vendedor/aplicação/nome/status, detalhe/identidade incompletos, 401/403/404,
500/429/redirect, erro de rede, JSON inválido, plano alterado durante leitura,
validação compartilhada e CLI sem vazamento de credencial. Cada mock confere
método GET, host, header, ausência de body e redirect manual.

As 52 regressões de autenticação, cobrança, cancelamento, PWA e configuração
foram preservadas. Seus POST/PUT financeiros são interceptados por mocks em
workerd; não são chamadas reais ao Mercado Pago. **Resultado final: 77 testes
aprovados, zero falhas e zero ignorados** (25 novos e 52 regressões), além do
check sintático aprovado. O SHA do push consta do relatório de entrega no chat.

```sh
CHROMIUM_PATH=/usr/bin/chromium npm test
npm run check
```

O teste de CLI sem configuração real retornou missing_credentials/exit 1 antes
de tocar a rede. Isso é um pré-requisito externo ausente, não falha da suíte.

**8. Execução segura pelo responsável.** Usar Node 24 e ambiente privado. Preferir
injeção por gerenciador de segredos, sem gravar token no repositório. Em Bash
interativo, uma alternativa com entrada oculta (não executar sob set -x):

```sh
read -r -s -p 'Access Token (entrada oculta): ' MP_ACCESS_TOKEN
printf '\n'
export MP_ACCESS_TOKEN
export MP_ENVIRONMENT=production
npm run billing:find-plan
```

Escolher production apenas se essa for a credencial/conta real pretendida para
leitura; para uma conta de teste compatível, escolher test. Não usar uma chave
real em um serviço/dispositivo público nem compartilhá-la no chat.

Somente se a saída for found, copiar MANUALMENTE o preapproval_plan_id exibido
para a variável local MP_PLAN_ID e executar a verificação, por exemplo:

```sh
# Substituir o marcador abaixo pelo ID confirmado, nunca por Application ID/URL:
export MP_PLAN_ID='ID_CONFIRMADO_PELA_CONSULTA'
npm run billing:verify-plan
unset MP_ACCESS_TOKEN
```

Executar unset mesmo após erros, ao encerrar a sessão administrativa. O ID do
plano é configuração, não é o Access Token. Os comandos não editam wrangler,
secrets Cloudflare, MP_PLAN_ID de produção, banco ou BILLING_ENABLED.

**9. Identificador real.** Não encontrado/verificado nesta execução por ausência
de credencial. Nenhum ID candidato sintético dos testes é apresentado como real.
SORTEADOR-PRO-MENSAL e 2MRWxgi permanecem apenas dados conhecidos, sem inferência
de um ID técnico. Nenhum plano foi criado para suprir essa ausência.

**10. Limitações.** Documentação web e link público bloqueados com 403; visibilidade real entre ambientes não
verificada; campos opcionais explicitamente não confirmados; identificação exige
nome e aplicação conhecidos e não faz correspondência aproximada. Se o produto
foi cadastrado com outro nome, outra aplicação ou campos omitidos, o operador
precisa conferir o painel/API de forma segura antes de revisar critérios.
Catálogo acima de 500 planos ou consulta acima de dois minutos falha fechada;
não retorna um ID com base só no primeiro lote. Se houver bloqueio de saída, conferir a permissão de rede para api.mercadopago.com
sem desativar TLS; erro de proxy não prova credencial inválida. Nenhum resultado GET garante
que checkout/webhook/cancelamento/renovação reais já estejam homologados.

**11. Git/PR.** O trabalho fica na branch existente do PR #2, sem merge. O relatório
de entrega registra commit, confirmação do ref remoto e tentativa de consultar
o PR/checks. Se a API GitHub continuar Forbidden, a atualização do código da
branch pode ser confirmada por git ls-remote, mas não o resultado dos checks.

**12. Próximos passos para outro ChatGPT.** Ler este relatório, conferir git log
na feat/mercadopago-recurring e o SHA remoto. Não refazer autenticação/cancelamento.
Solicitar apenas configuração segura da variável MP_ACCESS_TOKEN no ambiente
apropriado, não seu valor no chat. Selecionar MP_ENVIRONMENT conscientemente;
rodar billing:find-plan; tratar found/ambiguous/not_found/erro sem adivinhar IDs.
Se único, rodar billing:verify-plan com o ID local e registrar só os resultados
não sensíveis. Manter BILLING_ENABLED=false e não modificar D1/configuração de
produção. Homologação de operações financeiras é uma etapa separada, não está
autorizada por esta tarefa administrativa de leitura.
