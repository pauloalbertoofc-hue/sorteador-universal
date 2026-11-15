# Amigo Secreto — homologação e migração D1

**Status:** planejamento e arquivos versionados. Nenhuma migração remota foi executada por este PR.

## Segurança

- O Worker já importa a API do Amigo Secreto; **não publicar o Worker em produção sem o esquema**.
- A migração sequencial é `0007_secret_santa_private_storage.sql` para produção e prévia.
- Existe também o arquivo legado `20261115_secret_santa_private_storage.sql` no diretório raiz, com `CREATE TABLE IF NOT EXISTS`. A CLI pode tratá-lo como migração adicional: verificar `migrations list` antes de aplicar e não apagar histórico sem revisão.
- O deploy protegido agora faz consulta **somente leitura** ao esquema e ao histórico da migração, bloqueando publicação se a versão 0007 não estiver registrada.
- Não executar comandos remotos sem autorização e confirmação do destino. Não copiar dados reais para a prévia.

## Primeiro: homologação no D1 de prévia

Confira `wrangler.preview-db.jsonc`: banco `sorteador-universal-preview-db`, ID `9701cfcf-9c77-4b09-8411-0f4a13f8c584`. Verifique o histórico e as migrações pendentes com:

```sh
npm ci
npx wrangler d1 migrations list DB --remote --config wrangler.preview-db.jsonc
```

Depois de revisar a lista e autorizar a aplicação no **banco de prévia**, use o workflow manual `preview-d1-homologation.yml` (ambiente `preview-d1`) ou `npm run db:preview:remote`. Verifique as tabelas por consulta de metadados, sem ler participantes:

```sh
npx wrangler d1 execute DB --remote --config wrangler.preview-db.jsonc --command "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'secret_santa_%' ORDER BY name;"
```

## Produção — somente após homologação

Verifique a configuração `wrangler.jsonc`: banco `sorteador-universal-db`, ID `24fe67dc-7003-4557-9de0-cf6658e713c2`. Planeje backup e janela de alteração; obtenha aprovação explícita para a migração remota. **Não executar ainda.**

Após migração aprovada, valide as duas tabelas e o registro `0007_secret_santa_private_storage.sql` em `d1_migrations`. Somente então o workflow de deploy protegido poderá prosseguir.

## Checklist antes de liberar ao público

- [ ] Testes de integração D1 e UI mobile em ambiente de prévia
- [ ] Conferência de migrações pendentes e aplicação na prévia
- [ ] Validação de tokens e links individuais em prévia
- [ ] Aprovação explícita da migração de produção e plano de recuperação
- [ ] Verificação do esquema em produção
- [ ] Deploy manual protegido e smoke test
- [ ] Revisão de privacidade: organizador pode guardar todos os links
- [ ] Remover `noindex` somente após homologação e revisão SEO

**Anúncios e outras ferramentas:** não alterados.
