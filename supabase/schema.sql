-- SnapClaim AU — Supabase Schema
-- Run this in your Supabase SQL editor at https://app.supabase.com

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Receipts table
create table if not exists receipts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  merchant text not null,
  amount numeric(10,2) not null check (amount > 0),
  date date not null,
  category text not null,
  work_pct integer not null default 100 check (work_pct between 0 and 100),
  notes text default '',
  deduction_amount numeric(10,2) not null,
  tax_back_amount numeric(10,2) not null,
  ai_scanned boolean default false,
  ocr_raw text,
  ato_tip text,
  confidence integer,
  fy_year text not null,
  created_at timestamptz default now()
);

-- Tax profiles table (one per user)
create table if not exists tax_profiles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  marginal_rate numeric(4,3) not null default 0.325,
  business_type text not null default 'individual',
  name text,
  abn text,
  updated_at timestamptz default now()
);

-- Audit log (append-only for ATO compliance — 5 year retention)
create table if not exists audit_log (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  action text not null,
  receipt_id uuid,
  snapshot jsonb,
  created_at timestamptz default now()
);

-- Row Level Security (RLS) — users only see their own data
alter table receipts enable row level security;
alter table tax_profiles enable row level security;
alter table audit_log enable row level security;

create policy "Users can manage own receipts"
  on receipts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage own tax profile"
  on tax_profiles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can read own audit log"
  on audit_log for select
  using (auth.uid() = user_id);

-- Indexes for performance
create index if not exists receipts_user_fy on receipts(user_id, fy_year);
create index if not exists receipts_category on receipts(user_id, category);
create index if not exists receipts_date on receipts(user_id, date desc);

-- Trigger to auto-create tax profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.tax_profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Function to get dashboard stats for a user + FY
create or replace function get_dashboard_stats(p_user_id uuid, p_fy_year text)
returns json as $$
declare
  result json;
begin
  select json_build_object(
    'total_deductions', coalesce(sum(deduction_amount), 0),
    'total_tax_back', coalesce(sum(tax_back_amount), 0),
    'receipt_count', count(*),
    'ai_scanned_count', count(*) filter (where ai_scanned = true)
  ) into result
  from receipts
  where user_id = p_user_id and fy_year = p_fy_year;
  return result;
end;
$$ language plpgsql security definer;
