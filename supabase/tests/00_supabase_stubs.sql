-- Substitutos MÍNIMOS do que o Supabase já fornece (auth, storage, roles), só para validar as
-- migrations num Postgres comum. NÃO use em um projeto Supabase real.
create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists storage;

do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  if not exists (select from pg_roles where rolname = 'authenticator') then create role authenticator login noinherit password 'authenticator'; end if;
end $$;
grant anon, authenticated, service_role to authenticator;

create table auth.users (
  instance_id uuid,
  id uuid primary key default gen_random_uuid(),
  aud text default 'authenticated',
  role text default 'authenticated',
  email text unique,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmation_token text,
  email_change text,
  email_change_token_new text,
  recovery_token text
);
create table auth.identities (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  provider_id text not null,
  identity_data jsonb not null,
  provider text not null,
  last_sign_in_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
);

create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
$$;

create table storage.buckets (id text primary key, name text not null, public boolean not null default false);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid,
  created_at timestamptz not null default now()
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)]
$$;

grant usage on schema public, extensions, auth, storage to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;
-- como no Supabase: tabelas novas em public nascem com todos os privilégios (as migrations revogam o excesso)
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
