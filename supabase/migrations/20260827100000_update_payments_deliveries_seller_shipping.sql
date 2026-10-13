-- Migration to enhance Member 4 tables with seller relations, shipping carrier, and invoice fields

alter table public.orders
  add column if not exists seller_id uuid references public.users(id) on delete set null,
  add column if not exists item_title text,
  add column if not exists quantity integer not null default 1;

alter table public.payments
  add column if not exists seller_id uuid references public.users(id) on delete set null,
  add column if not exists currency text not null default 'LKR',
  add column if not exists stripe_payment_intent_id text,
  add column if not exists receipt_url text;

alter table public.deliveries
  add column if not exists seller_id uuid references public.users(id) on delete set null,
  add column if not exists carrier text,
  add column if not exists shipping_address text;

-- Update status constraints if needed
comment on column public.orders.seller_id is 'Seller user ID for marketplace peer-to-peer transaction';
comment on column public.deliveries.seller_id is 'Seller who is fulfilling or handing off the item';
comment on column public.deliveries.carrier is 'Courier or postage service provider (e.g. SL Post, Prompt, Koombiyo)';
comment on column public.deliveries.shipping_address is 'Shipping address for parcel delivery';
