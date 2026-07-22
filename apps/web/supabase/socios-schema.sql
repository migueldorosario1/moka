-- ═══════════════════════════════════════════════════════════════════
-- MOKA — Painel de Sócios (schema)
-- Rode UMA VEZ no Supabase: Dashboard → SQL Editor → colar → Run.
-- Cria as tabelas de métricas (visitas/instalações), sócios e assinaturas.
-- ═══════════════════════════════════════════════════════════════════

-- 1) Eventos de métrica (visita diária por aparelho + instalação do app)
create table if not exists public.metrics_events (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('visit', 'install')),
  day date not null default current_date,
  device_hash text,                 -- hash do aparelho (p/ visita única/dia)
  created_at timestamptz not null default now()
);
create index if not exists metrics_events_kind_day_idx
  on public.metrics_events (kind, day);

-- Qualquer um pode registrar evento (visitante anônimo conta visita);
-- só usuário LOGADO lê (o painel é para sócios).
alter table public.metrics_events enable row level security;

drop policy if exists "metrics insert" on public.metrics_events;
create policy "metrics insert" on public.metrics_events
  for insert to anon, authenticated with check (true);

drop policy if exists "metrics select" on public.metrics_events;
create policy "metrics select" on public.metrics_events
  for select to authenticated using (true);

-- 2) Sócios (os 200). Posição 1 = primeiro investidor (Miguel).
create table if not exists public.partners (
  position int primary key check (position between 1 and 200),
  user_id uuid references auth.users (id) on delete set null,
  name text not null,
  email text,
  note text,
  created_at timestamptz not null default now()
);

alter table public.partners enable row level security;

drop policy if exists "partners select" on public.partners;
create policy "partners select" on public.partners
  for select to authenticated using (true);

-- Inserção/edição de sócios: por enquanto SÓ via dashboard do Supabase
-- (nenhuma policy de insert/update/delete = só o service role/admin escreve).

-- O primeiro sócio: Miguel do Rosário.
insert into public.partners (position, name, email, note)
values (1, 'Miguel do Rosário', 'migueldorosario@ocafezinho.com', 'Fundador')
on conflict (position) do nothing;

-- 3) Assinaturas (a sprint de pagamento preenche; o painel já lê).
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  tier text not null default 'cafezinho'
    check (tier in ('cafezinho', 'capuccino', 'familia')),
  status text not null default 'active'
    check (status in ('active', 'trialing', 'past_due', 'canceled')),
  gateway text,                     -- 'mercadopago' | 'paddle' | 'manual'
  gateway_id text,
  renews_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

drop policy if exists "subs select own" on public.subscriptions;
create policy "subs select own" on public.subscriptions
  for select to authenticated using (auth.uid() = user_id);

-- Sócios veem o total de assinantes (contagem), não os dados pessoais:
-- a contagem sai por uma view segura.
create or replace view public.subscriber_count as
select count(*)::int as total
from public.subscriptions
where status in ('active', 'trialing');

drop policy if exists "subs count select" on public.subscriptions;
-- (a view roda com as permissões do dono da view — segura pra contagem)
