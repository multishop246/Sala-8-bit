# App de computador (Windows e macOS)

O app de computador é o próprio escritório numa janela, mais a medição do tempo. Ele fica com um ícone perto do relógio e continua medindo com a janela fechada. Para parar de vez, use **Sair do Sala 8-bit** no ícone.

## O que ele mede (e o que nunca mede)

A cada minuto o app envia só:

- o **nome do app em foco** (ex.: Figma). Navegadores aparecem só como "Navegando na internet";
- a **categoria** do minuto, calculada no computador: produtivo, referência criativa, comunicação, distração, ocioso ou IA trabalhando;
- se há **música** tocando (para pôr o fone no personagem);
- quantos **agentes de IA** estão rodando (ex.: Claude Code, Codex).

O título da janela do navegador é lido **só no computador**, para saber a categoria da página (ex.: "Pinterest" = referência criativa). Endereços, títulos, telas, teclas e arquivos nunca são enviados. Cada pessoa vê tudo o que foi registrado sobre ela em **Painel do dia → Seus apps hoje**.

Regras do tempo:

- **Produtivo**: apps das suas funções, sites de trabalho, apps de IA, referência criativa, reunião e pausa do gestor.
- **Ocioso**: 5 min (ajustável) sem teclado e mouse. Se houver agente de IA rodando, conta como "IA trabalhando", que é produtivo.
- **Multiplicador**: com 2 ou mais agentes de IA rodando, cada agente extra soma +0,5× no minuto produtivo.
- Café e almoço viram "pausa"; depois de **Encerrar expediente** o app para de medir até o dia seguinte (ou até você clicar em "Voltar ao trabalho").

As listas de apps (por função) e de sites ficam em **Configurações**.

## Instalar

Baixe o instalador na página de Releases do repositório (o link também aparece no seu painel, em "app de computador").

- **Windows**: rode o arquivo `...-setup.exe`. Como o instalador não é assinado, o Windows pode mostrar "O Windows protegeu o computador": clique em **Mais informações → Executar assim mesmo**.
- **macOS**: abra o `.dmg` e arraste o Sala 8-bit para Aplicativos. Na primeira vez, clique com o botão direito no app → **Abrir** (ou Ajustes do Sistema → Privacidade e Segurança → **Abrir Mesmo Assim**).
  - Para o app saber a categoria das páginas do navegador, permita em **Privacidade e Segurança → Gravação de Tela** (o macOS exige essa permissão para ler o título da janela; o app não grava nem envia a tela). Sem ela, o navegador conta como "Navegando na internet" sem categoria.

Para abrir junto com o computador: no Windows, coloque um atalho em `shell:startup`; no macOS, adicione em Ajustes do Sistema → Geral → Itens de Início.

## Primeiro uso

1. Digite o endereço do escritório da empresa (o mesmo do navegador).
2. Entre com seu e-mail e digite o **código de 6 dígitos** que chega no e-mail (o login do Google não funciona dentro de apps de computador).
3. Pronto: o app se conecta sozinho à sua conta. No seu painel aparece "App de computador medindo".

Se ficar sem internet, o app guarda os minutos e envia quando a conexão voltar (até 24 horas).

## Relatório do dia

Ao encerrar o expediente, o relatório em PDF é salvo direto na pasta que você escolher (na primeira vez o app pergunta).

## Para quem mantém o projeto

- O código fica em `desktop/` (Tauri 2 + Rust). A classificação dos minutos está em `desktop/src-tauri/src/classify.rs`, com testes (`npm test` dentro de `desktop/`).
- Para gerar os instaladores: no GitHub, **Actions → App de computador → Run workflow**. Em alguns minutos aparece um Release com o `.exe` e o `.dmg`.
- Para testar sem Supabase: `node scripts/mock-supabase.mjs 5999` imita o servidor e mostra os minutos recebidos em `http://localhost:5999/_minutos`.
- Assinar os instaladores (para sumir o aviso do Windows/macOS) exige certificado de desenvolvedor (Apple Developer Program e um certificado de assinatura de código para Windows). O `tauri-action` aceita esses certificados por variáveis secretas do GitHub.
