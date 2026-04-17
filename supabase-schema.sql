create extension if not exists pgcrypto;

create table if not exists app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null default '',
  phone text not null default '',
  apartment text not null,
  building text not null default '',
  monthly_fee numeric(12,2) not null default 0,
  balance numeric(12,2) not null default 0,
  next_due_date date,
  status text not null default 'Activo',
  payment_status text not null default 'Pendiente',
  notes text not null default '',
  owner_username text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  full_name text not null,
  email text not null default '',
  role text not null check (role in ('admin', 'superadmin', 'cliente')),
  is_active boolean not null default true,
  client_id uuid null references clients(id) on delete set null,
  salt text not null,
  password_hash text not null,
  created_at timestamptz not null default now(),
  last_login timestamptz null
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  payment_date date not null,
  payment_method text not null default 'Transferencia',
  reference_number text not null default '',
  notes text not null default '',
  status text not null default 'Confirmado',
  created_by uuid null references app_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  expense_date date not null,
  category text not null default 'General',
  payment_method text not null default 'Transferencia',
  reference_number text not null default '',
  notes text not null default '',
  created_by uuid null references app_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  event_date date not null,
  event_time text not null default '',
  event_type text not null default 'general',
  color text not null default '#00d4ff',
  created_at timestamptz not null default now()
);

create index if not exists idx_clients_full_name on clients(full_name);
create index if not exists idx_clients_owner_username on clients(owner_username);
create index if not exists idx_users_username on app_users(username);
create index if not exists idx_payments_client_date on payments(client_id, payment_date desc);
create index if not exists idx_expenses_date on expenses(expense_date desc);
create index if not exists idx_events_date on calendar_events(event_date asc);

alter table app_settings enable row level security;
alter table clients enable row level security;
alter table app_users enable row level security;
alter table payments enable row level security;
alter table expenses enable row level security;
alter table calendar_events enable row level security;

drop policy if exists app_settings_public_rw on app_settings;
drop policy if exists clients_public_rw on clients;
drop policy if exists app_users_public_rw on app_users;
drop policy if exists payments_public_rw on payments;
drop policy if exists expenses_public_rw on expenses;
drop policy if exists calendar_events_public_rw on calendar_events;

create policy app_settings_public_rw on app_settings for all to anon, authenticated using (true) with check (true);
create policy clients_public_rw on clients for all to anon, authenticated using (true) with check (true);
create policy app_users_public_rw on app_users for all to anon, authenticated using (true) with check (true);
create policy payments_public_rw on payments for all to anon, authenticated using (true) with check (true);
create policy expenses_public_rw on expenses for all to anon, authenticated using (true) with check (true);
create policy calendar_events_public_rw on calendar_events for all to anon, authenticated using (true) with check (true);
