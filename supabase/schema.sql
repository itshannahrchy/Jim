-- Jim / Morris — database schema (Phase 1)
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- It is safe to run more than once.
--
-- Security model: the app talks to the database ONLY from its server, using the
-- secret key (which bypasses row-level security). Row-level security is turned
-- on for every table with NO policies, so the public "anon" key can read or
-- write nothing.

-- ───────────────────────── profile (single row, id = 1) ─────────────────────────
create table if not exists public.profile (
  id                             smallint primary key default 1 check (id = 1),
  age_bracket                    text,
  limitations                    text,
  timezone                       text,
  weight_kg                      numeric(5,1),
  height_cm                      numeric(5,1),
  activity_level                 text check (activity_level in ('sedentary','light','moderate','active','very_active')),
  estimated_maintenance_kcal     integer,
  baseline_daily_calorie_target  integer check (baseline_daily_calorie_target is null or baseline_daily_calorie_target >= 1200),
  notes                          text,
  onboarding_completed_at        timestamptz,
  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz not null default now()
);
insert into public.profile (id) values (1) on conflict (id) do nothing;

-- ───────────────────────── goals ─────────────────────────
create table if not exists public.goals (
  id                    bigint generated always as identity primary key,
  title                 text not null,
  description           text,
  target_date           date,
  original_target_date  date,
  status                text not null default 'active' check (status in ('active','achieved','dropped')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table if not exists public.micro_goals (
  id             bigint generated always as identity primary key,
  goal_id        bigint not null references public.goals(id) on delete cascade,
  position       integer not null default 0,
  title          text not null,
  target_value   numeric,
  current_value  numeric,
  unit           text,
  status         text not null default 'not_started' check (status in ('not_started','in_progress','achieved')),
  achieved_at    timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists micro_goals_goal_idx on public.micro_goals (goal_id, position);

-- ───────────────────────── logs ─────────────────────────
create table if not exists public.workout_logs (
  id                  bigint generated always as identity primary key,
  logged_at           timestamptz not null default now(),
  category            text not null check (category in ('aerial','calisthenics','stretching','cardio','sport','other')),
  activity_name       text not null,
  description         text,
  duration_min        numeric(6,1),
  intensity           text check (intensity in ('light','moderate','vigorous')),
  met_value           numeric(4,1),
  estimated_calories  integer,
  raw_message         text,
  created_at          timestamptz not null default now()
);
create index if not exists workout_logs_time_idx on public.workout_logs (logged_at desc);

create table if not exists public.food_logs (
  id                   bigint generated always as identity primary key,
  logged_at            timestamptz not null default now(),
  description          text not null,
  meal_type            text check (meal_type in ('breakfast','lunch','dinner','snack','drink')),
  quality              text check (quality in ('on_plan','mixed','off_plan')),
  estimated_calories   integer,
  estimated_protein_g  numeric(5,1),
  raw_message          text,
  created_at           timestamptz not null default now()
);
create index if not exists food_logs_time_idx on public.food_logs (logged_at desc);

create table if not exists public.measurements (
  id           bigint generated always as identity primary key,
  measured_at  timestamptz not null default now(),
  name         text not null,
  value        numeric(7,2) not null,
  unit         text not null,
  raw_message  text,
  created_at   timestamptz not null default now()
);
create index if not exists measurements_time_idx on public.measurements (name, measured_at desc);

create table if not exists public.chat_messages (
  id          bigint generated always as identity primary key,
  role        text not null check (role in ('user','assistant')),
  content     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists chat_messages_time_idx on public.chat_messages (created_at desc);

-- ───────────── ready for Phase 2 (weekly targets + adaptation history) ─────────────
create table if not exists public.weekly_targets (
  id          bigint generated always as identity primary key,
  week_start  date not null unique,
  targets     jsonb not null default '{}'::jsonb,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.adaptation_events (
  id          bigint generated always as identity primary key,
  goal_id     bigint references public.goals(id) on delete set null,
  tier        smallint check (tier in (1,2,3)),
  kind        text not null,
  reason      text,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- ───────────────────────── passcode throttling ─────────────────────────
create table if not exists public.login_attempts (
  ip            text primary key,
  failures      integer not null default 0,
  locked_until  timestamptz,
  updated_at    timestamptz not null default now()
);

-- ───────────────────────── row-level security: on, no policies ─────────────────────────
alter table public.profile           enable row level security;
alter table public.goals             enable row level security;
alter table public.micro_goals       enable row level security;
alter table public.workout_logs      enable row level security;
alter table public.food_logs         enable row level security;
alter table public.measurements      enable row level security;
alter table public.chat_messages     enable row level security;
alter table public.weekly_targets    enable row level security;
alter table public.adaptation_events enable row level security;
alter table public.login_attempts    enable row level security;
