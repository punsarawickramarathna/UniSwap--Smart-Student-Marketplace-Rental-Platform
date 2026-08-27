alter table public.users
  add column if not exists student_id text;

alter table public.users
  add constraint users_student_id_format_check
  check (student_id is null or student_id ~ '^ITBIN[0-9]{8}$');

create unique index if not exists users_student_id_unique_idx
  on public.users (student_id)
  where student_id is not null;

comment on column public.users.student_id is
  'Canonical student login identifier. New registrations require ITBIN followed by exactly 8 digits; nullable only for legacy rows.';


alter table public.auth_one_time_tokens
  add column if not exists attempt_count integer not null default 0;

alter table public.auth_one_time_tokens
  add constraint auth_one_time_tokens_attempt_count_check
  check (attempt_count >= 0);

comment on column public.auth_one_time_tokens.attempt_count is
  'Durable failed-attempt counter used to throttle low-entropy email verification codes.';
