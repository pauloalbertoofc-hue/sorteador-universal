# Amigo Secreto — identidade progressiva e modos de distribuição

Status: especificação para implementação; **não** descreve funcionalidades já disponíveis.

## Princípios
- Ferramentas públicas continuam sem login obrigatório.
- Conta permanente existente (cookie HttpOnly `su_session`, endpoint `/api/me`) é reutilizada para organizadores; não criar autenticação paralela.
- O organizador autenticado poderá criar e gerenciar seus eventos, sem acesso implícito aos resultados no modo protegido.
- Participante convidado pode acessar o resultado sem conta permanente, mas **nome sozinho não autentica ninguém**.
- O organizador escolhe o modo antes do sorteio. Não permitir alternar o modo após distribuição sem revogar credenciais anteriores.

## Modo A — links distribuídos pelo organizador
- Compatível com o fluxo atual: o criador recebe links individuais e os envia.
- Aviso claro: qualquer portador do link, inclusive o organizador, pode abrir o resultado.
- Não chamar este modo de "invisível ao organizador".

## Modo B — convite geral com acesso individual protegido
- Organizador cadastra participantes e define, por canal privado, uma credencial individual de uso único para cada pessoa; a aplicação nunca deve exibir ao organizador tokens de revelação.
- Participante abre o convite geral, escolhe seu nome e comprova posse da credencial antes de receber uma sessão temporária limitada ao próprio evento e participante.
- O nome, sozinho, não concede acesso. Evitar PIN curto sem limitação forte de tentativas; preferir segredo aleatório de alta entropia entregue por canal individual, ou identidade autenticada verificada.
- A credencial de ingresso deve ser distinta da credencial de revelação. Após resgate, revogar ou consumir a primeira, emitir sessão curta e armazenar somente hashes no D1.
- Não incluir resultado, token ou credencial em query string, analytics, logs ou mensagens públicas; usar cache-control no-store e referrer-policy no-referrer.
- Limitar tentativas por evento, participante e origem; expirar sessões e permitir revogação.
- O sistema não pode garantir segredo se o organizador conhece ou intercepta as credenciais entregues aos participantes. Documentar explicitamente esse limite.

## Mudanças de dados/API planejadas
- Nova migração versionada, **não alterar 0007 já aplicada em produção**: vincular evento ao user_id, armazenar mode, credenciais de ingresso e sessões temporárias/revogação.
- Criação exige `auth(req,env)` e vínculo com usuário, sem permitir que o cliente escolha `user_id`.
- Endpoints autenticados de listagem/gestão exibem somente metadados e status, jamais pares sorteados nem hashes/tokens.
- Endpoints de ingresso e revelação validam modo, expiração, autorização e proteção contra enumeração.
- Preservar eventos legados no modo A, sem forçar migração de convites já emitidos.

## Critérios de aceite
1. Visitante navega e sorteia nas ferramentas públicas sem login.
2. Organizador entra pelo ícone discreto e vê eventos próprios, não os de terceiros.
3. Modo A distribui links e informa o risco de o organizador poder revelá-los.
4. Modo B impede acesso por nome apenas, token inválido, expirado, reutilizado ou de outro evento.
5. Dois navegadores isolados não conseguem revelar resultados um do outro.
6. Todos os participantes recebem exatamente um destinatário e ninguém tira a si mesmo.
7. Página pública indexável; links com fragmentos privados não aparecem no sitemap.
8. Testes em D1 local/preview antes de qualquer migração em produção.
