# Validação local — aplicativo 0.5.3 e extensão 0.5.4

O instalador Windows 0.5.3 foi gerado localmente. Os 13 testes Rust passaram. Os testes da extensão passaram, incluindo a ordem de entrega dos estados de início/fim, falhas HTTP/rede e diagnóstico sem mensagens ou URLs.

O monitor de integração usa um banco descartável em 127.0.0.1:5999. Não altera o pareamento do aplicativo instalado nem grava na produção. O diretório de conectores de teste é isolado por SALA_ACTIVITY_HOOKS_DIR, apenas em compilações de depuração; LOCALAPPDATA permanece intacta.

O ambiente restrito de execução dos comandos impedia o acesso às sessões de mídia do Windows. Fora desse ambiente, a consulta do Windows e a leitura de áudio funcionaram. Não foram alteradas proteções do Windows ou permissões da extensão.

No teste real de 18/10/2026, o banco local recebeu música ativa, pausa e novas ativações. Uma consulta posterior identificou a sessão Spotify com estado Playing, portanto ainda não é possível atribuir as novas ativações apenas ao detector de volume. A animação na aplicação de produção não foi validada.

A extensão 0.5.3 detectou execução na aba segundo o usuário, mas o monitor local não registrou agentes ativos nesse teste. Essa diferença continua em investigação. A extensão 0.5.4 serializa as entregas e mantém os últimos 20 eventos com horário, serviço, execução, resultado e código HTTP. Não guarda prompts, mensagens, URLs ou identificadores de conversa no diagnóstico. Recarregar a extensão e a aba é necessário para usar essa versão.

As migrações 0007 e 0008 não foram aplicadas na produção. Estas alterações locais ainda não foram publicadas no repositório remoto. A conclusão dos testes controlados não comprova o funcionamento de todas as IAs e navegadores no uso real.

## Causa identificada no ChatGPT e extensão 0.5.6

O diagnóstico real 0.5.5 capturado durante a resposta mostrou um botão habilitado com aria-label="Parar", sem data-testid, e um SVG path de quadrado arredondado. A extensão antiga não aceitava esse rótulo genérico; recebia HTTP 200, mas enviava somente running=false.

A versão 0.5.6 aceita esse controle especificamente no compositor do ChatGPT, combinando rótulo Parar/Stop e o desenho exato observado. Testes com o controle real passaram. Controles ocultos, desabilitados, fora do compositor, com outro desenho ou em outro serviço continuam sem sinalizar execução. Os testes de entrega também passaram. A confirmação real de início/fim no contador permanece pendente após recarregar a extensão e a aba.

O diagnóstico seguinte 0.5.6 retornou compositor encontrado com controles vazios e nenhum início recebido. Isso não comprova a causa, mas expõe uma fragilidade: a busca selecionava apenas o primeiro editor pelo ID. A versão 0.5.7 considera todos os editores e compositores renderizados, inclusive quando há IDs duplicados ou um formulário antigo vazio antes do atual. O teste reproduz um formulário antigo vazio antes do formulário com o botão real e passou, junto com os testes de entrega. Ainda requer confirmação no navegador real.

Em seguida, o usuário confirmou “Execução detectada nesta aba”. O monitor real registrou agents=1 às 18:47:33 UTC em 18/10/2026 (15:47:33 em São Paulo), e o banco descartável confirmou live.agents=1. O histórico passou a acumular ia_minutes=0.5833333333333333, comprovando o caminho extensão → monitor → banco local para o início dessa execução real. O encerramento ainda não havia sido observado nessa leitura. Isso não valida a produção nem as demais IAs.

Às 18:48:48 UTC, o monitor e o banco voltaram a agents=0. O intervalo de 75 segundos coincide com a validade de um sinal; portanto a queda sozinha não comprova recebimento explícito de running=false. Foi solicitado o diagnóstico final, sem novo pedido, para diferenciar encerramento entregue de expiração.

## Confirmação final do teste ChatGPT no Opera GX

O diagnóstico final da extensão 0.5.7 confirmou início entregue: running=true, status=200, at=1792349251554; e conclusão entregue: running=false, status=200, at=1792349322582. O intervalo foi de aproximadamente 71 segundos. O histórico local de controles também registrou o botão Parar durante a resposta e sua substituição pelo controle de voz após concluir. Portanto, neste teste, o retorno a zero correspondeu ao encerramento explícito recebido, e não apenas à expiração. O ciclo real de início, contagem e conclusão ficou validado no monitor com banco descartável. Produção, múltiplas conversas simultâneas e demais serviços continuam sem essa validação real.

## Novo teste real de música

O usuário realizou reprodução no Spotify, minimização e pausa conforme solicitado. O monitor registrou music=true às 18:51:53 UTC e music=false às 18:52:23 UTC; o banco descartável confirmou music=false após a pausa. O teste confirma os sinais de reprodução e pausa no monitor local. A animação do personagem no site atualizado e reprodução no navegador ainda precisam de confirmação visual/real específica.

## Gemini — início observado

O usuário confirmou que a extensão detectou execução na aba do Gemini no Opera GX. Durante esse teste, o monitor registrou agents=1 às 18:54:23 UTC e o banco descartável confirmou live.agents=1. O registro agregado não identifica o serviço; a confirmação específica de entrega Gemini e do encerramento depende do diagnóstico da extensão ao concluir. Não considerar o ciclo completo validado ainda.

O diagnóstico final confirmou source=gemini: início running=true com HTTP 200 em 1792349661051, e encerramento running=false com HTTP 200 em 1792349737165. Houve uma sequência intermediária false/true com sete milissegundos de intervalo, compatível com a troca de identificador de conversa (a extensão encerra a anterior antes de publicar a nova); o diagnóstico não guarda os identificadores, portanto essa causa não é comprovada. O término explícito foi entregue. ChatGPT e Gemini têm agora confirmação real de detecção e entrega de início/fim no Opera GX; o multiplicador com execuções simultâneas ainda precisa do teste real correspondente.

## Primeiro teste simultâneo — resultado não confirmado

Após o usuário informar o término dos dois pedidos, o monitor mostrou somente agents=1 às 18:59:18 UTC e agents=0 às 19:00:28 UTC. Não houve agents=2 no registro. O banco descartável permaneceu com bonus_minutes=0, coerente com a contagem observada. Não é possível afirmar que houve sobreposição de sinais recebidos. Foi solicitado o histórico compartilhado da extensão sem repetir os pedidos, para distinguir ausência de sobreposição, falha de detecção/entrega e problema de agregação. Os testes controlados de duas conversas passaram anteriormente; esse resultado real não confirma o multiplicador.

O histórico entregue em seguida mostrou somente novos eventos Gemini no último teste: true em 1792349957963 e false em 1792350024124, ambos HTTP 200. Nenhum início ChatGPT foi registrado nesse intervalo. Isso explica a contagem observada sem demonstrar falha de agregação. Foi solicitada confirmação de qual aplicativo/navegador executou o ChatGPT nesse teste antes de mudar detecção ou cálculo. O Opera GX não está acessível nas superfícies de automação de navegador disponíveis nesta sessão.

## Segundo teste simultâneo — contagem e bônus observados

Após reconectar a aba ChatGPT, o teste simultâneo registrou agents=2 às 19:06:44 UTC e novamente às 19:06:54 UTC, com oscilações intermediárias para 1. O banco descartável registrou bonus_minutes=0.1666666666666666 (10 segundos de bônus), consistente com 20 segundos amostrados com duas execuções e fator adicional 0.5. A agregação real e a gravação de bônus estão demonstradas. Após o usuário informar que ambas terminaram, o monitor ainda mostrava agents=1 na leitura seguinte. O encerramento completo e a causa da oscilação não estão validados; é necessário examinar os eventos de entrega, sem presumir que a execução terminou corretamente só porque o bônus foi registrado.

O diagnóstico posterior confirmou entregas HTTP 200 de Gemini running=false e ChatGPT running=false (este último em 1792350499542, aproximadamente 19:08:19 UTC). O monitor voltou a agents=0 às 19:08:24 UTC, no ciclo de amostragem seguinte, e o banco confirmou o zero. Assim, o segundo teste demonstrou contagem simultânea, bônus e encerramento explícito de ambos. A oscilação intermediária de detecção permanece documentada; não comprova contabilização exata de toda a sobreposição percebida pelo usuário. Não é necessário repetir este mesmo teste para comprovar o encerramento.
