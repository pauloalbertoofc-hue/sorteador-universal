# Correção do contrato Mercado Pago — decisão de integração

## Defeito confirmado
O Worker atual faz POST /preapproval com preapproval_plan_id + status=pending, sem card_token_id. A documentação do Mercado Pago exige card_token_id e status=authorized para assinatura associada a plano. A modalidade pending documentada usa assinatura sem plano, com auto_recurring explícito. O frontend não recebe checkout_url porque a criação falha antes do redirecionamento.

## Alternativas compatíveis
A. **Checkout hospedado do plano (preferida para experiência simples)**: GET /preapproval_plan/{MP_PLAN_ID}, validar seller, preço BRL 4,90 e frequência mensal; usar init_point HTTPS confiável com preapproval_plan_id. Não emitir POST /preapproval ao clicar. O retorno do navegador **não comprova** assinatura. A vinculação de pagamento à conta local requer mecanismo confiável: identidade do pagador verificada no Mercado Pago e correspondência com conta local, confirmação do webhook e consulta autenticada ao provedor. Se não houver identidade inequívoca, não liberar Pro automaticamente.
B. **Assinatura com plano via API**: tokenização do cartão no navegador com SDK oficial, consentimento explícito, POST /preapproval com card_token_id e status authorized; nunca receber PAN/CVV no Worker. Exige UI/SDK e testes completos.
C. **Sem plano + pending**: remover preapproval_plan_id, enviar auto_recurring (mensal, BRL 4,90), validar que a recorrência do objeto coincide; refatorar busca de recuperação, owned(), webhooks, e verificação de preço. Exige migração deliberada, não uma alteração isolada.

## Critérios obrigatórios antes de deploy
- Nunca fazer um novo POST enquanto billing_checkout estiver em creating sem reconciliação independente.
- Não aceitar retorno ?billing=return, URL ou status de assinatura como comprovante de pagamento; consultar cobrança e pagamento aprovado no provedor.
- Não ativar Pro se identidade da assinatura não puder ser vinculada com segurança à conta local.
- Testar redirecionamento, assinatura pendente, pagamento aprovado/recusado, renovação, cancelamento, webhook duplicado, e assinatura de outra conta.
- Manter BILLING_MODE=pilot até homologação real e aprovação explícita.

## Documentação
- https://www.mercadopago.com.br/developers/pt/docs/subscriptions/integration-configuration/subscription-associated-plan
- https://www.mercadopago.com.br/developers/pt/docs/subscriptions/integration-configuration/subscription-no-associated-plan/pending-payments
- https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/get-preapproval-plan/get

Este documento não altera o comportamento de produção nem autoriza pagamentos.
