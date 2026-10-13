-- Migration to create orders, payments, and deliveries tables for Member 4
-- Since Member 3 (Orders) has not implemented the orders table yet, we create a basic version here.

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  total_amount numeric(10, 2) not null,
  status text not null check (status in ('pending', 'paid', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.orders is 'Lightweight orders table (provisional for Member 3 integration)';

alter table public.orders enable row level security;
alter table public.orders force row level security;
revoke all on table public.orders from anon, authenticated;


create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  payment_method text not null check (payment_method in ('stripe', 'cash_on_meetup')),
  amount numeric(10, 2) not null,
  status text not null check (status in ('pending', 'completed', 'refunded', 'failed')),
  transaction_reference text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.payments is 'Member 4 secure transaction records';

alter table public.payments enable row level security;
alter table public.payments force row level security;
revoke all on table public.payments from anon, authenticated;


create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  delivery_method text not null check (delivery_method in ('meetup', 'shipping')),
  status text not null check (status in ('scheduled', 'in_transit', 'delivered', 'cancelled')),
  tracking_number text unique,
  meetup_location text,
  meetup_time timestamptz,
  qr_code_hash text,
  verification_code text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.deliveries is 'Member 4 delivery tracking and campus meetup schedules';

alter table public.deliveries enable row level security;
alter table public.deliveries force row level security;
revoke all on table public.deliveries from anon, authenticated;
