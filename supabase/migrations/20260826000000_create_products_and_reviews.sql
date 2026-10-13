-- UniSwap Member 2 Migration: Products, Categories, Product Images, and Reviews
-- Supabase PostgreSQL Schema & Storage

create extension if not exists pgcrypto;

-- 1. Categories Table
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  icon text,
  created_at timestamptz not null default now()
);

comment on table public.categories is
  'Product categories for UniSwap marketplace listings.';

-- Pre-seed default categories
insert into public.categories (name, slug, icon)
values
  ('Academic Books', 'academic-books', 'BookOpen'),
  ('Calculators', 'calculators', 'Calculator'),
  ('Laptops & Electronics', 'laptops-electronics', 'Laptop'),
  ('Furniture', 'furniture', 'Sofa'),
  ('Hostel Items', 'hostel-items', 'ShoppingBag'),
  ('Lab Equipment', 'lab-equipment', 'BarChart3'),
  ('Course Materials', 'course-materials', 'BookOpen'),
  ('Other', 'other', 'Tag')
on conflict (slug) do nothing;

-- 2. Products Table
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.users(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  category_name text not null default 'Other',
  title text not null,
  description text not null default '',
  price numeric(10, 2) not null default 0.00,
  condition text not null,
  product_type text not null,
  rental_price_per_day numeric(10, 2),
  rental_duration text,
  location text,
  status text not null default 'available',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_price_check check (price >= 0),
  constraint products_rental_price_check check (rental_price_per_day is null or rental_price_per_day >= 0),
  constraint products_condition_check check (condition in ('New', 'Like New', 'Used - Good', 'Good', 'Fair')),
  constraint products_product_type_check check (product_type in ('For Sale', 'For Rent', 'Exchange', 'Buy', 'Rent')),
  constraint products_status_check check (status in ('available', 'rented', 'sold', 'inactive', 'Active', 'Sold', 'Rented'))
);

comment on table public.products is
  'Student marketplace and rental product listings owned by authenticated users.';

create index if not exists products_seller_id_idx on public.products (seller_id);
create index if not exists products_category_name_idx on public.products (category_name);
create index if not exists products_product_type_idx on public.products (product_type);
create index if not exists products_status_idx on public.products (status);
create index if not exists products_created_at_idx on public.products (created_at desc);

-- 3. Product Images Table
create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  image_url text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.product_images is
  'Multiple product images linked to each marketplace listing.';

create index if not exists product_images_product_id_idx on public.product_images (product_id);

-- 4. Reviews & Ratings Table
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  rating integer not null,
  comment text not null,
  is_verified_purchase boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reviews_rating_range_check check (rating >= 1 and rating <= 5),
  constraint reviews_product_user_unique unique (product_id, user_id)
);

comment on table public.reviews is
  'Student reviews and 1-5 star ratings for products with verified purchase flags.';

create index if not exists reviews_product_id_idx on public.reviews (product_id);
create index if not exists reviews_user_id_idx on public.reviews (user_id);
create index if not exists reviews_rating_idx on public.reviews (rating);

-- 5. Supabase Storage Bucket for Product Images
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

-- 6. Row Level Security (RLS)
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.reviews enable row level security;

-- Categories RLS: Read-only for all users
drop policy if exists "Categories are viewable by everyone" on public.categories;
create policy "Categories are viewable by everyone"
  on public.categories for select
  using (true);

-- Products RLS: Anyone can view active products, owners can modify their own
drop policy if exists "Products are viewable by everyone" on public.products;
create policy "Products are viewable by everyone"
  on public.products for select
  using (true);

drop policy if exists "Users can insert their own products" on public.products;
create policy "Users can insert their own products"
  on public.products for insert
  with check (auth.uid() = seller_id);

drop policy if exists "Users can update their own products" on public.products;
create policy "Users can update their own products"
  on public.products for update
  using (auth.uid() = seller_id);

drop policy if exists "Users can delete their own products" on public.products;
create policy "Users can delete their own products"
  on public.products for delete
  using (auth.uid() = seller_id);

-- Product Images RLS: Anyone can view, owner of the product can manage
drop policy if exists "Product images are viewable by everyone" on public.product_images;
create policy "Product images are viewable by everyone"
  on public.product_images for select
  using (true);

drop policy if exists "Product owners can insert images" on public.product_images;
create policy "Product owners can insert images"
  on public.product_images for insert
  with check (
    exists (
      select 1 from public.products
      where products.id = product_images.product_id
      and products.seller_id = auth.uid()
    )
  );

drop policy if exists "Product owners can delete images" on public.product_images;
create policy "Product owners can delete images"
  on public.product_images for delete
  using (
    exists (
      select 1 from public.products
      where products.id = product_images.product_id
      and products.seller_id = auth.uid()
    )
  );

-- Reviews RLS: Anyone can read, users can insert for products they do not own, owners can update/delete their own
drop policy if exists "Reviews are viewable by everyone" on public.reviews;
create policy "Reviews are viewable by everyone"
  on public.reviews for select
  using (true);

drop policy if exists "Users can insert reviews for non-owned products" on public.reviews;
create policy "Users can insert reviews for non-owned products"
  on public.reviews for insert
  with check (
    auth.uid() = user_id
    and not exists (
      select 1 from public.products
      where products.id = reviews.product_id
      and products.seller_id = auth.uid()
    )
  );

drop policy if exists "Users can update their own reviews" on public.reviews;
create policy "Users can update their own reviews"
  on public.reviews for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own reviews" on public.reviews;
create policy "Users can delete their own reviews"
  on public.reviews for delete
  using (auth.uid() = user_id);

-- Supabase Storage RLS Policies for product-images bucket
drop policy if exists "Public access to product images" on storage.objects;
create policy "Public access to product images"
  on storage.objects for select
  using (bucket_id = 'product-images');

drop policy if exists "Authenticated users can upload product images" on storage.objects;
create policy "Authenticated users can upload product images"
  on storage.objects for insert
  with check (
    bucket_id = 'product-images'
    and auth.role() = 'authenticated'
  );

drop policy if exists "Users can delete their own uploaded images" on storage.objects;
create policy "Users can delete their own uploaded images"
  on storage.objects for delete
  using (
    bucket_id = 'product-images'
    and auth.uid() = owner
  );
