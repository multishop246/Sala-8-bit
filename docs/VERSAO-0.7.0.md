# Sala 8-bit 0.7.0

O escritório usa uma cena 3D isométrica com copa, retratos do Mural da Glória, lounge, quadro de tarefas, mesas da equipe, estúdio de captação, reunião, brainstorm e sala do gestor. O botão Ampliar abre a cena na janela inteira; Escape reduz. Os retratos e as roupas respeitam o personagem e os títulos existentes.

Clique no chão livre para caminhar com seu próprio personagem. O caminho contorna os móveis; os nomes e placas continuam abrindo os recursos do escritório. Esse movimento é visual e não altera demanda, etapa, responsável, cronômetro ou pausa. A posição é compartilhada por presença em tempo real, sem gravar os passeios no histórico de trabalho.

Após 15 segundos sem interação humana, um passeio termina e o personagem retorna à mesa. Após 5 minutos sem teclado ou mouse, durante trabalho de computador sem IA em execução, ele vai ao sofá do lounge. Ao retomar a interação, retorna à mesa. Café, almoço, reuniões e encerramento mantêm suas regras existentes. A etapa ativa `captacao` fica no estúdio e não usa falta de teclado ou mouse como ociosidade; a exceção termina ao trocar para edição ou outra etapa.

No aplicativo 0.7.0, a medição de inatividade vem do sistema operacional, inclusive enquanto outro programa está em foco. No navegador sem o aplicativo, só é possível observar a interação com o próprio escritório. O cenário mantém uma alternativa acessível em aparelhos sem WebGL.

## Publicação

Aplicar `supabase/migrations/0011_capture_activity.sql` no banco principal, publicar a web e instalar o aplicativo 0.7.0 para enviar os segundos de inatividade. A migração é compatível com aplicativos anteriores: também impede novos minutos ociosos durante uma captação ativa. Não reclassifica minutos antigos anteriores ao início da etapa.

Validação: `npm run test:room`, `npm run test:db`, `npm run build` e `cargo test --lib` em Windows/macOS. O teste de movimento cobre os limites de 15 segundos e 5 minutos, IA, captação, pausas e rotas sem colisão em escritórios com até 32 mesas.
