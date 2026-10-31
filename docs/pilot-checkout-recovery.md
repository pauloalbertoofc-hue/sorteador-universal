# Recuperação manual da tentativa piloto (31/10/2026)

**Não é migração automática.** Este arquivo é específico para a tentativa `426e9c76-1ed6-4d7c-969c-fc3ff6545f3a` e **não deve ser executado por deploy ou CI**.

1. Manter `BILLING_MODE=pilot` e **não clicar em Assinar Pro** durante a reconciliação. Executar imediatamente antes da operação `npm run billing:reconcile-readonly` com credenciais de produção. Exigir `verified_read_only`, `search_counts:[0,0,0]` e `related_subscriptions:0`. Se houver erro, abortar.
2. Conferir no Mercado Pago assinaturas e pagamentos recentes da conta; uma busca sem resultados **não prova** que um POST ambíguo nunca será processado. Se houver dúvida, abrir chamado no Mercado Pago e não executar a recuperação.
3. Fazer backup do D1 (Cloudflare D1 Time Travel/bookmark) e confirmar que o usuário ainda não tem assinatura e que o checkout ainda está em `creating`, sem `provider_id`, com mesmo `attempt_id` e timestamps.
4. Revisar `scripts/manual-pilot-checkout-recovery.sql`. O SQL arquiva o registro antes de tentar removê-lo; usa correspondência exata, ausência de assinatura e ausência de lock ativo. Rodar **uma única vez** no banco de produção com `wrangler d1 execute sorteador-universal-db --remote --file=scripts/manual-pilot-checkout-recovery.sql` somente após autorização do responsável.
5. Exigir no resultado `archived=1` e `still_blocked=0`. Caso contrário, parar e investigar; não tentar checkout. Verificar que `billing_checkout_recovery_audit` contém o histórico. Se ocorrer falha entre arquivar e remover, o estado de checkout permanece protegido.
6. Antes de testar novo checkout, fazer nova conferência de assinaturas no provedor. O primeiro POST subsequente poderá iniciar uma assinatura real. O valor e os dados de cobrança devem ser confirmados pelo titular no checkout do Mercado Pago. Não liberar `BILLING_MODE=public` sem decisão separada.

O arquivo não corrige a causa raiz da resposta HTTP 502 original. O PR de diagnóstico de status HTTP deve ser revisado separadamente para futuras tentativas. Nenhuma recuperação elimina totalmente a possibilidade de processamento tardio de uma requisição ambígua.
