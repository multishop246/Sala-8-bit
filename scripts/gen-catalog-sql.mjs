// Gera supabase/migrations/0001_catalogo_padrao.sql a partir de src/lib/catalog-default.json
// (o mesmo arquivo é usado pelo modo demonstração). Rode depois de editar o JSON:
//   node scripts/gen-catalog-sql.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const data = JSON.parse(readFileSync(new URL('../src/lib/catalog-default.json', import.meta.url), 'utf8'));
const json = JSON.stringify(data).replace(/'/g, "''");
const sql = `-- Gerado por scripts/gen-catalog-sql.mjs a partir de src/lib/catalog-default.json. Não edite à mão.
-- Catálogo padrão (funções, áreas e tipos de tarefa) que toda empresa nova recebe.
create or replace function public.default_catalog() returns jsonb
language sql immutable as $$ select '${json}'::jsonb $$;
`;
writeFileSync(new URL('../supabase/migrations/0001_catalogo_padrao.sql', import.meta.url), sql);
console.log('ok');
