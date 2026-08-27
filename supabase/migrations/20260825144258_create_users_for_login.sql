create extension if not exists pgcrypto;

create table public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text not null,
  email_verified_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_email_normalized_check check (email = lower(btrim(email))),
  constraint users_email_unique unique (email)
);

comment on table public.users is
  'Member 1 student identities used by FastAPI-managed authentication.';
comment on column public.users.password_hash is
  'Argon2 password hash; plaintext passwords must never be persisted.';

alter table public.users enable row level security;
alter table public.users force row level security;

revoke all on table public.users from anon, authenticated;
