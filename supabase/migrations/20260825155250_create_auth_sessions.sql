create table public.auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  family_id uuid not null default gen_random_uuid(),
  token_hash char(64) not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  replaced_by_session_id uuid references public.auth_sessions(id) on delete set null,
  reuse_detected_at timestamptz,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  constraint auth_sessions_token_hash_unique unique (token_hash),
  constraint auth_sessions_token_hash_length_check
    check (length(token_hash) = 64),
  constraint auth_sessions_expiry_check check (expires_at > created_at),
  constraint auth_sessions_replacement_check
    check (replaced_by_session_id is null or replaced_by_session_id <> id)
);

create index auth_sessions_active_user_idx
  on public.auth_sessions (user_id, expires_at)
  where revoked_at is null;

create index auth_sessions_active_family_idx
  on public.auth_sessions (family_id)
  where revoked_at is null;

comment on table public.auth_sessions is
  'Member 1 revocable refresh sessions; refresh credentials are stored only as hashes.';
comment on column public.auth_sessions.token_hash is
  'SHA-256 hash of a random opaque refresh credential; never store the raw credential.';
comment on column public.auth_sessions.family_id is
  'Stable identifier connecting refresh-token rotations for replay revocation.';

alter table public.auth_sessions enable row level security;
alter table public.auth_sessions force row level security;

revoke all on table public.auth_sessions from anon, authenticated;
