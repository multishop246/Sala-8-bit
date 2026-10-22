# Escritório com a composição aprovada

Visual aprovado pelo usuário em 21/10/2026. O escritório tem até oito mesas.

## Implementação

O cenário usa uma imagem renderizada com câmera fixa, derivada da referência aprovada. Os personagens são modelos 3D animados, com posição, aparência e estado da equipe atualizados em execução. Não há personagens fixos pintados no cenário. Os retratos do Mural da Glória são substituídos pelos avatares e nomes dos vencedores reais.

O piso foi registrado pelas quatro extremidades da referência. Uma homografia compartilhada alinha a projeção dos personagens, o clique no chão e as posições dos móveis. Volumes invisíveis delimitam móveis para o movimento e ocultam partes dos personagens atrás de mesas. As etiquetas são botões acessíveis; o quadro também responde ao clique direto sobre sua imagem.

O quadro colorido no cenário é decorativo; tarefas e informações atuais continuam no popup. A imagem é incluída no cache offline da aplicação. A composição fixa atende até oito postos; escritórios maiores conservam o cenário procedural adaptável existente.

Movimentação e presença permanecem independentes das tarefas e dos cronômetros. Retorno após 15 segundos, lounge após cinco minutos e exceções para captação e IA continuam sob as mesmas regras.

Ao clicar no estúdio, uma atividade explícita "Gravando" permanece ativa até clicar na própria mesa. Havendo uma única demanda de captação vinculada à pessoa, ela é iniciada; sem demanda específica, a atividade é registrada sem criar uma tarefa fictícia. Clicar na mesa pausa a captação sem avançar a etapa. Brainstorm segue o mesmo princípio, com registro próprio e retorno à demanda de computador anterior. Café, almoço, reunião ou encerramento fecham a atividade. Essas atividades ficam fora da ociosidade por teclado/mouse; os minutos do app usam o intervalo original mesmo em envios atrasados.

## Artefatos

- Referência: `sala-8-bit-proposta-e-3d.png` nesta pasta.
- Cenário utilizado: `public/scenery/office-reference-clean-v2.png` na raiz do projeto.
- Captura real da prévia: `design/qa/office-review.png` (arquivo local de revisão).
- Testes: `npm run test:room`, `npm run build` e verificação local de renderização, clique direto no quadro, movimento, retorno e largura móvel.

## Edição do cenário

Ferramenta utilizada: ImageGen integrado, em modo de edição. Não foi usado CLI/API externo.

Instrução final enviada:

> Use case: precise-object-edit. Asset type: clean background plate for a fixed-camera interactive isometric office game. Edit target: the attached approved office render. Make a surgical cleanup ONLY. Preserve the EXACT room layout, furniture positions, dimensions, perspective, camera, image framing, warm lighting, materials, background city, glass walls, all plants, shelves, windows, every chair and desk and accessory. In particular keep bookshelf BESIDE the manager window, the large plant to the LEFT of task board, four framed portraits along the back LEFT wall between café and lounge; don't move anything. Remove ALL living office characters/people/avatars from the floor, chairs and desks (including manager), their music bubbles and companion robots, reconstructing the empty chairs and furniture surfaces they occlude. Remove ONLY the nine floating dark numbered zone-label plaques, plus the big upper-left 'Proposta E' header plaque, reconstructing the surfaces behind them. Preserve the built-in CAFÉ sign, REC sign and gold MURAL DA GLÓRIA sign and the four framed portraits on the wall. Leave the colored notes on the task board and all other physical decor unchanged. The result must look like the SAME exact image and scene, just empty of people and floating UI labels. Not a redesign, no new furniture, no rearrangement, no altered camera, no simplification. Match original wide aspect ratio, retain whole platform and blurred city framing. Maximize fidelity to the input image.

Não foi atribuída uma porcentagem de semelhança. A aprovação depende da comparação visual do usuário com a referência.

Segunda edição, pontual, usada no cenário final:

> Use case: precise-object-edit. Image 1 is the edit target, the empty isometric office background. Image 2 is the approved original reference ONLY for checking the white round brainstorm tabletop in the lower-right. Change ONE tiny detail in image 1: remove the small green potted plant that was accidentally added at the center of the round white brainstorm table in the lower-right. Restore that little area to the clean plain white tabletop as in image 2; retain the colored sticky notes. Keep every other part of IMAGE 1 exactly unchanged, including all empty chairs, all furniture positions, the entire room geometry, bookshelf next to manager window, all OTHER plants, all details and textures, portraits and text, city background, lighting, shadows, image size and camera. Do not add any characters, UI labels or header from image 2. No other edits. Preserve image 1 as exactly as possible outside this single small tabletop plant.

## Correções visuais de 21/10/2026

O cenário em uso agora é `public/scenery/office-reference-clean-v4.png`. As cadeiras e a impressora foram removidas da imagem fixa e substituídas por objetos animados. Os pontos de assento são compartilhados entre cenário, personagens, colisões e cliques. A aproximação usa corredores; a animação puxa a cadeira, dobra os joelhos e aproxima a cadeira da mesa. Os pés ficam junto ao piso. `prototype/visual-check.html`, servido pelo Vite local, permite verificar os estados sem acessar dados do escritório.

`public/scenery/aromasil-original.png` é uma cópia byte a byte da logo fornecida (SHA-256 DB5AC5C47277D3D3D1A059E97F712BE2920F7D0C5D032350FD8066F3FB9A8624). A aplicação retira apenas o papel branco para exibição, conserva os pixels das letras e do coração e aplica um halo branco em volta de suas silhuetas. Não há moldura, fonte substituída ou marca redesenhada.

A impressora tem uma janela diária única de 15 minutos sorteada entre 08h00 e 16h59, usando a data de São Paulo e o identificador do escritório. Recarregar não sorteia outra janela. Ao terminar, volta ao seu posto e à forma de impressora. O horário é decorativo, sem notificações ou alterações de produtividade.

No estúdio, cada entrada sorteia uma das quatro funções visuais: câmera, stories com celular, direção com claquete e microfone de boom. Essas funções não são gravadas no banco e não alteram tarefas, cronômetros, presença ou relatórios. O clique no estúdio continua iniciando a atividade Gravando conforme a funcionalidade já existente.

Ferramenta de edição: ImageGen integrado. Prompt da primeira edição:

> Precise object edit for production isometric game background. Input is edit target. Preserve EXACT camera, framing, dimensions/aspect, all walls, floor, tables, monitors, plants, lighting, sofa, bookshelves and scenery, no people/text UI added. Remove ALL swivel office chairs (8 at workstations, 6 around front meeting table, chairs around round brainstorm table, manager desk chair), reconstruct clean floor/table legs behind them; these chairs will be animated separately. Remove small white floor-standing printer between studio and desks, reconstruct floor. Remove ONLY the two small colorful picture frames on dark wall just left of manager bookshelf, leave blank dark wall for exact brand overlay later. Move kitchen water cooler from outside platform at far left to INSIDE kitchen next to fridge, standing safely within wooden floor. Flatten the unreasonable raised lip/step between studio and front meeting room; keep continuous same-height floor/platform. Simplify overlapping duplicate glass at studio/meeting boundary to ONE clean glass partition, no stacked repeated frames. Keep all other furniture in identical pixel positions, exact original style and warm light, especially desks/meeting/round table unchanged. Empty chair locations intentional. Do not add logo; exact original will be applied in app. No new decorations.

Prompt da segunda edição:

> Precise architectural correction ONLY. Target image is empty isometric office game background. At center foreground between black recording studio floor and cyan meeting room floor there is an unnecessary tall white concrete curb/vertical step or raised slab edge (roughly source pixel x550-600,y740-815). Remove this internal white curb/step and make a single CONTINUOUS FLUSH FLOOR level connecting studio to meeting room. The black studio flooring and blue meeting flooring meet with a thin flat seam, not a tall raised white partition/notch. Keep one simple glass divider with doorway there, no stacked overlapping glass frames. Preserve all other pixels as closely as possible: EXACT SAME camera registration/framing/aspect, identical furniture and table positions, floor textures, outer platform contour, kitchen water cooler inside kitchen, blank dark wall beside manager bookshelf, sofa, plants, lighting, city background. Do NOT add chairs or printer (will be animated separately), people, logo, labels or any new object. Change only the small internal floor join/glass at studio-meeting boundary, no layout changes.

O monitor decorativo da sala de reunião foi recolocado como elemento do cenário em tempo real após a limpeza da divisória.
