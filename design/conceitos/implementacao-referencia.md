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
