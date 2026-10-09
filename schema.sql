-- Run once in Supabase SQL editor.
-- Also: Authentication > Providers > Email > turn OFF "Confirm email".
create extension if not exists pgcrypto;

create table rooms(
  id uuid primary key default gen_random_uuid(),
  room_no text unique not null,
  room_category text,
  room_images text[] not null default '{}',
  booked boolean not null default false,
  created_at timestamptz not null default now());

create table users(
  id uuid primary key default gen_random_uuid(),
  auth_id uuid unique references auth.users(id) on delete cascade,
  name text, phoneno text,
  username text unique not null,
  role text not null check (role in ('owner','staff')),
  work_hours text,
  created_at timestamptz not null default now());

-- one row per guest; the primary row carries the room rent (others 0) so a booking is counted once
create table customers(
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null,
  room_no text not null references rooms(room_no) on update cascade,
  no_of_guest int not null default 1,
  name text, phoneno text, uploaded_id text,
  check_in timestamptz not null default now(),
  check_out timestamptz,
  room_rent numeric not null default 0,
  rent_paid boolean not null default false,
  is_primary boolean not null default false,
  checked_out boolean not null default false,
  created_at timestamptz not null default now());
create index on customers(check_in);
create index on customers(booking_id);
-- DB-level double-booking guard
create unique index one_active_booking on customers(room_no) where is_primary and not checked_out;

create table enquiries(
  id uuid primary key default gen_random_uuid(),
  name text not null, phoneno text not null, room_no text, message text,
  created_at timestamptz not null default now());

create table extra_categories(
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  created_at timestamptz not null default now());

create table extra(
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null,
  room_no text,
  amount numeric not null default 0,
  note text, category text,
  created_at timestamptz not null default now());
create index on extra(booking_id);

-- helpers (security definer so policies never recurse)
create function my_role() returns text language sql stable security definer set search_path=public
as $$ select role from users where auth_id = auth.uid() $$;
create function is_staff() returns boolean language sql stable security definer set search_path=public
as $$ select coalesce(my_role() in ('owner','staff'), false) $$;
create function owner_exists() returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from users where role='owner') $$;

alter table rooms enable row level security;
alter table users enable row level security;
alter table customers enable row level security;
alter table enquiries enable row level security;
alter table extra_categories enable row level security;
alter table extra enable row level security;

create policy rooms_read  on rooms for select using (true);
create policy rooms_write on rooms for all to authenticated using (is_staff()) with check (is_staff());
create policy cust_all    on customers for all to authenticated using (is_staff()) with check (is_staff());
create policy extra_all   on extra for all to authenticated using (is_staff()) with check (is_staff());
create policy cat_all     on extra_categories for all to authenticated using (is_staff()) with check (is_staff());
create policy enq_insert  on enquiries for insert to anon, authenticated with check (true);
create policy enq_staff   on enquiries for all to authenticated using (is_staff()) with check (is_staff());
create policy users_read  on users for select to authenticated using (auth_id = auth.uid() or my_role()='owner');
create policy users_insert on users for insert to authenticated
  with check (my_role()='owner' or (auth_id = auth.uid() and role='owner' and not owner_exists()));
create policy users_update on users for update to authenticated using (my_role()='owner') with check (my_role()='owner');
create policy users_delete on users for delete to authenticated using (my_role()='owner');

-- storage: room photos public, guest IDs private
insert into storage.buckets(id,name,public) values ('room-images','room-images',true),('guest-ids','guest-ids',false)
on conflict (id) do nothing;
create policy room_img_read on storage.objects for select using (bucket_id='room-images');
create policy room_img_write on storage.objects for all to authenticated
  using (bucket_id='room-images' and is_staff()) with check (bucket_id='room-images' and is_staff());
create policy ids_all on storage.objects for all to authenticated
  using (bucket_id='guest-ids' and is_staff()) with check (bucket_id='guest-ids' and is_staff());
