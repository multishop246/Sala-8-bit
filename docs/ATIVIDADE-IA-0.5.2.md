# Versão de testes 0.5.2 — execução de IA e música

## Estado da entrega

Implementação local de testes. Não está publicada em produção e as migrações 0007/0008 ainda precisam ser aplicadas ao Supabase antes do uso. Os testes automatizados não substituem a validação nas contas reais dos serviços.

## Comportamento

- Aplicativo de IA apenas aberto: zero execuções.
- Cada conversa com sinal de execução: uma unidade, mesmo que mostre vários controles de parar.
- Duas abas da mesma conversa são deduplicadas no mesmo serviço. Contas diferentes usando exatamente a mesma URL sem identificador não podem ser distinguidas.
- Execuções terminadas ou interrompidas saem da contagem. Sinais do navegador expiram em 75 segundos se a aba deixar de responder.
- O indicador atual é atualizado em intervalos de aproximadamente cinco segundos, sujeito à conexão. Os totais são somados em amostras de cinco segundos; cinco segundos de bônus não multiplicam um minuto inteiro. Relatórios continuam arredondando o total para minutos.
- A regra existente permanece: dois agentes dão 1,5× e cada agente adicional soma 0,5× no tempo produtivo elegível.
- Música usa o estado de reprodução das sessões de mídia do Windows e, como alternativa, o nível de saída de áudio dos players e navegadores compatíveis. Não grava áudio nem acessa microfone. Abrir Spotify sem reproduzir não ativa o fone. Reprodução em segundo plano pode ativar o fone mesmo durante ociosidade.
- O Windows precisa expor a sessão de mídia. Quando o player não a publica, a alternativa usa um nível de áudio positivo e mantém o indicador por até oito segundos entre trechos silenciosos; áudio muito baixo pode não ser detectado. Essa API também pode indicar reprodução de vídeo; não identifica semanticamente se o áudio é música.

## Navegador

A pasta `browser-extension` contém uma extensão Chromium para Chrome, Edge e Opera GX (a validar nos três). A extensão consulta apenas atributos de botões de execução nas páginas de ChatGPT, Claude, Gemini, AI Studio e Flow. Não lê caixas de mensagem nem corpos das conversas. Envia ao aplicativo local o serviço, identificador de conversa em hash e um indicador de execução. Esses hashes não vão ao Supabase; somente o total vai ao servidor da empresa.

Instalação manual: abrir `chrome://extensions`, `edge://extensions` ou `opera://extensions`, ativar o modo de desenvolvedor e usar **Carregar sem compactação**, selecionando `browser-extension`. Recarregar as abas de IA e verificar no ícone da extensão se a conexão com Sala 8-bit está ativa. A instalação requer aprovação do usuário para acessar as páginas listadas. Não instalar no navegador interno do Codex.

O identificador deve ser `dnlepjhhfeiedffhpeblklljgabcocpi`; a chave pública do manifesto mantém esse ID. A conexão aceita somente essa origem em `127.0.0.1:43187`. Se a conexão falhar, verificar o comportamento real do navegador antes de alterar restrições de origem.

Limitações: controles de execução específicos das contas reais ainda não foram validados, em especial Flow/AI Studio. Jobs de vídeo que continuam sem botão de cancelamento visível, abas descartadas ou conversas fechadas não têm detecção garantida. Não é uma integração com as APIs de jobs desses serviços. Não há suporte a Firefox nesta extensão inicial. No Opera GX, validar também o limite de recursos/abas em segundo plano; abas descartadas não continuam fornecendo sinal. A instalação local segue a [documentação oficial do Opera](https://help.opera.com/en/extensions/testing/).

## Codex e Claude Code no computador

Rode `node scripts/package-ai-hooks.mjs` para preparar os plugins locais em `ai-hooks/codex` e `ai-hooks/claude-code`. Isso não instala nem altera configurações pessoais. Após instalação e revisão dos hooks no aplicativo correspondente, eles registram início, fim, interrupção e espera por permissão. Começar uma tarefa nova depois de instalar.

O hook ignora o conteúdo recebido e grava localmente apenas serviço, hash da sessão, execução, PID e horário de início do processo em `%LOCALAPPDATA%\Sala8bit\activity`. O monitor confirma que o mesmo processo continua vivo, evitando manter uma execução após fechamento ou reutilização do PID. Não lê transcrições. Estados do Codex acima de 24 horas deixam de contar. No Claude Code, sinais sem nova confirmação expiram em 75 segundos: sua documentação informa que Stop não é chamado em interrupção manual. Esse limite evita manter sessões canceladas como ativas, mas pode deixar de contar raciocínio ou comandos longos sem novos eventos. O suporte de Claude Code continua experimental; não promete contagem exata em todas as interrupções. Esperas por permissão ficam fora da contagem; a execução de uma ferramenta recém-autorizada pode ficar sem confirmação até o próximo evento.

Suporta ancestrais `codex.exe`, `claude.exe` e instalações Node identificadas pelo caminho do pacote oficial. Ambientes remotos, WSL e executores em outro computador não são cobertos por esse adaptador Windows. Hooks não instalados, não confiáveis ou bloqueados por política não fornecem contagem. A aprovação de confiança do Codex deve ser feita pelo usuário, nunca contornada pelo instalador.

Para ChatGPT/Claude nativos existe apenas um fallback por janela com controle explícito de execução acessível. Conversas ocultas dentro dessas janelas não são garantidas. Não há integração universal com aplicativos de terceiros ou PWAs. Para validação por conversa, usar a extensão no navegador quando possível.

## Ordem para testar

1. Aplicar as migrações 0007 e 0008 em um ambiente de teste.
2. Publicar o frontend desta versão em preview e apontar o app para esse preview.
3. Instalar a versão Windows 0.5.2, mantendo apenas uma instância do monitor.
4. Instalar a extensão e, separadamente, os hooks aprovados nos aplicativos usados.
5. Conferir zero com todos os chats ociosos; uma execução; duas conversas; terminar ambas; minimizar e repetir; iniciar música em segundo plano e depois pausar.
6. Validar os controles reais de cada serviço antes de considerar o suporte concluído.

Referências oficiais: [Hooks Codex](https://learn.chatgpt.com/docs/hooks), [plugins Codex](https://developers.openai.com/plugins/build/plugins), [hooks Claude Code](https://code.claude.com/docs/en/hooks).

## Validação disponível

Os testes do banco cobrem isolamento dos indicadores, término, expediente encerrado, frações e uso dessas frações no relatório/ranking; os testes nativos cobrem contagem e expiração de conversas, ciclo dos hooks e limpeza de Unicode. A extensão tem testes simulados de controles e privacidade. O ambiente de compilação retornou 0x80070424 na consulta de sessões multimídia (serviço não disponível); isso motivou a alternativa WASAPI. Reprodução real ainda precisa ser validada no Windows usado pela pessoa.
