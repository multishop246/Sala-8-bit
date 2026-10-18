# Privacidade e LGPD

O Sala 8-bit mede como o tempo de trabalho é usado. Isso envolve dados pessoais dos funcionários, então a **empresa que instala** é a controladora dos dados e precisa:

1. **Avisar a equipe antes**, por escrito, do que é registrado e para quê (modelo abaixo).
2. Ter uma **base legal**. Normalmente é o legítimo interesse ou a execução do contrato de trabalho; confirme com o jurídico ou um advogado.
3. Deixar cada pessoa **ver os próprios dados** (em Painel do dia → Seus apps hoje) e **apagar os dados** quando sair: o administrador remove a pessoa em Configurações → Equipe, e para apagar também a conta de login, exclui o usuário no Supabase em Authentication → Users (tudo dela é apagado junto).

## O que o sistema registra

O tempo por aplicativo só é medido por quem usa o app de computador. Sem ele, o sistema registra apenas o que a pessoa faz no próprio site (status, pausas, reuniões, tarefas e mensagens).

| Registra | Nunca registra |
|---|---|
| Nome do app em foco (ex.: Figma) | Endereços de sites |
| Categoria da página no navegador (trabalho, referência, e-mail, outro), calculada no computador | Capturas de tela |
| Se há música tocando (para pôr o fone no personagem) | Teclas digitadas |
| Tempo sem teclado/mouse (ociosidade) | Títulos de janelas |
| Quantos agentes de IA estão rodando | O que a pessoa ouve |
| O título da aba do navegador é lido só no computador, para calcular a categoria | Títulos de janelas não saem do computador |
| Pausas marcadas na copa, reuniões, tarefas e mensagens do chat interno | Conteúdo de arquivos |

O gestor (com coroa) não é monitorado.

Na versão de testes 0.5.2, a extensão opcional consulta controles de execução nas páginas de IA e envia ao aplicativo local somente serviço, hash da conversa e execução. Os plugins opcionais de Codex/Claude Code recebem eventos de tarefa e descartam seu conteúdo, mantendo localmente apenas o hash da sessão, estado e identidade do processo. Esses identificadores não são enviados ao Supabase; o servidor recebe o total de execuções e o tempo proporcional. A reprodução de mídia é consultada pelo estado do Windows, sem nomes de faixas. Instalação e limitações: [atividade de IA 0.5.2](ATIVIDADE-IA-0.5.2.md).

Os dados ficam no projeto Supabase **da própria empresa**. Os autores do Sala 8-bit não têm acesso a eles.

## Modelo de comunicado

> **Assunto: Novo escritório virtual da equipe de marketing**
>
> A partir de [data], a equipe vai usar o Sala 8-bit, um escritório virtual onde cada pessoa tem um personagem e uma mesa. Ele serve para organizar as demandas e entender como o tempo da equipe é usado.
>
> O app de computador registra apenas o nome do programa em uso e a categoria das páginas abertas (sem endereços), além de períodos sem uso do teclado e do mouse. Não são registradas telas, teclas, títulos de janelas nem conteúdo de arquivos. Você pode ver todos os seus dados no próprio sistema a qualquer momento.
>
> Os dados ficam armazenados em [nome da empresa] e são usados apenas para [finalidade]. Dúvidas: [contato].

*Este material é informativo e não substitui orientação jurídica.*
