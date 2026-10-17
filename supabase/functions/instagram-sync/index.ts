// Supabase Edge Function (opcional): atualiza os seguidores do Instagram no quadro da sala.
// Precisa de uma conta profissional do Instagram ligada a uma página do Facebook e de um token de acesso.
// Variáveis (Supabase > Edge Functions > Secrets):
//   IG_USER_ID        id da conta do Instagram na API (Instagram Graph API)
//   IG_ACCESS_TOKEN   token de acesso de longa duração
//   WORKSPACE_SLUG    endereço do escritório (o que vem depois de /w/)
//   IG_API_VERSION    opcional, ex.: v21.0
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem em toda Edge Function.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

Deno.serve(async () => {
  const env = (k: string) => Deno.env.get(k) || '';
  const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const { data: ws, error } = await sb.from('workspaces').select('id').eq('slug', env('WORKSPACE_SLUG')).single();
  if (error || !ws) return new Response('Escritório não encontrado', { status: 404 });
  const v = env('IG_API_VERSION') || 'v21.0';
  const r = await fetch(`https://graph.facebook.com/${v}/${env('IG_USER_ID')}?fields=followers_count,username&access_token=${encodeURIComponent(env('IG_ACCESS_TOKEN'))}`);
  const j = await r.json();
  if (!r.ok || typeof j.followers_count !== 'number') return new Response(JSON.stringify(j), { status: 502 });
  const { error: e2 } = await sb.from('instagram_stats').upsert({ workspace_id: ws.id, handle: '@' + j.username, followers: j.followers_count, source: 'api', updated_at: new Date().toISOString() });
  if (e2) return new Response(e2.message, { status: 500 });
  return new Response(JSON.stringify({ ok: true, followers: j.followers_count }), { headers: { 'content-type': 'application/json' } });
});
