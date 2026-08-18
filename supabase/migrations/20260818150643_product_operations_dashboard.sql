-- Privacy-safe product operations metrics and platform administration.
-- Product events contain only controlled codes, counts, and timings; never research content.

create schema if not exists private;
revoke all on schema private from public,anon;
grant usage on schema private to authenticated;

create or replace function private.rafid_valid_stage_timings(value jsonb)
returns boolean language sql immutable security invoker set search_path=''
as $$
  select jsonb_typeof(value)='object'
    and (select count(*) from jsonb_object_keys(value))<=12
    and not exists(
      select 1 from jsonb_each(value) entry
      where jsonb_typeof(entry.value)<>'number'
        or (entry.value #>> '{}')::numeric<0
        or (entry.value #>> '{}')::numeric>3600000
    );
$$;
revoke all on function private.rafid_valid_stage_timings(jsonb) from public,anon,authenticated;

create table if not exists public.rafid_platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check(role in ('owner','admin','analyst')),
  is_active boolean not null default true,
  added_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rafid_platform_admin_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null check(char_length(email) between 5 and 320),
  role text not null check(role in ('admin','analyst')),
  expires_at timestamptz not null default(now()+interval '14 days'),
  accepted_at timestamptz null,
  accepted_by uuid null references auth.users(id) on delete set null,
  revoked_at timestamptz null,
  revoked_by uuid null references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(email)
);

create table if not exists public.rafid_product_events (
  id bigint generated always as identity primary key,
  flow_id uuid not null,
  event_name text not null check(event_name in ('service_started','analysis_finished','report_viewed','report_downloaded','feedback_submitted')),
  service_key text not null check(service_key in ('general_readiness','opportunity_match','funding_discovery','portfolio_compare','institution_workspace','improve_research')),
  outcome text null check(outcome in ('succeeded','failed','timed_out','cancelled')),
  duration_ms integer null check(duration_ms between 0 and 3600000),
  stage_timings jsonb not null default '{}'::jsonb check(private.rafid_valid_stage_timings(stage_timings)),
  error_code text null check(error_code ~ '^[A-Z0-9_]{2,80}$'),
  rating smallint null check(rating between 1 and 3),
  gap_keys text[] not null default '{}' check(gap_keys <@ array['budget','impact','methodology','evidence','team','risk','timeline','eligibility','intellectual_property','partnerships','market','measurement','other']::text[]),
  occurred_at timestamptz not null default now(),
  schema_version text not null default 'rafid.product-event.v1' check(schema_version='rafid.product-event.v1')
);

create index if not exists rafid_product_events_time_idx on public.rafid_product_events(occurred_at desc);
create index if not exists rafid_product_events_event_time_idx on public.rafid_product_events(event_name,occurred_at desc);
create index if not exists rafid_product_events_service_time_idx on public.rafid_product_events(service_key,occurred_at desc);
create index if not exists rafid_platform_invites_email_idx on public.rafid_platform_admin_invites(lower(email));

alter table public.rafid_platform_admins enable row level security;
alter table public.rafid_platform_admin_invites enable row level security;
alter table public.rafid_product_events enable row level security;

revoke all on public.rafid_platform_admins,public.rafid_platform_admin_invites,public.rafid_product_events from anon;
revoke all on public.rafid_product_events from authenticated;
grant select,insert,update,delete on public.rafid_platform_admins,public.rafid_platform_admin_invites to authenticated;

create or replace function private.rafid_is_platform_admin(allowed_roles text[] default array['owner','admin','analyst'])
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from public.rafid_platform_admins a
    where a.user_id=(select auth.uid()) and a.is_active and a.role=any(allowed_roles)
  );
$$;
revoke all on function private.rafid_is_platform_admin(text[]) from public,anon;
grant execute on function private.rafid_is_platform_admin(text[]) to authenticated;

create policy rafid_platform_admins_select on public.rafid_platform_admins for select to authenticated
  using((select private.rafid_is_platform_admin()));
create policy rafid_platform_admins_insert on public.rafid_platform_admins for insert to authenticated
  with check((select private.rafid_is_platform_admin(array['owner'])) and added_by=(select auth.uid()));
create policy rafid_platform_admins_update on public.rafid_platform_admins for update to authenticated
  using((select private.rafid_is_platform_admin(array['owner'])))
  with check((select private.rafid_is_platform_admin(array['owner'])));
create policy rafid_platform_admins_delete on public.rafid_platform_admins for delete to authenticated
  using((select private.rafid_is_platform_admin(array['owner'])) and role<>'owner');

create policy rafid_platform_invites_select on public.rafid_platform_admin_invites for select to authenticated
  using((select private.rafid_is_platform_admin(array['owner','admin'])) or lower(email)=lower(coalesce((select auth.jwt()->>'email'),'')));
create policy rafid_platform_invites_insert on public.rafid_platform_admin_invites for insert to authenticated
  with check((select private.rafid_is_platform_admin(array['owner','admin'])) and created_by=(select auth.uid()));
create policy rafid_platform_invites_update on public.rafid_platform_admin_invites for update to authenticated
  using((select private.rafid_is_platform_admin(array['owner','admin'])))
  with check((select private.rafid_is_platform_admin(array['owner','admin'])));
create policy rafid_platform_invites_delete on public.rafid_platform_admin_invites for delete to authenticated
  using((select private.rafid_is_platform_admin(array['owner'])));

create or replace function private.rafid_platform_admin_status()
returns jsonb language sql stable security definer set search_path=''
as $$
  select coalesce((
    select jsonb_build_object('is_admin',true,'role',role)
    from public.rafid_platform_admins
    where user_id=(select auth.uid()) and is_active
  ),jsonb_build_object('is_admin',false,'role',null));
$$;
revoke all on function private.rafid_platform_admin_status() from public,anon;
grant execute on function private.rafid_platform_admin_status() to authenticated;

create or replace function public.rafid_platform_admin_status()
returns jsonb language sql stable security invoker set search_path=''
as $$ select private.rafid_platform_admin_status(); $$;
revoke all on function public.rafid_platform_admin_status() from public,anon;
grant execute on function public.rafid_platform_admin_status() to authenticated;

create or replace function private.rafid_accept_platform_admin_invites()
returns integer language plpgsql security definer set search_path=''
as $$
declare accepted_count integer;
begin
  if (select auth.uid()) is null then raise exception 'authentication required' using errcode='42501'; end if;
  with accepted as (
    update public.rafid_platform_admin_invites
    set accepted_at=now(),accepted_by=(select auth.uid())
    where accepted_at is null and revoked_at is null and expires_at>now()
      and lower(email)=lower(coalesce((select auth.jwt()->>'email'),''))
    returning role,created_by
  ), inserted as (
    insert into public.rafid_platform_admins(user_id,role,added_by)
    select (select auth.uid()),role,created_by from accepted
    on conflict(user_id) do update set role=excluded.role,is_active=true,updated_at=now()
    returning 1
  ) select count(*) into accepted_count from inserted;
  return accepted_count;
end;
$$;
revoke all on function private.rafid_accept_platform_admin_invites() from public,anon;
grant execute on function private.rafid_accept_platform_admin_invites() to authenticated;

create or replace function public.rafid_accept_platform_admin_invites()
returns integer language sql volatile security invoker set search_path=''
as $$ select private.rafid_accept_platform_admin_invites(); $$;
revoke all on function public.rafid_accept_platform_admin_invites() from public,anon;
grant execute on function public.rafid_accept_platform_admin_invites() to authenticated;

create or replace function private.rafid_product_operations_dashboard(target_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare since_at timestamptz; result jsonb;
begin
  if not (select private.rafid_is_platform_admin()) then raise exception 'access denied' using errcode='42501'; end if;
  since_at:=now()-(greatest(1,least(coalesce(target_days,30),365))||' days')::interval;
  with scoped as (
    select * from public.rafid_product_events where occurred_at>=since_at
  ), outcomes as (
    select count(*) filter(where outcome='succeeded') succeeded,
      count(*) filter(where outcome='failed') failed,
      count(*) filter(where outcome='timed_out') timed_out,
      count(*) filter(where outcome='cancelled') cancelled
    from scoped where event_name='analysis_finished'
  ), stages as (
    select key stage,round(avg((value #>> '{}')::numeric))::integer average_ms,
      percentile_cont(.95) within group(order by (value #>> '{}')::numeric)::integer p95_ms,
      count(*) samples
    from scoped cross join lateral jsonb_each(stage_timings)
    where event_name='analysis_finished' group by key
  ), services as (
    select service_key,count(*) uses from scoped where event_name='service_started' group by service_key order by uses desc
  ), errors as (
    select error_code,count(*) total from scoped where event_name='analysis_finished' and error_code is not null group by error_code order by total desc limit 10
  ), ratings as (
    select round(avg(rating)::numeric,2) average,count(*) total,
      count(*) filter(where rating=3) very_useful,count(*) filter(where rating=2) partly_useful,count(*) filter(where rating=1) not_useful
    from scoped where event_name='feedback_submitted'
  ), gaps as (
    select gap_key,count(*) total from scoped cross join lateral unnest(gap_keys) gap_key
    where event_name='analysis_finished' and outcome='succeeded' group by gap_key order by total desc limit 12
  ), daily as (
    select occurred_at::date metric_date,
      count(*) filter(where event_name='analysis_finished' and outcome='succeeded') succeeded,
      count(*) filter(where event_name='analysis_finished' and outcome<>'succeeded') unsuccessful
    from scoped group by occurred_at::date order by metric_date
  ), reach as (
    select count(distinct flow_id) filter(where event_name='report_viewed') report_flows,
      count(distinct flow_id) filter(where event_name='report_downloaded') download_flows
    from scoped
  ), completed as (
    select count(distinct flow_id) total from scoped where event_name='analysis_finished' and outcome='succeeded'
  )
  select jsonb_build_object(
    'window_days',greatest(1,least(coalesce(target_days,30),365)),
    'freshness',coalesce((select max(occurred_at) from scoped),null),
    'analysis',(select to_jsonb(outcomes) from outcomes),
    'cancellation_rate',coalesce((select round(cancelled::numeric/nullif(succeeded+failed+timed_out+cancelled,0)*100,1) from outcomes),0),
    'report_reach_rate',coalesce((select round(report_flows::numeric/nullif(total,0)*100,1) from reach,completed),0),
    'report_download_rate',coalesce((select round(download_flows::numeric/nullif(report_flows,0)*100,1) from reach),0),
    'stage_timings',coalesce((select jsonb_agg(to_jsonb(stages) order by average_ms desc) from stages),'[]'::jsonb),
    'services',coalesce((select jsonb_agg(to_jsonb(services)) from services),'[]'::jsonb),
    'errors',coalesce((select jsonb_agg(to_jsonb(errors)) from errors),'[]'::jsonb),
    'ratings',(select to_jsonb(ratings) from ratings),
    'gaps',coalesce((select jsonb_agg(to_jsonb(gaps)) from gaps),'[]'::jsonb),
    'daily',coalesce((select jsonb_agg(to_jsonb(daily)) from daily),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function private.rafid_product_operations_dashboard(integer) from public,anon;
grant execute on function private.rafid_product_operations_dashboard(integer) to authenticated;

create or replace function public.rafid_product_operations_dashboard(target_days integer default 30)
returns jsonb language sql stable security invoker set search_path=''
as $$ select private.rafid_product_operations_dashboard(target_days); $$;
revoke all on function public.rafid_product_operations_dashboard(integer) from public,anon;
grant execute on function public.rafid_product_operations_dashboard(integer) to authenticated;

notify pgrst,'reload schema';
