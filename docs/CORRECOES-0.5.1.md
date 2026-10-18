# Correções preparadas

- Clicar no quadro da parede abre o quadro em uma janela, incluindo tarefas concluídas de outros dias. Os filtros continuam disponíveis.
- O relatório não mostra contagens de mensagens enviadas/recebidas. Café mostra apenas os minutos usados.
- Navegação sem classificação específica e Notepad são classificados como produtivos durante atividade; ociosidade continua sendo medida.
- Caracteres nulos são removidos de nomes de aplicativos e de todos os textos enviados ao banco, inclusive de amostras pendentes em memória. Isso evita a rejeição de U+0000 pelo PostgreSQL.
- Spotify Music e nomes de processos terminados em caracteres nulos são reconhecidos. No Windows, janelas de players web reconhecidos também são consultadas em segundo plano.

## Medição de IA

Um processo aberto não comprova uma execução. A contagem automática por processos foi removida.
No Windows, uma consulta local de acessibilidade procura controles explícitos como “Stop generating”, “Stop response”, “Parar de gerar” e “Cancelar tarefa” nas janelas de ChatGPT, Claude, Codex, Gemini e Copilot.
Somente os totais de execuções detectadas e o indicador de música saem dessa consulta. Conteúdo de conversas e títulos de janelas não são enviados ao banco.

Limites: interfaces que não expõem esses controles, conversas em abas não expostas à acessibilidade, agentes de terminal e macOS não têm confirmação automática de execução nesta versão. Nesses casos a contagem é zero, para não inventar tempo de IA. A medição universal exige integração de início/fim com cada ferramenta; não pode ser inferida com precisão apenas pelos processos ou pelo consumo de CPU. Uma leitura sem atualização por 12 segundos também deixa de contar.

Música em páginas genéricas de vídeo não pode ser distinguida de outros vídeos apenas pelo título. São reconhecidos os players com identificação Spotify, YouTube Music, Deezer, SoundCloud, Tidal e Apple Music. Um player aberto pode manter o indicador mesmo pausado, seguindo o comportamento de aplicativos abertos já usado no projeto.

## Publicação e validação pendentes

As alterações locais não atualizam o site nem os instaladores já instalados.
Publicar o código no GitHub para gerar a versão web na Vercel. Para o desktop, gerar e testar um novo instalador no workflow App de computador. Incrementar a versão antes de publicar um Release para não substituir silenciosamente o instalador anterior.

Validar no Windows: chat aberto e parado = zero IA; iniciar pedido compatível = execução detectada; finalizar = zero; Notepad e navegação comum = produtivo; Spotify e player web em segundo plano = fone; sincronizar minuto com nome contendo caracteres nulos = sem erro 400.
Os registros históricos já gravados não são alterados por essas mudanças.

## Versão enviada para avaliação

As alterações foram enviadas à branch `correcoes-app-teste`, em https://github.com/multishop246/Sala-8-bit/pull/1 (rascunho). A main e o app em produção não foram substituídos. O workflow `Versão de testes do app` gera um instalador Windows como artefato, sem criar Release. Os testes Rust passaram na primeira execução; a instalação de dependências desktop foi ajustada para `npm install`, pois essa pasta não tem lockfile.

Validação final: web e Windows aprovados em https://github.com/multishop246/Sala-8-bit/actions/runs/39055419511. Instalador de testes: https://github.com/multishop246/Sala-8-bit/actions/runs/39055419511/artifacts/12109348284. A instalação e a conferência funcional nos chats reais ainda dependem do teste do usuário.

## Revisão após o teste de 18/10

Trabalho local em andamento, ainda não enviado ao GitHub: leitura de reprodução pelas sessões de mídia do Windows; fone e nota musical também durante ociosidade; indicadores ao vivo separados dos totais do minuto por meio de `0007_agent_live.sql`. Os 87 testes do banco e a checagem TypeScript passaram. O novo código nativo ainda precisa compilar no Windows. Falta confirmar quais chats a equipe usa para implementar contagem por conversa, inclusive em segundo plano, com início e fim reais. O fallback de acessibilidade continua sendo por janela e não deve ser apresentado como contagem exata por conversa. A migração 0007 ainda não foi aplicada ao Supabase.
