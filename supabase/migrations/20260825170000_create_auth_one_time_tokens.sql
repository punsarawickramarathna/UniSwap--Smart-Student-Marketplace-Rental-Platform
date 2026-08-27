create table public.auth_one_time_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  purpose varchar(32) not null,
  token_hash char(64) not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  invalidated_at timestamptz,
  created_at timestamptz not null default now(),
  constraint auth_one_time_tokens_hash_unique unique (token_hash),
  constraint auth_one_time_tokens_hash_length_check check (length(token_hash) = 64),
  constraint auth_one_time_tokens_purpose_check
    check (purpose in ('email_verification', 'password_reset')),
  constraint auth_one_time_tokens_expiry_check check (expires_at > created_at)
);

create index auth_one_time_tokens_active_user_purpose_idx
  on public.auth_one_time_tokens (user_id, purpose, expires_at)
  where consumed_at is null and invalidated_at is null;

comment on table public.auth_one_time_tokens is
  'Member 1 single-use authentication tokens. Only SHA-256 token hashes are persisted.';
comment on column public.auth_one_time_tokens.purpose is
  'Separates password reset and email verification credentials even though they share secure storage.';
comment on column public.auth_one_time_tokens.token_hash is
  'SHA-256 hash of a high-entropy opaque token; raw tokens must never be persisted.';

alter table public.auth_one_time_tokens enable row level security;
alter table public.auth_one_time_tokens force row level security;

revoke all on table public.auth_one_time_tokens from anon, authenticated;
