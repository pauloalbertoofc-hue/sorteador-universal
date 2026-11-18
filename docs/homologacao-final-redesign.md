# Homologação final — redesign unificado

## Evidência automatizada

Commit e2182f3: quatro workflows GitHub Actions aprovados (SEO metadata, SEO landing pages and ads, free tools, theme redesign). Cobertura: sete temas, oito rotas, navegação por teclado, contraste do título, disclosures, tema no iframe e preservação do campo testado. O servidor estático e os estados simulados não comprovam autenticação, cobrança ou salas reais.

## Homologação em ambiente de teste

- [ ] Conferir capturas finais em 390 e 1280 px, incluindo Original.
- [ ] Realizar sorteios como visitante nas oito ferramentas e conferir resultados.
- [ ] Criar conta de teste ou usar conta de homologação autorizada; entrar, sair e recarregar.
- [ ] Conferir estado de assinatura e ausência de anúncios para conta Pro de teste; usar sandbox para checkout, sem cobrança real.
- [ ] Criar sala de teste, entrar em segundo dispositivo e conferir sincronização e compartilhamento.
- [ ] Conferir consentimento de analytics, anúncios e links legais.
- [ ] Conferir build Cloudflare e diff contra main, sem alterações no Amigo Secreto.
- [ ] Obter autorização explícita para publicação.

## Liberação

Manter PR em rascunho até revisão. Não usar credenciais reais em logs, não efetuar cobrança real e não alterar Amigo Secreto. Após autorização e aprovação, registrar SHA publicado e validar produção; se houver regressão, avaliar reversão do merge.
