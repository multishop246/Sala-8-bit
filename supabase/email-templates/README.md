# E-mail de acesso com código e link

Estes modelos incluem `{{ .Token }}` para acesso por código e preservam `{{ .ConfirmationURL }}` para acesso por link. Aplicar tanto em Confirm sign up quanto em Magic link or OTP: o primeiro acesso e os acessos posteriores podem usar modelos diferentes.

No projeto de testes, o painel atual do Supabase bloqueia edição de modelos sem SMTP próprio. O usuário cadastrou a chave Brevo e salvou a configuração. Os dois modelos HTML foram aplicados no painel em 18/10/2026; ainda é necessário validar o recebimento no e-mail. Para qualquer outro projeto, cadastrar seu SMTP e aplicar os modelos separadamente. Criar os arquivos no repositório não altera automaticamente o modelo hospedado.

Assuntos sugeridos: `Confirme seu acesso ao Sala 8-bit` e `Seu código de acesso ao Sala 8-bit`. Não incluir o código no assunto para evitar sua exposição em prévias de notificações.

Referência: https://supabase.com/docs/guides/auth/auth-email-templates
