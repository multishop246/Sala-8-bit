# Sala 8-bit

Escritório virtual em pixel art para equipes de marketing. Cada pessoa vira um personagem com mesa fixa, e a equipe acompanha quem está produzindo, em reunião ou no café, organiza as demandas num quadro e conversa sobre cada tarefa.

**Gratuito e de código aberto (licença MIT).** Cada empresa instala a sua cópia com contas grátis do Supabase e da Vercel, e os dados ficam com ela.

> **Experimente sem instalar:** abra o site sem configurar nada e clique em **Experimentar a demonstração**. Tudo roda no navegador, com uma equipe de exemplo.

## O que já funciona (versão 0.1)

- Login com Google ou link por e-mail, sem senha
- Criação do escritório da empresa, com endereço próprio (`/w/sua-equipe`)
- Convites por link (membro ou gestor), com validade e limite de usos
- Criação do personagem: foto do rosto (lida só no aparelho), sexo, pele, cabelo, barba, acessório, roupa e cor
- Funções (principal + até 2 adjacentes), horários e pasta de relatórios
- **Mesa fixa:** cada pessoa escolhe a sua uma vez, com plaquinha de nome; só o administrador libera
- Gestor com coroa e mesa da diretoria, só acompanha
- Configurações: nome, número de mesas, linhas/marcas/clientes, funções e apps produtivos, áreas e tipos de tarefa (já vem com um catálogo completo de marketing), regras de café, almoço, ociosidade e recursos ligáveis
- Funciona no computador e no celular, e pode ser instalado como app (PWA)
- Segurança no banco: cada empresa só enxerga os próprios dados (Row Level Security, testado em `scripts/test-db.mjs`)

## Próximas versões

Veja [docs/ROTEIRO.md](docs/ROTEIRO.md). Em resumo: presença ao vivo na sala → quadro de tarefas e chat → Mural da Glória e relatórios → app de computador (Windows e macOS) que mede o app em foco.

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
- `src/lib/data-supabase.ts` fala com o Supabase; `src/lib/data-demo.ts` imita as mesmas regras no navegador.
- `supabase/migrations/` cria tabelas, regras de segurança e funções. O catálogo padrão vem de `src/lib/catalog-default.json` (rode `node scripts/gen-catalog-sql.mjs` depois de editar).

## Privacidade

O Sala 8-bit foi pensado para ser transparente com a equipe. O app de computador (próximas versões) registra só o **nome** do app em foco e a **categoria** das páginas, calculada no próprio computador. Nunca registra endereços de sites, telas, teclas, títulos de janelas ou conteúdo de arquivos. Antes de usar, leia [docs/PRIVACIDADE.md](docs/PRIVACIDADE.md): a empresa que instala é responsável por informar a equipe (LGPD).
