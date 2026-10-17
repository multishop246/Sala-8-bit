# Sala 8-bit

Escritório virtual em pixel art para equipes de marketing. Cada pessoa vira um personagem com mesa fixa, e a equipe acompanha quem está produzindo, em reunião ou no café, organiza as demandas num quadro e conversa sobre cada tarefa.

**Gratuito e de código aberto (licença MIT).** Cada empresa instala a sua cópia com contas grátis do Supabase e da Vercel, e os dados ficam com ela.

> **Experimente sem instalar:** abra o site sem configurar nada e clique em **Experimentar a demonstração**. Tudo roda no navegador, com uma equipe de exemplo.

## O que já funciona (versão 0.4)

- Login com Google ou link por e-mail, sem senha
- Criação do escritório da empresa, com endereço próprio (`/w/sua-equipe`)
- Convites por link (membro ou gestor), com validade e limite de usos
- Criação do personagem: foto do rosto (lida só no aparelho), sexo, pele, cabelo, barba, acessório, roupa e cor
- Funções (principal + até 2 adjacentes), horários e pasta de relatórios
- **Mesa fixa:** cada pessoa escolhe a sua uma vez, com plaquinha de nome; só o administrador libera
- Gestor com coroa e mesa da diretoria, só acompanha
- Configurações: nome, número de mesas, linhas/marcas/clientes, funções e apps produtivos, áreas e tipos de tarefa (já vem com um catálogo completo de marketing), regras de café, almoço, ociosidade e recursos ligáveis
- **Sala ao vivo:** cada pessoa aparece onde está (mesa, copa, reunião, mesa do gestor), com céu pela hora do dia e relógio digital
- **Copa:** café com saldo diário (15 min por padrão, com contagem regressiva; o que passar conta como distração) e almoço uma vez por dia; no horário de almoço o site pergunta qual pausa
- **Reuniões:** assunto, quem participa, visitantes e pessoas de outros setores; clicar de novo sai, e se quem criou sair a reunião acaba para todos
- **Pausa do gestor:** clique na mesa do gestor quando ele chamar você para algo urgente (conta como produtivo)
- **Chamar atenção:** placa ATENÇÃO piscando na mesa de quem chamou, até a pessoa responder
- Quem fecha o site aparece como fora do sistema; quem entra pelo celular aparece com o celular na mão
- Encerrar expediente e voltar no dia seguinte
- **Quadro de tarefas:** linha/marca, área e tipo, observação, para quem (equipe da área ou uma pessoa), data e horário de entrega num calendário que só mostra dias e horários de trabalho; dias lotados ficam bloqueados e o sistema sugere o próximo dia livre (capacidade calculada pelo tempo médio de cada tipo de atividade)
- **Vídeo em etapas:** Roteiro → Captação → Edição → Finalização; a cada etapa a tarefa volta para A fazer vinculada a quem fez (sem travar para os outros)
- **Contestação com votação** (a maioria decide), **transferência** com aceite ou recusa justificada e **pedido de ajuda** com observação obrigatória
- **Cronômetro da tarefa:** só corre na tarefa ativa e enquanto a pessoa está trabalhando (pausa sozinho no café, almoço e reunião)
- Arrastar os cards entre colunas, suas tarefas primeiro, filtros por linha e colaborador, contorno brilhante no que é seu
- **Chat por demanda:** toda mensagem fica ligada a uma tarefa; Enter envia; botão Responder; mensagens fora do assunto ficam sinalizadas em vermelho (sem bloquear); responder apaga a placa ATENÇÃO
- Clicar num colega mostra o que ele está executando agora e a conversa com ele
- **Mural da Glória:** ranking do mês (Mão Amiga, Produtividade, Entregas e, com o app de computador, Mestre da IA); o 1º de cada categoria ganha título no mês seguinte, com plaquinha dourada na mesa, subtítulo no nome e roupa exclusiva (um título por pessoa); os vencedores aparecem no mural da parede
- **Painel do dia:** tempo em tarefas, reuniões, café (com o que passou do limite), almoço, entregas, ajudas e a carga de cada um
- **Relatório do dia em PDF** ao encerrar o expediente, salvo na pasta escolhida (Chrome/Edge) ou baixado
- **SABADÃO:** quadro na parede com quem trabalha no sábado; folga leva as entregas daquele sábado para segunda
- **Roupas temáticas** do mês (Outubro Rosa, Halloween, Natal, festa junina, Carnaval, cores dos meses), escolhidas em "Sua mesa", com uma variação diferente para cada pessoa
- **Quadro do Instagram** com um rostinho por seguidor e confete a cada 100 (atualização manual ou automática pela API)
- **Captação:** quem está na etapa de captação de um vídeo anda pela sala com a câmera, soltando flashes
- Funciona no computador e no celular, e pode ser instalado como app (PWA)
- Segurança no banco: cada empresa só enxerga os próprios dados (Row Level Security, testado em `scripts/test-db.mjs`)

## Próximas versões

Veja [docs/ROTEIRO.md](docs/ROTEIRO.md). Falta a versão 0.5: o app de computador (Windows e macOS) que mede o app em foco.

O protótipo visual completo, com todas as ideias, está em [`prototype/prototipo-v1.html`](prototype/prototipo-v1.html) (abra no navegador).

## Instalar para a sua equipe

Siga o [guia de instalação](docs/INSTALACAO.md). Leva uns 15 minutos e não precisa programar.

## Para desenvolvedores

```bash
npm install
cp .env.example .env.local   # preencha com o seu Supabase (ou deixe vazio e use a demonstração)
npm run dev                  # http://localhost:5173
npm run build                # gera dist/
npm run test:db              # testa as migrações e as regras de segurança num Postgres embutido
```

- `src/` React + TypeScript + Vite. `src/game/` tem os sprites em pixel art e a sala.
- `src/lib/data-supabase.ts` e `src/lib/live-supabase.ts` falam com o Supabase. A demonstração (`src/demo/`) roda um Postgres de verdade no navegador (PGlite) com as **mesmas migrações**, então segue exatamente as mesmas regras.
- `supabase/migrations/` cria tabelas, regras de segurança e funções. O catálogo padrão vem de `src/lib/catalog-default.json` (rode `node scripts/gen-catalog-sql.mjs` depois de editar).

## Privacidade

O Sala 8-bit foi pensado para ser transparente com a equipe. O app de computador (próximas versões) registra só o **nome** do app em foco e a **categoria** das páginas, calculada no próprio computador. Nunca registra endereços de sites, telas, teclas, títulos de janelas ou conteúdo de arquivos. Antes de usar, leia [docs/PRIVACIDADE.md](docs/PRIVACIDADE.md): a empresa que instala é responsável por informar a equipe (LGPD).
