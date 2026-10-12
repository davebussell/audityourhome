-- =============================================================================
-- AuditYourHome accounts: homes, audit records, upgrade plans, reminders,
-- email alerts and advisor/contractor matching.
--
-- Run once on a new Supabase project (SQL editor, or `supabase db push`).
-- Safe to re-run: every object is created with IF NOT EXISTS / OR REPLACE.
--
-- Security model
--   * Every table has row-level security (RLS). Homeowners can read and change
--     only their own rows.
--   * Privileges are granted explicitly (Supabase stopped auto-exposing new
--     tables to the Data API in 2026).
--   * Anything that needs extra checks (match requests, alert consent,
--     admin work, unsubscribe, account deletion) goes through a SECURITY
--     DEFINER function with `search_path = ''` and an explicit EXECUTE grant.
--   * Admins (Dave, plus anyone he adds) can see match requests and, for
--     people who asked to be matched, the home details needed to match them.
--     Admins cannot see the homes of people who never asked for a match.
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Small helpers (private schema: not exposed through the Data API)
-- -----------------------------------------------------------------------------

create or replace function private.clean(p text, n int)
returns text language sql immutable set search_path = '' as $$
  select nullif(left(btrim(coalesce(p, '')), n), '')
$$;

create or replace function private.pick(p text, allowed text[])
returns text language sql immutable set search_path = '' as $$
  select case when p = any (allowed) then p end
$$;

create or replace function private.to_int(p text)
returns integer language sql immutable set search_path = '' as $$
  select case when btrim(coalesce(p, '')) ~ '^-?[0-9]{1,9}(\.[0-9]+)?$'
              then round(btrim(p)::numeric)::integer end
$$;

create or replace function private.clamp_int(p text, lo integer, hi integer)
returns integer language sql immutable set search_path = '' as $$
  select case when v is null then null else greatest(lo, least(hi, v)) end
  from (select private.to_int(p) as v) s
$$;

create or replace function private.provinces()
returns text[] language sql immutable set search_path = '' as $$
  select array['AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT']
$$;

create or replace function private.clean_provinces(p jsonb)
returns text[] language sql immutable set search_path = '' as $$
  select coalesce(array_agg(distinct upper(v) order by upper(v)), '{}')
  from jsonb_array_elements_text(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) as t(v)
  where upper(v) = any (private.provinces())
$$;

create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text check (char_length(full_name) <= 120),
  phone       text check (char_length(phone) <= 40),
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Field values match the Home Energy Planner's answers, so a saved home can
-- re-open the planner pre-filled.
create table if not exists public.homes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label         text check (char_length(label) <= 80),
  postal_code   text check (char_length(postal_code) <= 7),
  province      text check (province is null or province = any (private.provinces())),
  city_slug     text check (char_length(city_slug) <= 60),
  city_name     text check (char_length(city_name) <= 80),
  era           text check (era is null or era in ('pre-1946','1946-1965','1966-1980','1981-1995','1996-2010','2011-plus')),
  home_type     text check (home_type is null or home_type in ('detached','semi','condo')),
  size_band     text check (size_band is null or size_band in ('small','medium','large','xlarge')),
  heating       text check (char_length(heating) <= 30),
  heating_age   text check (heating_age is null or heating_age in ('new','old','unsure')),
  water_heater  text check (char_length(water_heater) <= 30),
  cooling       text check (char_length(cooling) <= 30),
  windows       text check (char_length(windows) <= 30),
  water_supply  text check (water_supply is null or water_supply in ('municipal','well','unsure')),
  prev_audit    text check (prev_audit is null or prev_audit in ('no','recent','older','unsure')),
  secondary     text[] not null default '{}',
  planner_query text check (char_length(planner_query) <= 1000),
  notes         text check (char_length(notes) <= 2000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, user_id)
);
create index if not exists homes_user_idx on public.homes (user_id);

create table if not exists public.audits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  home_id     uuid,
  kind        text not null check (kind in ('energuide-pre','energuide-post','renoclimat','home-inspection','radon-test','water-test','wett','blower-door','thermal-imaging','other')),
  done_on     date,
  company     text check (char_length(company) <= 120),
  result      text check (char_length(result) <= 200),
  rating_gj   numeric check (rating_gj is null or (rating_gj >= 0 and rating_gj <= 2000)),
  radon_bq    numeric check (radon_bq is null or (radon_bq >= 0 and radon_bq <= 100000)),
  file_ref    text check (char_length(file_ref) <= 60),
  notes       text check (char_length(notes) <= 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (home_id, user_id) references public.homes (id, user_id) on delete cascade
);
create index if not exists audits_user_idx on public.audits (user_id);

create table if not exists public.needs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  home_id     uuid,
  item_key    text check (char_length(item_key) <= 60),
  title       text not null check (char_length(title) between 1 and 140),
  category    text check (char_length(category) <= 40),
  status      text not null default 'todo' check (status in ('todo','quotes','booked','done','skip')),
  priority    smallint check (priority between 1 and 99),
  cost_low    integer check (cost_low is null or cost_low >= 0),
  cost_high   integer check (cost_high is null or cost_high >= 0),
  saving_year integer check (saving_year is null or saving_year between -100000 and 100000),
  rebate      text check (char_length(rebate) <= 200),
  notes       text check (char_length(notes) <= 2000),
  source      text not null default 'manual' check (source in ('manual','planner')),
  done_on     date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (home_id, user_id) references public.homes (id, user_id) on delete cascade
);
create index if not exists needs_user_idx on public.needs (user_id);

create table if not exists public.reminders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  home_id     uuid,
  title       text not null check (char_length(title) between 1 and 140),
  due_on      date not null,
  kind        text not null default 'custom' check (kind in ('custom','post-evaluation','rebate-claim','radon-retest','water-test','maintenance')),
  notes       text check (char_length(notes) <= 1000),
  done        boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (home_id, user_id) references public.homes (id, user_id) on delete cascade
);
create index if not exists reminders_user_idx on public.reminders (user_id);
create index if not exists reminders_due_idx on public.reminders (due_on) where not done;

-- Alerts are off until the person turns them on (Quebec Law 25: highest
-- privacy by default; CASL: express consent, recorded with its wording).
create table if not exists public.alert_prefs (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  program_updates    boolean not null default false,
  deadline_reminders boolean not null default false,
  seasonal_checks    boolean not null default false,
  provinces          text[] not null default '{}',
  consent_at         timestamptz,
  consent_text       text check (char_length(consent_text) <= 1000),
  unsub_token        uuid not null default gen_random_uuid() unique,
  unsubscribed_at    timestamptz,
  alerts_since       timestamptz,
  updated_at         timestamptz not null default now()
);

create table if not exists public.match_requests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  home_id         uuid,
  service         text not null check (service in ('energy-audit','radon','insulation','heat-pump','windows-doors','water-heater','ventilation','mould-air','wood-stove','well-water','asbestos-lead','other')),
  timeline        text check (timeline in ('asap','1-3-months','3-6-months','researching')),
  building        text not null default 'house' check (building in ('house','duplex-triplex','multi-unit','condo-unit','commercial')),
  details         text check (char_length(details) <= 2000),
  contact_name    text check (char_length(contact_name) <= 120),
  contact_email   text not null check (char_length(contact_email) <= 254),
  contact_phone   text check (char_length(contact_phone) <= 40),
  contact_pref    text not null default 'email' check (contact_pref in ('email','phone')),
  postal_code     text check (char_length(postal_code) <= 7),
  province        text check (province is null or province = any (private.provinces())),
  city_slug       text check (char_length(city_slug) <= 60),
  region          text check (char_length(region) <= 60),
  consent_text    text not null check (char_length(consent_text) <= 1000),
  consented_at    timestamptz not null default now(),
  source          text not null default 'account' check (source in ('account','lead-form','planner')),
  status          text not null default 'new' check (status in ('new','reviewing','matched','closed','cancelled')),
  matched_company text check (char_length(matched_company) <= 160),
  matched_contact text check (char_length(matched_contact) <= 200),
  matched_at      timestamptz,
  homeowner_note  text check (char_length(homeowner_note) <= 1000),
  notified_at     timestamptz,   -- admins told about the new request
  status_notified text,          -- last status emailed to the homeowner
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (home_id, user_id) references public.homes (id, user_id) on delete set null (home_id)
);
create index if not exists match_requests_user_idx on public.match_requests (user_id);
create index if not exists match_requests_status_idx on public.match_requests (status, created_at desc);

-- Private notes for whoever routes the lead (never shown to the homeowner).
create table if not exists public.match_admin (
  request_id  uuid primary key references public.match_requests (id) on delete cascade,
  admin_notes text check (char_length(admin_notes) <= 4000),
  lead_fee    numeric(8,2) check (lead_fee is null or lead_fee >= 0),
  billed      boolean not null default false,
  updated_by  uuid references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now()
);

-- Requests made before the email address is confirmed. They become real only
-- when the owner of the address signs in with the matching claim key (which
-- travels in the sign-in link or stays in the browser that made the request).
create table if not exists public.pending_actions (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  kind        text not null check (kind in ('match','plan','alerts')),
  payload     jsonb not null check (pg_column_size(payload) <= 16384),
  claim_key   uuid not null,
  created_at  timestamptz not null default now(),
  claimed_at  timestamptz,
  claimed_by  uuid references auth.users (id) on delete set null,
  error       text
);
create index if not exists pending_actions_email_idx on public.pending_actions (lower(email)) where claimed_at is null;
create index if not exists pending_actions_created_idx on public.pending_actions (created_at);

create table if not exists public.program_updates (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique check (char_length(slug) <= 80),
  provinces    text[] not null default '{}',   -- empty = all of Canada
  title        text not null check (char_length(title) between 1 and 160),
  summary      text not null check (char_length(summary) between 1 and 1200),
  url          text check (url is null or url ~ '^https://'),
  published_at timestamptz not null default now(),
  status       text not null default 'queued' check (status in ('draft','queued','sent','cancelled')),
  source       text not null default 'admin' check (source in ('admin','site')),
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz
);
create index if not exists program_updates_status_idx on public.program_updates (status, published_at desc);

create table if not exists public.alert_log (
  id          bigint generated always as identity primary key,
  user_id     uuid references auth.users (id) on delete cascade,
  kind        text not null,
  ref         text not null,
  sent_at     timestamptz not null default now(),
  provider_id text,
  unique (user_id, kind, ref)
);
create index if not exists alert_log_sent_idx on public.alert_log (sent_at);

-- Email addresses that become admins when they sign up.
create table if not exists public.admin_emails (
  email      text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);
insert into public.admin_emails (email) values ('dave@clickshift.ca') on conflict do nothing;

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['profiles','homes','audits','needs','reminders','alert_prefs','match_requests','match_admin'] loop
    execute format('drop trigger if exists touch_updated_at on public.%I', t);
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function private.touch_updated_at()', t);
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- New users: profile + alert preferences (all alerts off)
-- -----------------------------------------------------------------------------

create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, is_admin)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    private.clean(new.raw_user_meta_data ->> 'full_name', 120),
    exists (select 1 from public.admin_emails a where a.email = lower(coalesce(new.email, '')))
  )
  on conflict (id) do nothing;
  insert into public.alert_prefs (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end
$$;

create or replace function private.handle_user_email_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = lower(coalesce(new.email, '')) where id = new.id;
  return new;
end
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function private.handle_user_email_change();

-- -----------------------------------------------------------------------------
-- Admin check used inside policies
-- -----------------------------------------------------------------------------

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = (select auth.uid())), false)
$$;

-- -----------------------------------------------------------------------------
-- Row-level security and privileges
-- -----------------------------------------------------------------------------

alter table public.profiles        enable row level security;
alter table public.homes           enable row level security;
alter table public.audits          enable row level security;
alter table public.needs           enable row level security;
alter table public.reminders       enable row level security;
alter table public.alert_prefs     enable row level security;
alter table public.match_requests  enable row level security;
alter table public.match_admin     enable row level security;
alter table public.pending_actions enable row level security;
alter table public.program_updates enable row level security;
alter table public.alert_log       enable row level security;
alter table public.admin_emails    enable row level security;

-- Start from nothing, then grant exactly what the site needs.
revoke all on public.profiles, public.homes, public.audits, public.needs, public.reminders,
  public.alert_prefs, public.match_requests, public.match_admin, public.pending_actions,
  public.program_updates, public.alert_log, public.admin_emails from anon, authenticated;

grant all on public.profiles, public.homes, public.audits, public.needs, public.reminders,
  public.alert_prefs, public.match_requests, public.match_admin, public.pending_actions,
  public.program_updates, public.alert_log, public.admin_emails to service_role;
grant usage, select on all sequences in schema public to service_role;

-- profiles: read your own; change only your name and phone
drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles for select to authenticated
  using (id = (select auth.uid()));
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
grant select on public.profiles to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

-- homes, audits, needs, reminders: full control of your own rows; admins can
-- read them only for people who have asked to be matched
do $$
declare t text;
begin
  foreach t in array array['homes','audits','needs','reminders'] loop
    execute format('drop policy if exists "%1$s: owner" on public.%1$I', t);
    execute format($p$create policy "%1$s: owner" on public.%1$I for all to authenticated
      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))$p$, t);
    execute format('drop policy if exists "%1$s: admins read requesters" on public.%1$I', t);
    execute format($p$create policy "%1$s: admins read requesters" on public.%1$I for select to authenticated
      using ((select private.is_admin()) and exists (select 1 from public.match_requests m where m.user_id = %1$I.user_id))$p$, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end
$$;

-- alert_prefs: read your own; changes go through set_alert_prefs()
drop policy if exists "alert_prefs: read own" on public.alert_prefs;
create policy "alert_prefs: read own" on public.alert_prefs for select to authenticated
  using (user_id = (select auth.uid()));
grant select on public.alert_prefs to authenticated;

-- match_requests: read your own (admins read all); writes go through functions
drop policy if exists "match_requests: read own" on public.match_requests;
create policy "match_requests: read own" on public.match_requests for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "match_requests: admins read" on public.match_requests;
create policy "match_requests: admins read" on public.match_requests for select to authenticated
  using ((select private.is_admin()));
grant select on public.match_requests to authenticated;

drop policy if exists "match_admin: admins read" on public.match_admin;
create policy "match_admin: admins read" on public.match_admin for select to authenticated
  using ((select private.is_admin()));
grant select on public.match_admin to authenticated;

-- program_updates: signed-in people read published updates; admins read all
drop policy if exists "program_updates: read" on public.program_updates;
create policy "program_updates: read" on public.program_updates for select to authenticated
  using (status in ('queued','sent') or (select private.is_admin()));
grant select on public.program_updates to authenticated;

-- alert_log: read what we've emailed you
drop policy if exists "alert_log: read own" on public.alert_log;
create policy "alert_log: read own" on public.alert_log for select to authenticated
  using (user_id = (select auth.uid()));
grant select on public.alert_log to authenticated;

-- pending_actions and admin_emails: no direct access (functions only)

grant execute on function private.is_admin() to authenticated, service_role;
revoke execute on function private.handle_new_user() from public;
revoke execute on function private.handle_user_email_change() from public;

-- -----------------------------------------------------------------------------
-- Internal builders (called by the public functions below)
-- -----------------------------------------------------------------------------

create or replace function private.create_match(p_uid uuid, p_email text, p jsonb, p_consented timestamptz, p_source text)
returns uuid language plpgsql set search_path = '' as $$
declare
  v_id   uuid;
  v_home uuid;
  v_name text := private.clean(p ->> 'name', 120);
  v_phone text := private.clean(p ->> 'phone', 40);
begin
  if coalesce(p ->> 'consent', '') <> 'true' then
    raise exception 'consent to share the request is required' using errcode = '22023';
  end if;
  select h.id into v_home from public.homes h where h.user_id = p_uid order by h.updated_at desc limit 1;
  insert into public.match_requests (
    user_id, home_id, service, timeline, building, details, contact_name, contact_email,
    contact_phone, contact_pref, postal_code, province, city_slug, region,
    consent_text, consented_at, source)
  values (
    p_uid, v_home,
    coalesce(private.pick(p ->> 'service', array['energy-audit','radon','insulation','heat-pump','windows-doors','water-heater','ventilation','mould-air','wood-stove','well-water','asbestos-lead','other']), 'energy-audit'),
    private.pick(p ->> 'timeline', array['asap','1-3-months','3-6-months','researching']),
    coalesce(private.pick(p ->> 'building', array['house','duplex-triplex','multi-unit','condo-unit','commercial']), 'house'),
    private.clean(p ->> 'details', 2000),
    v_name, lower(p_email), v_phone,
    coalesce(private.pick(p ->> 'contact_pref', array['email','phone']), 'email'),
    private.clean(upper(regexp_replace(coalesce(p ->> 'postal', ''), '\s', '', 'g')), 7),
    private.pick(upper(coalesce(p ->> 'province', '')), private.provinces()),
    private.clean(p ->> 'city_slug', 60),
    private.clean(p ->> 'region', 60),
    coalesce(private.clean(p ->> 'consent_text', 1000), 'I agree to share this request with one service organization serving my area.'),
    coalesce(p_consented, now()),
    coalesce(private.pick(p_source, array['account','lead-form','planner']), 'account'))
  returning id into v_id;

  update public.profiles
     set full_name = coalesce(full_name, v_name),
         phone = coalesce(phone, v_phone)
   where id = p_uid;
  return v_id;
end
$$;

create or replace function private.save_plan(p_uid uuid, p jsonb)
returns uuid language plpgsql set search_path = '' as $$
declare
  h      jsonb := coalesce(p -> 'home', '{}'::jsonb);
  v_home uuid;
  v_postal text := private.clean(upper(regexp_replace(coalesce(h ->> 'postal', ''), '\s', '', 'g')), 7);
begin
  select id into v_home from public.homes
   where user_id = p_uid and (v_postal is null or postal_code is null or postal_code = v_postal)
   order by updated_at desc limit 1;

  if v_home is null then
    insert into public.homes (user_id) values (p_uid) returning id into v_home;
  end if;

  update public.homes set
    postal_code   = coalesce(v_postal, postal_code),
    province      = coalesce(private.pick(upper(coalesce(h ->> 'province', '')), private.provinces()), province),
    city_slug     = coalesce(private.clean(h ->> 'city_slug', 60), city_slug),
    city_name     = coalesce(private.clean(h ->> 'city_name', 80), city_name),
    era           = coalesce(private.pick(h ->> 'era', array['pre-1946','1946-1965','1966-1980','1981-1995','1996-2010','2011-plus']), era),
    home_type     = coalesce(private.pick(h ->> 'home_type', array['detached','semi','condo']), home_type),
    size_band     = coalesce(private.pick(h ->> 'size_band', array['small','medium','large','xlarge']), size_band),
    heating       = coalesce(private.clean(h ->> 'heating', 30), heating),
    heating_age   = coalesce(private.pick(h ->> 'heating_age', array['new','old','unsure']), heating_age),
    water_heater  = coalesce(private.clean(h ->> 'water_heater', 30), water_heater),
    cooling       = coalesce(private.clean(h ->> 'cooling', 30), cooling),
    windows       = coalesce(private.clean(h ->> 'windows', 30), windows),
    water_supply  = coalesce(private.pick(h ->> 'water_supply', array['municipal','well','unsure']), water_supply),
    prev_audit    = coalesce(private.pick(h ->> 'prev_audit', array['no','recent','older','unsure']), prev_audit),
    secondary     = case when jsonb_typeof(h -> 'secondary') = 'array'
                         then array(select left(v, 20) from jsonb_array_elements_text(h -> 'secondary') as t(v)
                                    where v in ('woodstove','spaceheaters','solar'))
                         else secondary end,
    planner_query = coalesce(private.clean(p ->> 'planner_query', 1000), planner_query)
  where id = v_home;

  insert into public.needs (user_id, home_id, item_key, title, category, priority, cost_low, cost_high, saving_year, rebate, source)
  select p_uid, v_home,
         private.clean(i ->> 'key', 60),
         coalesce(private.clean(i ->> 'title', 140), 'Upgrade'),
         private.clean(i ->> 'category', 40),
         least(ord, 99)::smallint,
         private.clamp_int(i ->> 'cost_low', 0, 10000000),
         private.clamp_int(i ->> 'cost_high', 0, 10000000),
         private.clamp_int(i ->> 'saving_year', -100000, 100000),
         private.clean(i ->> 'rebate', 200),
         'planner'
    from jsonb_array_elements(case when jsonb_typeof(p -> 'items') = 'array' then p -> 'items' else '[]'::jsonb end)
         with ordinality as t(i, ord)
   where ord <= 15
     and jsonb_typeof(i) = 'object'
     and not exists (
       select 1 from public.needs n
        where n.home_id = v_home
          and n.item_key is not distinct from private.clean(i ->> 'key', 60)
          and n.title = coalesce(private.clean(i ->> 'title', 140), 'Upgrade'));
  return v_home;
end
$$;

create or replace function private.apply_alerts(p_uid uuid, p jsonb, p_consented timestamptz)
returns void language plpgsql set search_path = '' as $$
declare
  v_prog boolean := coalesce(p ->> 'program_updates', '') = 'true';
  v_dead boolean := coalesce(p ->> 'deadline_reminders', '') = 'true';
  v_seas boolean := coalesce(p ->> 'seasonal_checks', '') = 'true';
begin
  if not (v_prog or v_dead or v_seas) then return; end if;
  insert into public.alert_prefs (user_id) values (p_uid) on conflict (user_id) do nothing;
  update public.alert_prefs a set
    alerts_since       = case when v_prog and not a.program_updates then now() else a.alerts_since end,
    program_updates    = a.program_updates or v_prog,
    deadline_reminders = a.deadline_reminders or v_dead,
    seasonal_checks    = a.seasonal_checks or v_seas,
    provinces          = (select coalesce(array_agg(distinct x order by x), '{}')
                            from unnest(a.provinces || private.clean_provinces(p -> 'provinces')) as u(x)),
    consent_at         = coalesce(p_consented, now()),
    consent_text       = coalesce(private.clean(p ->> 'consent_text', 1000), a.consent_text),
    unsubscribed_at    = null
  where a.user_id = p_uid;
end
$$;

revoke execute on function private.create_match(uuid, text, jsonb, timestamptz, text) from public;
revoke execute on function private.save_plan(uuid, jsonb) from public;
revoke execute on function private.apply_alerts(uuid, jsonb, timestamptz) from public;

-- -----------------------------------------------------------------------------
-- Public functions (called from the website)
-- -----------------------------------------------------------------------------

-- Before sign-in: hold a request until the email address is confirmed.
create or replace function public.queue_pending(p_email text, p_kind text, p_payload jsonb, p_claim_key uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Please enter a valid email address.' using errcode = '22023';
  end if;
  if p_kind not in ('match','plan','alerts') then
    raise exception 'Unknown request type.' using errcode = '22023';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or pg_column_size(p_payload) > 16384 then
    raise exception 'Request is too large.' using errcode = '22023';
  end if;
  if p_claim_key is null then
    raise exception 'Missing claim key.' using errcode = '22023';
  end if;
  if (select count(*) from public.pending_actions
       where lower(email) = v_email and created_at > now() - interval '1 day') >= 8 then
    raise exception 'Too many requests for this address today. Please try again tomorrow.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.pending_actions where created_at > now() - interval '1 hour') >= 1000 then
    raise exception 'We are getting a lot of requests right now. Please try again in an hour.' using errcode = 'P0001';
  end if;
  insert into public.pending_actions (email, kind, payload, claim_key)
  values (v_email, p_kind, p_payload, p_claim_key);
end
$$;

-- After sign-in: turn this person's held requests (same claim key) into real ones.
create or replace function public.claim_pending(p_claim_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := (select auth.uid());
  v_email text := lower(coalesce((select auth.jwt()) ->> 'email', ''));
  r       record;
  n_match int := 0; n_plan int := 0; n_alerts int := 0; n_err int := 0;
  v_ids   uuid[] := '{}';
begin
  if v_uid is null or v_email = '' then
    raise exception 'Please sign in first.' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users u where u.id = v_uid and u.email_confirmed_at is not null) then
    raise exception 'Please confirm your email address first.' using errcode = '42501';
  end if;
  if p_claim_key is null then
    return jsonb_build_object('match', 0, 'plan', 0, 'alerts', 0, 'errors', 0);
  end if;

  for r in
    select * from public.pending_actions
     where lower(email) = v_email and claim_key = p_claim_key
       and claimed_at is null and created_at > now() - interval '7 days'
     order by created_at
     for update skip locked
  loop
    begin
      if r.kind = 'match' then
        v_ids := v_ids || private.create_match(v_uid, v_email, r.payload, r.created_at, coalesce(r.payload ->> 'source', 'lead-form'));
        n_match := n_match + 1;
      elsif r.kind = 'plan' then
        perform private.save_plan(v_uid, r.payload);
        n_plan := n_plan + 1;
      elsif r.kind = 'alerts' then
        perform private.apply_alerts(v_uid, r.payload, r.created_at);
        n_alerts := n_alerts + 1;
      end if;
      update public.pending_actions set claimed_at = now(), claimed_by = v_uid where id = r.id;
    exception when others then
      update public.pending_actions set claimed_at = now(), claimed_by = v_uid, error = left(sqlerrm, 300) where id = r.id;
      n_err := n_err + 1;
    end;
  end loop;

  return jsonb_build_object('match', n_match, 'plan', n_plan, 'alerts', n_alerts, 'errors', n_err, 'match_ids', to_jsonb(v_ids));
end
$$;

-- Signed-in versions of the same actions.
create or replace function public.create_match_request(p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text := lower(coalesce((select auth.jwt()) ->> 'email', ''));
begin
  if v_uid is null or v_email = '' then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  if (select count(*) from public.match_requests where user_id = v_uid and created_at > now() - interval '1 day') >= 10 then
    raise exception 'That is a lot of requests for one day. We will be in touch about the ones you sent.' using errcode = 'P0001';
  end if;
  return private.create_match(v_uid, v_email, coalesce(p, '{}'::jsonb), now(), 'account');
end
$$;

create or replace function public.save_plan(p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  return private.save_plan(v_uid, coalesce(p, '{}'::jsonb));
end
$$;

create or replace function public.cancel_match_request(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.match_requests set status = 'cancelled'
   where id = p_id and user_id = (select auth.uid()) and status in ('new','reviewing');
  if not found then raise exception 'That request can no longer be cancelled.' using errcode = 'P0001'; end if;
end
$$;

-- Turn alerts on or off. Turning any alert on records the consent wording and time.
create or replace function public.set_alert_prefs(
  p_program_updates boolean, p_deadline_reminders boolean, p_seasonal_checks boolean,
  p_provinces text[], p_consent_text text)
returns public.alert_prefs language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_old public.alert_prefs;
  v_new public.alert_prefs;
  v_any boolean := coalesce(p_program_updates, false) or coalesce(p_deadline_reminders, false) or coalesce(p_seasonal_checks, false);
  v_turned_on boolean;
begin
  if v_uid is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  insert into public.alert_prefs (user_id) values (v_uid) on conflict (user_id) do nothing;
  select * into v_old from public.alert_prefs where user_id = v_uid;
  v_turned_on := (coalesce(p_program_updates, false) and not v_old.program_updates)
              or (coalesce(p_deadline_reminders, false) and not v_old.deadline_reminders)
              or (coalesce(p_seasonal_checks, false) and not v_old.seasonal_checks);
  if v_turned_on and private.clean(p_consent_text, 1000) is null then
    raise exception 'Consent wording is required to turn on alerts.' using errcode = '22023';
  end if;
  update public.alert_prefs set
    alerts_since       = case when coalesce(p_program_updates, false) and not v_old.program_updates then now() else alerts_since end,
    program_updates    = coalesce(p_program_updates, false),
    deadline_reminders = coalesce(p_deadline_reminders, false),
    seasonal_checks    = coalesce(p_seasonal_checks, false),
    provinces          = coalesce((select array_agg(distinct upper(x) order by upper(x)) from unnest(coalesce(p_provinces, '{}')) as u(x)
                                    where upper(x) = any (private.provinces())), '{}'),
    consent_at         = case when v_turned_on then now() else consent_at end,
    consent_text       = case when v_turned_on then private.clean(p_consent_text, 1000) else consent_text end,
    unsubscribed_at    = case when v_any then null else coalesce(unsubscribed_at, now()) end
  where user_id = v_uid
  returning * into v_new;
  return v_new;
end
$$;

-- One-click unsubscribe from the link in every alert (no sign-in needed).
create or replace function public.unsubscribe_by_token(p_token uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.alert_prefs set
    program_updates = false, deadline_reminders = false, seasonal_checks = false,
    unsubscribed_at = coalesce(unsubscribed_at, now())
  where unsub_token = p_token;
  return found;
end
$$;

-- Delete the account and everything attached to it.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text := lower(coalesce((select auth.jwt()) ->> 'email', ''));
begin
  if v_uid is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  delete from public.pending_actions where lower(email) = v_email or claimed_by = v_uid;
  delete from auth.users where id = v_uid;
end
$$;

-- -----------------------------------------------------------------------------
-- Admin functions
-- -----------------------------------------------------------------------------

create or replace function private.require_admin()
returns void language plpgsql stable set search_path = '' as $$
begin
  if not coalesce((select p.is_admin from public.profiles p where p.id = (select auth.uid())), false) then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
end
$$;
revoke execute on function private.require_admin() from public;

create or replace function public.admin_update_match(p_id uuid, p jsonb)
returns public.match_requests language plpgsql security definer set search_path = '' as $$
declare
  v_status text := private.pick(p ->> 'status', array['new','reviewing','matched','closed','cancelled']);
  v_row public.match_requests;
begin
  perform private.require_admin();
  update public.match_requests m set
    status          = coalesce(v_status, m.status),
    matched_company = case when p ? 'matched_company' then private.clean(p ->> 'matched_company', 160) else m.matched_company end,
    matched_contact = case when p ? 'matched_contact' then private.clean(p ->> 'matched_contact', 200) else m.matched_contact end,
    homeowner_note  = case when p ? 'homeowner_note' then private.clean(p ->> 'homeowner_note', 1000) else m.homeowner_note end,
    matched_at      = case when coalesce(v_status, m.status) = 'matched' then coalesce(m.matched_at, now()) else m.matched_at end
  where m.id = p_id
  returning * into v_row;
  if v_row.id is null then raise exception 'Request not found.' using errcode = 'P0002'; end if;

  if p ? 'admin_notes' or p ? 'lead_fee' or p ? 'billed' then
    insert into public.match_admin (request_id, admin_notes, lead_fee, billed, updated_by)
    values (p_id,
            private.clean(p ->> 'admin_notes', 4000),
            case when coalesce(p ->> 'lead_fee', '') ~ '^[0-9]{1,6}(\.[0-9]{1,2})?$' then (p ->> 'lead_fee')::numeric end,
            coalesce(p ->> 'billed', '') = 'true',
            (select auth.uid()))
    on conflict (request_id) do update set
      admin_notes = case when p ? 'admin_notes' then excluded.admin_notes else public.match_admin.admin_notes end,
      lead_fee    = case when p ? 'lead_fee' then excluded.lead_fee else public.match_admin.lead_fee end,
      billed      = case when p ? 'billed' then excluded.billed else public.match_admin.billed end,
      updated_by  = excluded.updated_by;
  end if;
  return v_row;
end
$$;

create or replace function public.admin_post_update(p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_url text := private.clean(p ->> 'url', 500);
begin
  perform private.require_admin();
  if private.clean(p ->> 'title', 160) is null or private.clean(p ->> 'summary', 1200) is null then
    raise exception 'A title and a summary are required.' using errcode = '22023';
  end if;
  if v_url is not null and v_url !~ '^https://' then
    raise exception 'Links must start with https://' using errcode = '22023';
  end if;
  insert into public.program_updates (provinces, title, summary, url, status, source, created_by)
  values (private.clean_provinces(p -> 'provinces'),
          private.clean(p ->> 'title', 160),
          private.clean(p ->> 'summary', 1200),
          v_url,
          coalesce(private.pick(p ->> 'status', array['draft','queued']), 'queued'),
          'admin', (select auth.uid()))
  returning id into v_id;
  return v_id;
end
$$;

create or replace function public.admin_set_update_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  update public.program_updates set status = p_status
   where id = p_id and status in ('draft','queued') and p_status in ('draft','queued','cancelled');
  if not found then raise exception 'That update has already been sent or does not exist.' using errcode = 'P0001'; end if;
end
$$;

create or replace function public.admin_stats()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return jsonb_build_object(
    'accounts',           (select count(*) from public.profiles),
    'accounts_7d',        (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'homes',              (select count(*) from public.homes),
    'program_updates',    (select count(*) from public.alert_prefs where program_updates),
    'deadline_reminders', (select count(*) from public.alert_prefs where deadline_reminders),
    'seasonal_checks',    (select count(*) from public.alert_prefs where seasonal_checks),
    'requests',           (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
                             from (select status, count(*) n from public.match_requests group by status) s),
    'unconfirmed_7d',     (select count(*) from public.pending_actions where claimed_at is null and created_at > now() - interval '7 days'),
    'emails_24h',         (select count(*) from public.alert_log where sent_at > now() - interval '1 day'));
end
$$;

create or replace function public.admin_list_admins()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return (select coalesce(jsonb_agg(x order by x ->> 'email'), '[]'::jsonb) from (
    select jsonb_build_object('email', p.email, 'name', p.full_name, 'signed_up', true) x
      from public.profiles p where p.is_admin
    union all
    select jsonb_build_object('email', a.email, 'name', null, 'signed_up', false)
      from public.admin_emails a
     where not exists (select 1 from public.profiles p where p.email = a.email)) s);
end
$$;

create or replace function public.admin_set_admin(p_email text, p_admin boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_me text;
begin
  perform private.require_admin();
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email address.' using errcode = '22023'; end if;
  select email into v_me from public.profiles where id = (select auth.uid());
  if not coalesce(p_admin, false) and v_email = v_me then
    raise exception 'You cannot remove yourself. Ask another admin.' using errcode = 'P0001';
  end if;
  if coalesce(p_admin, false) then
    insert into public.admin_emails (email) values (v_email) on conflict do nothing;
    update public.profiles set is_admin = true where email = v_email;
    return case when found then 'added' else 'invited' end;
  else
    delete from public.admin_emails where email = v_email;
    update public.profiles set is_admin = false where email = v_email;
    return 'removed';
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Execute grants: revoke the PUBLIC default, then grant per role
-- -----------------------------------------------------------------------------

revoke execute on function public.queue_pending(text, text, jsonb, uuid) from public;
revoke execute on function public.claim_pending(uuid) from public;
revoke execute on function public.create_match_request(jsonb) from public;
revoke execute on function public.save_plan(jsonb) from public;
revoke execute on function public.cancel_match_request(uuid) from public;
revoke execute on function public.set_alert_prefs(boolean, boolean, boolean, text[], text) from public;
revoke execute on function public.unsubscribe_by_token(uuid) from public;
revoke execute on function public.delete_my_account() from public;
revoke execute on function public.admin_update_match(uuid, jsonb) from public;
revoke execute on function public.admin_post_update(jsonb) from public;
revoke execute on function public.admin_set_update_status(uuid, text) from public;
revoke execute on function public.admin_stats() from public;
revoke execute on function public.admin_list_admins() from public;
revoke execute on function public.admin_set_admin(text, boolean) from public;

-- Supabase's default privileges also grant EXECUTE on new public functions to
-- anon and authenticated directly, so revoke those too before granting.
revoke execute on function public.claim_pending(uuid) from anon;
revoke execute on function public.create_match_request(jsonb) from anon;
revoke execute on function public.save_plan(jsonb) from anon;
revoke execute on function public.cancel_match_request(uuid) from anon;
revoke execute on function public.set_alert_prefs(boolean, boolean, boolean, text[], text) from anon;
revoke execute on function public.delete_my_account() from anon;
revoke execute on function public.admin_update_match(uuid, jsonb) from anon;
revoke execute on function public.admin_post_update(jsonb) from anon;
revoke execute on function public.admin_set_update_status(uuid, text) from anon;
revoke execute on function public.admin_stats() from anon;
revoke execute on function public.admin_list_admins() from anon;
revoke execute on function public.admin_set_admin(text, boolean) from anon;

grant execute on function public.queue_pending(text, text, jsonb, uuid) to anon, authenticated;
grant execute on function public.unsubscribe_by_token(uuid) to anon, authenticated;
grant execute on function public.claim_pending(uuid) to authenticated;
grant execute on function public.create_match_request(jsonb) to authenticated;
grant execute on function public.save_plan(jsonb) to authenticated;
grant execute on function public.cancel_match_request(uuid) to authenticated;
grant execute on function public.set_alert_prefs(boolean, boolean, boolean, text[], text) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.admin_update_match(uuid, jsonb) to authenticated;
grant execute on function public.admin_post_update(jsonb) to authenticated;
grant execute on function public.admin_set_update_status(uuid, text) to authenticated;
grant execute on function public.admin_stats() to authenticated;
grant execute on function public.admin_list_admins() to authenticated;
grant execute on function public.admin_set_admin(text, boolean) to authenticated;
