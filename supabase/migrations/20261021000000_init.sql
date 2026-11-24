-- Smart SQL Query Compiler: persistence model
-- Apply with the Supabase CLI (`supabase db push`) or paste into the SQL editor.
-- The front-end signs users in anonymously (Authentication > Providers > Anonymous must be enabled),
-- so every row is owned by auth.uid() and protected by Row Level Security.

create table if not exists public.query_history (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  original_query     text not null check (char_length(original_query) between 1 and 10000),
  compilation_status text not null check (compilation_status in ('success', 'failed')),
  error_count        integer not null default 0 check (error_count >= 0),
  optimization_count integer not null default 0 check (optimization_count >= 0),
  duration_ms        numeric check (duration_ms is null or duration_ms >= 0),
  created_at         timestamptz not null default now()
);

create index if not exists query_history_user_created_idx
  on public.query_history (user_id, created_at desc);

alter table public.query_history enable row level security;

drop policy if exists "history: owner can read" on public.query_history;
create policy "history: owner can read"   on public.query_history for select using (auth.uid() = user_id);
drop policy if exists "history: owner can insert" on public.query_history;
create policy "history: owner can insert" on public.query_history for insert with check (auth.uid() = user_id);
drop policy if exists "history: owner can delete" on public.query_history;
create policy "history: owner can delete" on public.query_history for delete using (auth.uid() = user_id);
-- No UPDATE policy: history rows are immutable.

create table if not exists public.user_preferences (
  user_id         uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  theme           text not null default 'dark' check (theme in ('dark', 'light')),
  editor_settings jsonb not null default '{}'::jsonb,
  updated_at      timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

drop policy if exists "prefs: owner can read" on public.user_preferences;
create policy "prefs: owner can read"   on public.user_preferences for select using (auth.uid() = user_id);
drop policy if exists "prefs: owner can insert" on public.user_preferences;
create policy "prefs: owner can insert" on public.user_preferences for insert with check (auth.uid() = user_id);
drop policy if exists "prefs: owner can update" on public.user_preferences;
create policy "prefs: owner can update" on public.user_preferences for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "prefs: owner can delete" on public.user_preferences;
create policy "prefs: owner can delete" on public.user_preferences for delete using (auth.uid() = user_id);

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists user_preferences_touch on public.user_preferences;
create trigger user_preferences_touch before update on public.user_preferences
  for each row execute function public.touch_updated_at();
