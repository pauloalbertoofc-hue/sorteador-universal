# Amigo Secreto — modelo aprovado de identidade e privacidade

Status: especificação de implementação. **Não publicar o fluxo anterior de códigos por organizador como se fosse modo privado.**

## Duas decisões independentes

1. **Organizador decide a visibilidade do sorteio** antes de iniciá-lo:
   - **Sigiloso (padrão)**: o organizador não pode revelar nem recuperar os pares. O backend não deve emitir a ele credenciais de revelação ou códigos que permitam reivindicar participantes.
   - **Supervisionado**: o organizador pode consultar os pares, desde que a permissão seja exibida aos convidados **antes** de aderirem. Congelar a escolha após adesões ou exigir novo consentimento para mudança.
2. **Cada convidado decide como entrar**, independentemente da escolha do organizador:
   - **Com conta**: sessão permanente do Sorteador Universal; associação verificada à vaga de participante.
   - **Como convidado**: informa nome e recebe uma credencial/sessão temporária individual, sem cadastro permanente. **Nome não é autenticação**.

## Experiência tipo Google Meet

- Organizador entra na própria conta, cria um evento com política de visibilidade e recebe **um único link público de convite**.
- Convidados abrem esse mesmo link, visualizam a política de privacidade e escolhem entre conta e participação temporária.
- Cada pessoa reivindica uma vaga única; evitar que alguém se passe por outro nome usando prova de posse individual ou autenticação verificável. O organizador não pode emitir ou resgatar segredos de participantes no modo sigiloso.
- O evento passa por **aguardando participantes → inscrições encerradas → sorteado**. Sorteio somente após confirmação da lista. Nunca revelar resultados antes do sorteio.
- Após sorteio, cada participante acessa somente seu destinatário; no modo supervisionado, o organizador possui consulta auditável aos pares.

## Segurança e limites

- Um link compartilhado e um nome por si só **não garantem** que quem entra é o titular daquele nome. Antes de prometer sigilo, definir uma verificação individual viável (p.ex. convite individual emitido pelo sistema diretamente ao participante, e-mail verificado, ou autenticação vinculada). Convidados temporários precisam de prova de posse que o organizador não conheça.
- Um participante pode compartilhar voluntariamente seu resultado; não é possível impedir isso.
- Se não houver canal de verificação independente, o produto deve apresentar limitação clara e não alegar que o organizador é tecnicamente incapaz de ver resultados.
- Não expor credenciais em URL de consulta, logs, analytics ou sitemap; preferir fragmentos ou credenciais transmitidas no corpo da requisição. Hashes no D1, expiração, limitação de tentativas, revogação e proteção contra resgate simultâneo.
- Separar permissão de consulta de pares (visibilidade) de autenticação de convidado (forma de entrada). Não reutilizar `distribution_mode` para representar privacidade.

## Migração e compatibilidade

- Migração 0008 já existe **somente no PR**, não aplicada. Ela modela o antigo `distribution_mode`; **revisar/ajustar antes de qualquer aplicação**. Não editar migrações já aplicadas em produção (0007).
- Eventos legados com links individuais devem continuar funcionando, sem serem apresentados como sigilosos perante o organizador.
- Não mesclar PR #82 nem aplicar 0008 antes de implementar o novo modelo e executar testes completos.

## Critérios de aceite

1. Organizador autenticado escolhe **sigiloso** ou **supervisionado**; nunca escolhe entre login e convidado.
2. Todos recebem o mesmo link de convite; cada convidado escolhe sua autenticação.
3. Sem cadastro obrigatório nas ferramentas públicas; organizador sempre autenticado.
4. Participantes não podem se apropriar da vaga alheia informando somente nome.
5. Sigiloso: nenhuma API ou resposta ao organizador contém tokens capazes de revelar pares.
6. Supervisionado: autorização visível antes de entrar; somente organizador do evento consulta pares.
7. Sorteio ocorre depois de inscrições encerradas, sem destinatário duplicado nem autoatribuição.
8. Eventos legados continuam acessíveis; testes de dois navegadores, D1 isolado, replay, rate limit e revogação.
