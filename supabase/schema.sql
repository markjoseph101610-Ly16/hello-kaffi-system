-- =====================================================================
-- Hello Kaffi - Supabase (PostgreSQL) schema
-- Run ONCE: Supabase dashboard > SQL Editor > New query > paste all > Run.
-- Safe to run again (uses IF NOT EXISTS). Matches api/index.js + api/_lib/tables.js.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) kaffi_docs  - the app's main store (api/index.js reads/writes this)
--    col = collection name, id = document id, data = JSON
--    (kaffi = menu/orders/accounts, kaffi_proofs = GCash proofs,
--     kaffi_reports = sales CSVs, kaffi_pending = OTP sign-ups)
-- ---------------------------------------------------------------------
create table if not exists public.kaffi_docs (
  col        text        not null,
  id         text        not null,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (col, id)
);
create index if not exists kaffi_docs_col_idx on public.kaffi_docs (col);
-- findBy() in the API looks up kaffi_pending by data->>'username'
create index if not exists kaffi_docs_pending_username_idx
  on public.kaffi_docs ((data ->> 'username')) where col = 'kaffi_pending';

-- ---------------------------------------------------------------------
-- 2) Real tables (copied from kaffi_docs by api/_lib/tables.js after each save)
--    Use these for reports, Table Editor, and joins.
-- ---------------------------------------------------------------------

-- POS staff (admin / cashier)
create table if not exists public.staff_accounts (
  username      text primary key,
  full_name     text not null,
  role_code     text not null check (role_code in ('admin', 'cashier')),
  password_hash text not null,
  created_at    timestamptz not null default now()
);

-- Customers: username+password accounts and Google accounts, one row per email
create table if not exists public.customers (
  email              text primary key,
  username           text unique,
  full_name          text not null,
  phone              text,
  address            text,
  password_hash      text,
  auth_provider      text not null default 'password' check (auth_provider in ('password', 'google')),
  created_at         timestamptz,
  profile_updated_at timestamptz
);

-- Cash-on-delivery pause (3 cancels in 30 days)
create table if not exists public.cod_bans (
  customer_email text primary key references public.customers (email) on update cascade on delete cascade,
  banned_until   timestamptz not null
);

create table if not exists public.menu_categories (
  name       text primary key,
  sort_order int  not null default 0
);

create table if not exists public.menu_items (
  id          bigint primary key,
  category    text not null references public.menu_categories (name) on update cascade,
  name        text not null,
  description text,
  price       numeric(10, 2) not null check (price >= 0),
  stock       int not null default 0 check (stock >= 0)
);
create index if not exists menu_items_category_idx on public.menu_items (category);

create table if not exists public.riders (
  id           bigint primary key,
  name         text not null,
  phone        text,
  is_on_duty   boolean not null default true,
  is_returning boolean not null default false
);

create table if not exists public.orders (
  id                 bigint primary key,
  source_code        text not null check (source_code in ('Online', 'POS')),
  type_code          text not null check (type_code in ('delivery', 'pickup', 'walk-in')),
  service_code       text check (service_code in ('dine-in', 'take-out')),
  status_code        text not null check (status_code in
                       ('Pending', 'Payment Review', 'Payment Retry', 'Preparing', 'Ready', 'Completed', 'Cancelled')),
  customer_email     text references public.customers (email) on update cascade on delete set null,
  customer_name      text,
  note               text,
  table_no           text,
  subtotal           numeric(10, 2) not null default 0,
  discount_amount    numeric(10, 2) not null default 0,
  total              numeric(10, 2) not null default 0,
  placed_at          timestamptz not null,
  cancel_reason_code text check (cancel_reason_code in ('customer', 'fake_proof', 'other')),
  cancelled_at       timestamptz,
  is_imported        boolean not null default false
);
create index if not exists orders_placed_at_idx on public.orders (placed_at desc);
create index if not exists orders_status_idx    on public.orders (status_code);
create index if not exists orders_customer_idx  on public.orders (customer_email);

create table if not exists public.order_items (
  id           bigint generated always as identity primary key,
  order_id     bigint not null references public.orders (id) on delete cascade,
  menu_item_id bigint references public.menu_items (id) on delete set null,
  item_name    text not null,
  unit_price   numeric(10, 2) not null default 0,
  quantity     int not null default 1 check (quantity >= 1)
);
create index if not exists order_items_order_idx on public.order_items (order_id);

create table if not exists public.payments (
  order_id       bigint primary key references public.orders (id) on delete cascade,
  method_code    text not null check (method_code in ('GCash', 'Cash', 'COD')),
  amount         numeric(10, 2) not null default 0,
  gcash_ref      text,
  proof_file     text,
  proof_viewed   boolean not null default false,
  proof_attempts int not null default 0,
  is_paid        boolean not null default false,
  checked_by     text references public.staff_accounts (username) on update cascade on delete set null,
  checked_at     timestamptz
);

create table if not exists public.deliveries (
  order_id      bigint primary key references public.orders (id) on delete cascade,
  address       text not null,
  contact_phone text,
  rider_id      bigint references public.riders (id) on delete set null,
  is_dispatched boolean not null default false,
  dispatched_at timestamptz
);
create index if not exists deliveries_rider_idx on public.deliveries (rider_id);

create table if not exists public.order_discounts (
  order_id   bigint primary key references public.orders (id) on delete cascade,
  type_code  text not null default 'Senior Citizen',
  id_number  text,
  rate       numeric(5, 2) not null default 0,   -- percent, e.g. 20.00
  vat_exempt boolean not null default false,
  amount     numeric(10, 2) not null default 0
);

-- ---------------------------------------------------------------------
-- 3) Handy report view (daily sales of non-cancelled orders)
-- ---------------------------------------------------------------------
create or replace view public.sales_by_day with (security_invoker = on) as
  select (placed_at at time zone 'Asia/Manila')::date as sales_date,
         count(*)                as orders,
         sum(total)              as total_sales,
         sum(discount_amount)    as total_discounts
  from public.orders
  where status_code <> 'Cancelled'
  group by 1
  order by 1 desc;

-- ---------------------------------------------------------------------
-- 4) SECURITY: lock everything. The website never talks to Supabase directly;
--    only your Render backend does, using the secret (service_role) key, which
--    bypasses RLS. With RLS on and no policies, the public/publishable key
--    can read NOTHING (these tables hold password hashes and customer data).
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'kaffi_docs','staff_accounts','customers','cod_bans','menu_categories','menu_items',
    'riders','orders','order_items','payments','deliveries','order_discounts'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
revoke all on public.sales_by_day from anon, authenticated;
