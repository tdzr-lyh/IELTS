create table if not exists public.learning_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account_name text not null,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.learning_states enable row level security;

drop policy if exists "users can read own state" on public.learning_states;
create policy "users can read own state"
on public.learning_states
for select
using (auth.uid() = user_id);

drop policy if exists "users can insert own state" on public.learning_states;
create policy "users can insert own state"
on public.learning_states
for insert
with check (auth.uid() = user_id);

drop policy if exists "users can update own state" on public.learning_states;
create policy "users can update own state"
on public.learning_states
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
