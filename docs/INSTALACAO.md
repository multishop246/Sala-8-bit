# Guia de instalação

Você vai criar duas contas gratuitas: o **Supabase** (banco de dados e login) e a **Vercel** (hospeda o site). No fim, sua equipe acessa por um endereço como `https://sala-da-minha-equipe.vercel.app`.

Tempo: uns 15 minutos. Não precisa instalar nada no computador.

---

## 1. Copie o projeto para o seu GitHub

1. Crie uma conta em [github.com](https://github.com) (se ainda não tiver).
2. Abra o repositório do Sala 8-bit e clique em **Fork** (canto superior direito) → **Create fork**.

Assim você tem uma cópia sua, que a Vercel vai publicar.

## 2. Crie o banco no Supabase

1. Entre em [supabase.com](https://supabase.com) → **Start your project** → entre com o GitHub.
2. **New project**. Dê um nome (ex.: `sala-8-bit`), crie uma senha forte para o banco (guarde) e escolha a região **South America (São Paulo)**.
3. Espere o projeto ficar pronto (1 a 2 minutos).
4. No menu da esquerda, abra **SQL Editor** → **New query**.
5. No seu fork do GitHub, abra a pasta `supabase/migrations`. Para **cada arquivo, em ordem** (`0001…`, depois `0002…`):
   - abra o arquivo, clique em **Raw**, copie tudo;
   - cole no SQL Editor e clique em **Run**. Deve aparecer *Success*.

## 3. Pegue as chaves do Supabase

Em **Project Settings → API** (ou **Data API**), copie:

- **Project URL** (algo como `https://abcd1234.supabase.co`)
- **anon public** key (uma chave longa)

A chave *anon* é pública por natureza: a proteção dos dados está nas regras do banco que você rodou no passo 2. **Nunca** use a chave `service_role` no site.

## 4. Publique o site na Vercel

1. Entre em [vercel.com](https://vercel.com) com o GitHub.
2. **Add New → Project** → escolha o seu fork do Sala 8-bit → **Import**.
3. Em **Environment Variables**, adicione:
   - `VITE_SUPABASE_URL` = a Project URL
   - `VITE_SUPABASE_ANON_KEY` = a chave anon public
4. Clique em **Deploy**. Em um minuto você recebe o endereço do site.

## 5. Ligue o login

No Supabase, em **Authentication → URL Configuration**:

- **Site URL:** o endereço da Vercel (ex.: `https://sala-da-minha-equipe.vercel.app`)
- **Redirect URLs:** adicione `https://sala-da-minha-equipe.vercel.app/**`

Pronto: o login por **link no e-mail** já funciona.

> O e-mail que vem com o Supabase tem um limite baixo de envios por hora, bom para começar. Se a equipe for maior ou os links demorarem, configure um SMTP gratuito (Brevo, Resend etc.) em **Authentication → Emails → SMTP Settings**.

### Login com Google (opcional)

1. No [Google Cloud Console](https://console.cloud.google.com), crie um projeto → **APIs e serviços → Tela de consentimento OAuth** (tipo *Externo*, preencha nome e e-mail).
2. **Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo da Web.**
3. Em **URIs de redirecionamento autorizados**, cole: `https://SEU-PROJETO.supabase.co/auth/v1/callback` (o Supabase mostra esse endereço na tela do provedor Google).
4. Copie o **ID do cliente** e a **chave secreta** para o Supabase em **Authentication → Providers → Google** e ative.

## 6. Crie o escritório

1. Abra o site, entre e clique em **Criar escritório**.
2. Em **Configurações**, cadastre as linhas/marcas, ajuste funções e regras.
3. Em **Configurações → Convites**, gere o link e mande para a equipe. Para o gestor, gere um convite do tipo **Gestor**.

---

## Perguntas comuns

**É grátis mesmo?** Sim, nos planos gratuitos do Supabase e da Vercel, que sobram para uma equipe de marketing. O Supabase gratuito **pausa projetos sem nenhum uso por uma semana**; com a equipe entrando todo dia isso não acontece. Se pausar, é só reativar no painel.

**Posso usar meu próprio domínio?** Sim, em Vercel → Settings → Domains. Depois atualize a Site URL e as Redirect URLs do Supabase.

**Atualizando da 0.1 para a 0.2:** rode no SQL Editor só o arquivo novo `0003_sala_ao_vivo.sql`.

**Como atualizo para uma versão nova?** No seu fork, clique em **Sync fork**. A Vercel publica sozinha. Se a versão trouxer arquivos novos em `supabase/migrations`, rode só os novos no SQL Editor, em ordem.

**Quero testar antes.** Abra o site sem preencher as variáveis e clique em **Experimentar a demonstração**.
