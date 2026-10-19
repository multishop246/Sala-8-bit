# Sala 8-bit 0.6.0

Um único instalador Windows inclui a extensão de navegador, os conectores Codex/Claude Code e a tela **Conexões de IA**, acessível no escritório e no ícone perto do relógio. Não exige baixar ZIPs, instalar Python ou editar JSON manualmente. Na primeira abertura, a tela mostra a configuração e o diagnóstico por fonte. Não afirma que configurar equivale a ter execução confirmada.

O navegador exige a ativação da extensão em cada perfil de Chrome, Edge ou Opera GX, usando a pasta incluída no EXE. Quem já tem a extensão deve manter uma única cópia. O Codex exige revisar e confiar nos hooks em `/hooks`; confiança e políticas não são alteradas pelo instalador. Confira os [hooks oficiais](https://learn.chatgpt.com/docs/hooks). O adaptador do Claude Code segue seus [eventos oficiais](https://code.claude.com/docs/en/hooks); interrupções sem evento final e tarefas longas sem novo evento continuam limitadas pela expiração conservadora. Abas descartadas, controles desconhecidos e todos os modos de terceiros não têm detecção universal. Um EXE não pode garantir 100% de detecção sem as permissões e os sinais que cada programa disponibiliza.

A configuração dos conectores preserva preferências e hooks de terceiros, mantém os caminhos anteriores e guarda cópia dos JSONs existentes. Só a janela local de configuração pode instalar os conectores ou abrir sua pasta; páginas remotas não recebem essas permissões. A leitura de execução continua sem enviar prompts, mensagens, URLs ou títulos das janelas ao escritório.

## Correções

- IA em execução sem uso do teclado continua produtiva e não aciona o indicador visual de ociosidade. Um chat apenas aberto continua sem contar. O diagnóstico mostra os sinais nativos, de navegador e de conectores separadamente, além do pareamento e da conexão.
- ChatGPT/Claude nativos reconhecem também os controles explícitos Stop/Parar, mantendo a verificação de controle habilitado e visível em janelas restauradas.
- Windows Shell Experience Host, Calculadora, CapCut e Explorer são produtivos durante o trabalho, mesmo sem catálogo personalizado. A migração corrige registros antigos de distração desses aplicativos. Pausas de café/almoço, inclusive linhas do Explorer durante essas pausas, foram preservadas conforme solicitado.
- Sala 8-bit deixa de aparecer na lista de aplicativos do PDF. Os totais gerais continuam vindo do resumo de atividade do escritório.
- O relatório mostra a etapa concluída: Roteiro, Captação, Edição ou Finalização. A migração guarda essa identidade no evento e recupera etapas antigas quando o histórico permite; não usa a etapa atual da tarefa como substituta.
- Editor de Vídeo passa a Video Maker no catálogo padrão, no catálogo existente, nas funções principais e nas funções adicionais, sem trocar IDs das tarefas.
- Depois de uma hora em almoço, aparece um lembrete com **Já voltei: voltar ao trabalho** e **Ainda estou almoçando**. Não inicia pausa nem encerra almoço automaticamente. O aviso é dispensado por pausa, para não reaparecer a cada atualização. No aplicativo Windows, ele solicita exibir a janela; no navegador, aparece no próprio escritório.

## Validação

Testes cobrem categorias sem configuração personalizada, IA em repouso/execução, preservação de hooks de terceiros, idempotência da configuração, estágios históricos, almoço antes/depois de uma hora e preservação do Explorer em pausa. A migração mantém RLS e o mecanismo privado de limite do reset anterior. Compilação e testes não equivalem a validação universal em cada navegador ou modalidade de IA; conferir o diagnóstico e os ciclos reais no computador final.
