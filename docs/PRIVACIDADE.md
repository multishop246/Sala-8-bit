# Privacidade e LGPD

O Sala 8-bit mede como o tempo de trabalho é usado. Isso envolve dados pessoais dos funcionários, então a **empresa que instala** é a controladora dos dados e precisa:

1. **Avisar a equipe antes**, por escrito, do que é registrado e para quê (modelo abaixo).
2. Ter uma **base legal**. Normalmente é o legítimo interesse ou a execução do contrato de trabalho; confirme com o jurídico ou um advogado.
3. Deixar cada pessoa **ver os próprios dados** (o painel pessoal mostra tudo para ela a partir da versão 0.5) e **apagar os dados** quando sair: o administrador remove a pessoa em Configurações → Equipe, e para apagar também a conta de login, exclui o usuário no Supabase em Authentication → Users (tudo dela é apagado junto).

## O que o sistema registra

O monitoramento do tempo começa com o app de computador (versão 0.5). Até lá, o sistema guarda só o cadastro da equipe.

| Registra | Nunca registra |
|---|---|
| Nome do app em foco (ex.: Figma) | Endereços de sites |
| Categoria da página no navegador (trabalho, referência, e-mail, outro), calculada no computador | Capturas de tela |
| Se há música tocando (para pôr o fone no personagem) | Teclas digitadas |
| Tempo sem teclado/mouse (ociosidade) | Títulos de janelas |
| Quantos agentes de IA estão rodando | O que a pessoa ouve |
| Pausas marcadas na copa, reuniões, tarefas e mensagens do chat interno | Conteúdo de arquivos |

O gestor (com coroa) não é monitorado.

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
