# Validação local — 18/10/2026

- Usuário confirmou instalação da extensão no Opera GX.
- Receptor temporário independente do Supabase recebeu uma aba conectada, com zero conversas em execução enquanto a conversa estava parada.
- Usuário confirmou a mensagem de conexão no ícone da extensão.
- O usuário executou um pedido, mas não houve alteração observada nas leituras periódicas. Como o diagnóstico inicial lia a cada dois segundos, essa observação não exclui uma execução curta entre leituras. Foi preparado registro por evento para a repetição do teste. Ainda falta confirmar a transição de execução e seu encerramento. O receptor de diagnóstico encerra automaticamente após dez minutos; sua conexão não significa que a versão definitiva do aplicativo já foi instalada.
- Conectores copiados para `%LOCALAPPDATA%/Sala8bit/connectors`, com configuração nos arquivos de usuário `~/.codex/hooks.json` e `~/.claude/settings.json`. Configuração anterior do Claude foi copiada para backup ao lado do arquivo original. Não foi alterada a confiança dos hooks do Codex; revisão pelo usuário continua pendente.
- Extensões de Chrome/Edge, reprodução real de música, frontend de preview e migrações no Supabase continuam pendentes. Nenhuma alteração de produção foi aplicada.

A configuração local não garante suporte aos provedores sem validação dos controles reais. Ver limitações em [atividade de IA 0.5.2](ATIVIDADE-IA-0.5.2.md).

A captura enviada pelo usuário mostra o botão quadrado de parar durante uma resposta. A extensão 0.5.3 acrescenta variações explícitas de identificadores/rótulos e um diagnóstico local dos atributos e formas dos botões do compositor. A imagem não revela o identificador DOM real; nenhum suporte foi considerado confirmado só pela imagem.

Após recarregar a extensão 0.5.3, o usuário confirmou “Execução detectada nesta aba” e depois enviou diagnóstico de ChatGPT com `running: false`. As duas amostras confirmam os estados no painel da extensão nessa interface. O receptor temporário já estava encerrado quando foi consultado novamente, portanto não há confirmação do percurso completo dessa execução até o contador local ou Supabase. O diagnóstico final retornou `composerFound: true` e `controls: []`; isso descreve o escopo consultado, não demonstra ausência de botões em toda a página.

## Integração com banco descartável

O exemplo `tracker-check` executou o código real de `tracker.rs` contra `mock-supabase.mjs`, carregando todas as migrações em banco local descartável. O primeiro teste observou uma execução real do Codex, com arquivo de hook atualizado e contador 1; por isso a expectativa inicial zero falhou. A execução controlada foi então isolada dos arquivos reais dos hooks usando `LOCALAPPDATA` alternativo apenas no processo de teste. Nenhuma configuração de ambiente do Windows foi alterada.

`node scripts/test-local-tracker.mjs` confirmou a sequência 0 → 1 → 2 → 0, atravessando o receptor HTTP, o código real do monitor, a RPC `agent_live` e o banco local. Uma amostra histórica controlada com três agentes durante cinco segundos gravou bônus proporcional de 1/12 de minuto; o histórico manteve o indicador atual em zero. As conversas simuladas foram desligadas ao final do teste.

O monitor de teste passou a durar uma hora e registrar apenas contagem, música, conexão e erro em `.tools/end-to-end.log`. O teste real da aba do Opera GX e da reprodução musical foi solicitado ao usuário; ainda não estava confirmado nesta atualização. O avatar na versão em produção não faz parte desta validação local.
