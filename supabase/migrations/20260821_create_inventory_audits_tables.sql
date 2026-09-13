create table if not exists public.lmb_inventory_audits (
  id uuid primary key default gen_random_uuid(),
  audit_number text not null unique,
  location text not null check (location in ('dakar', 'abidjan', 'reserve')),
  status text not null default 'IN_PROGRESS' check (status in ('IN_PROGRESS', 'COMPLETED')),
  items jsonb not null default '[]'::jsonb,
  total_variance_value numeric(14,2) not null default 0,
  created_by text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_lmb_inventory_audits_location
  on public.lmb_inventory_audits (location);

create index if not exists idx_lmb_inventory_audits_status
  on public.lmb_inventory_audits (status);

create index if not exists idx_lmb_inventory_audits_created_at
  on public.lmb_inventory_audits (created_at desc);
