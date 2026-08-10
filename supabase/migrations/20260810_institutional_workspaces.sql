-- Rafid institutional workspaces: strict tenant isolation, roles, and audit trail.
-- No raw research text or uploaded file content is stored by this schema.

create extension if not exists pgcrypto;

create table if not exists public.rafid_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rafid_departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.rafid_organizations(id) on delete cascade,
  parent_id uuid null references public.rafid_departments(id) on delete set null,
  name text not null check (char_length(name) between 2 and 160),
  kind text not null default 'department' check (kind in ('department','center','program','unit')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.rafid_organization_members (
  organization_id uuid not null references public.rafid_organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  department_id uuid null references public.rafid_departments(id) on delete set null,
  role text not null check (role in ('owner','admin','program_manager','reviewer','viewer')),
  is_active boolean not null default true,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists public.rafid_organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.rafid_organizations(id) on delete cascade,
  email text not null check (char_length(email) between 5 and 320),
  role text not null check (role in ('admin','program_manager','reviewer','viewer')),
  department_id uuid null references public.rafid_departments(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz null,
  accepted_by uuid null references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id,email)
);

create table if not exists public.rafid_institution_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.rafid_organizations(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 240),
  funder text null check (char_length(funder) <= 200),
  official_url text null check (official_url is null or official_url ~ '^https://'),
  deadline date null,
  status text not null default 'verify' check (status in ('open','upcoming','closed','verify')),
  profile jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rafid_institution_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.rafid_organizations(id) on delete cascade,
  department_id uuid null references public.rafid_departments(id) on delete set null,
  title text not null check (char_length(title) between 2 and 240),
  field text null check (char_length(field) <= 180),
  readiness_stage text not null default 'unknown' check (readiness_stage in ('idea','concept','prototype','lab_test','field_test','mvp','scale_ready','unknown')),
  trl smallint null check (trl between 1 and 9),
  technical_score smallint not null default 0 check (technical_score between 0 and 100),
  funding_score smallint not null default 0 check (funding_score between 0 and 100),
  evidence_score smallint not null default 0 check (evidence_score between 0 and 100),
  preparation_horizon text not null default 'long' check (preparation_horizon in ('quick','medium','long')),
  current_round integer not null default 1 check (current_round between 1 and 100),
  status text not null default 'active' check (status in ('active','paused','submitted','archived')),
  summary jsonb not null default '{}'::jsonb,
  raw_content_stored boolean not null default false check (raw_content_stored = false),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rafid_project_assignments (
  organization_id uuid not null references public.rafid_organizations(id) on delete cascade,
  project_id uuid not null references public.rafid_institution_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  assignment_role text not null check (assignment_role in ('program_manager','reviewer','contributor','viewer')),
  assigned_by uuid not null references auth.users(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  primary key (project_id, user_id, assignment_role)
);

create table if not exists public.rafid_project_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.rafid_organizations(id) on delete cascade,
  project_id uuid not null references public.rafid_institution_projects(id) on delete cascade,
  opportunity_id uuid null references public.rafid_institution_opportunities(id) on delete set null,
  round_number integer not null check (round_number between 1 and 100),
  eligibility text not null check (eligibility in ('eligible','conditional','unknown','ineligible')),
  readiness_score smallint not null check (readiness_score between 0 and 100),
  evidence_score smallint not null check (evidence_score between 0 and 100),
  confidence_score smallint not null check (confidence_score between 0 and 100),
  blockers jsonb not null default '[]'::jsonb,
  shared_gaps jsonb not null default '[]'::jsonb,
  training_needs text[] not null default '{}',
  decision_note text null check (char_length(decision_note) <= 2000),
  reviewed_by uuid not null references auth.users(id) on delete restrict,
  reviewed_at timestamptz not null default now(),
  unique (project_id, opportunity_id, round_number)
);

create table if not exists public.rafid_audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.rafid_organizations(id) on delete cascade,
  actor_user_id uuid null references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists rafid_members_user_idx on public.rafid_organization_members(user_id, is_active);
create index if not exists rafid_departments_org_idx on public.rafid_departments(organization_id);
create index if not exists rafid_projects_org_idx on public.rafid_institution_projects(organization_id, status, readiness_stage);
create index if not exists rafid_reviews_org_idx on public.rafid_project_reviews(organization_id, opportunity_id, round_number);
create index if not exists rafid_audit_org_idx on public.rafid_audit_log(organization_id, created_at desc);
create unique index if not exists rafid_departments_org_id_unique on public.rafid_departments(organization_id,id);
create unique index if not exists rafid_projects_org_id_unique on public.rafid_institution_projects(organization_id,id);
create unique index if not exists rafid_opportunities_org_id_unique on public.rafid_institution_opportunities(organization_id,id);

-- Composite tenant keys prevent a valid record from one organization being linked
-- to a row owned by a different organization, even if its UUID is known.
do $$ begin
  if not exists(select 1 from pg_constraint where conname='rafid_members_department_tenant_fk') then
    alter table public.rafid_organization_members add constraint rafid_members_department_tenant_fk foreign key(organization_id,department_id) references public.rafid_departments(organization_id,id);
  end if;
  if not exists(select 1 from pg_constraint where conname='rafid_invites_department_tenant_fk') then
    alter table public.rafid_organization_invites add constraint rafid_invites_department_tenant_fk foreign key(organization_id,department_id) references public.rafid_departments(organization_id,id);
  end if;
  if not exists(select 1 from pg_constraint where conname='rafid_projects_department_tenant_fk') then
    alter table public.rafid_institution_projects add constraint rafid_projects_department_tenant_fk foreign key(organization_id,department_id) references public.rafid_departments(organization_id,id);
  end if;
  if not exists(select 1 from pg_constraint where conname='rafid_assignments_project_tenant_fk') then
    alter table public.rafid_project_assignments add constraint rafid_assignments_project_tenant_fk foreign key(organization_id,project_id) references public.rafid_institution_projects(organization_id,id) on delete cascade;
  end if;
  if not exists(select 1 from pg_constraint where conname='rafid_reviews_project_tenant_fk') then
    alter table public.rafid_project_reviews add constraint rafid_reviews_project_tenant_fk foreign key(organization_id,project_id) references public.rafid_institution_projects(organization_id,id) on delete cascade;
  end if;
  if not exists(select 1 from pg_constraint where conname='rafid_reviews_opportunity_tenant_fk') then
    alter table public.rafid_project_reviews add constraint rafid_reviews_opportunity_tenant_fk foreign key(organization_id,opportunity_id) references public.rafid_institution_opportunities(organization_id,id);
  end if;
end $$;

create or replace function public.rafid_is_org_member(target_org uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.rafid_organization_members m where m.organization_id = target_org and m.user_id = auth.uid() and m.is_active); $$;

create or replace function public.rafid_has_org_role(target_org uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.rafid_organization_members m where m.organization_id = target_org and m.user_id = auth.uid() and m.is_active and m.role = any(allowed_roles)); $$;

revoke all on function public.rafid_is_org_member(uuid) from public;
revoke all on function public.rafid_has_org_role(uuid,text[]) from public;
grant execute on function public.rafid_is_org_member(uuid) to authenticated;
grant execute on function public.rafid_has_org_role(uuid,text[]) to authenticated;

create or replace function public.rafid_add_owner_membership()
returns trigger language plpgsql security definer set search_path = public
as $$ begin
  insert into public.rafid_organization_members(organization_id,user_id,role,created_by)
  values(new.id,new.created_by,'owner',new.created_by) on conflict do nothing;
  return new;
end; $$;

drop trigger if exists rafid_organization_owner_trigger on public.rafid_organizations;
create trigger rafid_organization_owner_trigger after insert on public.rafid_organizations
for each row execute function public.rafid_add_owner_membership();

create or replace function public.rafid_audit_change()
returns trigger language plpgsql security definer set search_path = public
as $$ declare org_id uuid; entity uuid; row_data jsonb; begin
  row_data := coalesce(to_jsonb(new),to_jsonb(old));
  org_id := coalesce(nullif(row_data->>'organization_id','')::uuid,case when tg_table_name='rafid_organizations' then nullif(row_data->>'id','')::uuid end);
  entity := coalesce(nullif(row_data->>'id','')::uuid,nullif(row_data->>'project_id','')::uuid);
  insert into public.rafid_audit_log(organization_id,actor_user_id,action,entity_type,entity_id,metadata)
  values(org_id,auth.uid(),lower(tg_op),tg_table_name,entity,jsonb_build_object('at',now()));
  return coalesce(new,old);
end; $$;

do $$ declare table_name text; begin
  foreach table_name in array array['rafid_organizations','rafid_departments','rafid_organization_members','rafid_organization_invites','rafid_institution_opportunities','rafid_institution_projects','rafid_project_assignments','rafid_project_reviews'] loop
    execute format('drop trigger if exists %I_audit on public.%I',table_name,table_name);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.rafid_audit_change()',table_name,table_name);
  end loop;
end $$;

alter table public.rafid_organizations enable row level security;
alter table public.rafid_departments enable row level security;
alter table public.rafid_organization_members enable row level security;
alter table public.rafid_organization_invites enable row level security;
alter table public.rafid_institution_opportunities enable row level security;
alter table public.rafid_institution_projects enable row level security;
alter table public.rafid_project_assignments enable row level security;
alter table public.rafid_project_reviews enable row level security;
alter table public.rafid_audit_log enable row level security;

revoke all on public.rafid_organizations,public.rafid_departments,public.rafid_organization_members,public.rafid_organization_invites,public.rafid_institution_opportunities,public.rafid_institution_projects,public.rafid_project_assignments,public.rafid_project_reviews,public.rafid_audit_log from anon;
grant select,insert,update,delete on public.rafid_organizations,public.rafid_departments,public.rafid_organization_members,public.rafid_organization_invites,public.rafid_institution_opportunities,public.rafid_institution_projects,public.rafid_project_assignments,public.rafid_project_reviews to authenticated;
grant select on public.rafid_audit_log to authenticated;
grant usage,select on sequence public.rafid_audit_log_id_seq to authenticated;

drop policy if exists rafid_org_select on public.rafid_organizations;
create policy rafid_org_select on public.rafid_organizations for select to authenticated using (public.rafid_is_org_member(id));
drop policy if exists rafid_org_insert on public.rafid_organizations;
create policy rafid_org_insert on public.rafid_organizations for insert to authenticated with check (created_by=auth.uid());
drop policy if exists rafid_org_update on public.rafid_organizations;
create policy rafid_org_update on public.rafid_organizations for update to authenticated using (public.rafid_has_org_role(id,array['owner','admin'])) with check (public.rafid_has_org_role(id,array['owner','admin']));

drop policy if exists rafid_members_select on public.rafid_organization_members;
create policy rafid_members_select on public.rafid_organization_members for select to authenticated using (public.rafid_is_org_member(organization_id));
drop policy if exists rafid_members_write on public.rafid_organization_members;
create policy rafid_members_write on public.rafid_organization_members for all to authenticated using (public.rafid_has_org_role(organization_id,array['owner','admin'])) with check (public.rafid_has_org_role(organization_id,array['owner','admin']));

drop policy if exists rafid_invites_select on public.rafid_organization_invites;
create policy rafid_invites_select on public.rafid_organization_invites for select to authenticated using (public.rafid_has_org_role(organization_id,array['owner','admin']) or lower(email)=lower(coalesce(auth.jwt()->>'email','')));
drop policy if exists rafid_invites_insert on public.rafid_organization_invites;
create policy rafid_invites_insert on public.rafid_organization_invites for insert to authenticated with check (public.rafid_has_org_role(organization_id,array['owner','admin']) and created_by=auth.uid());
drop policy if exists rafid_invites_delete on public.rafid_organization_invites;
create policy rafid_invites_delete on public.rafid_organization_invites for delete to authenticated using (public.rafid_has_org_role(organization_id,array['owner','admin']));

drop policy if exists rafid_departments_select on public.rafid_departments;
create policy rafid_departments_select on public.rafid_departments for select to authenticated using (public.rafid_is_org_member(organization_id));
drop policy if exists rafid_departments_write on public.rafid_departments;
create policy rafid_departments_write on public.rafid_departments for all to authenticated using (public.rafid_has_org_role(organization_id,array['owner','admin','program_manager'])) with check (public.rafid_has_org_role(organization_id,array['owner','admin','program_manager']) and created_by=auth.uid());

drop policy if exists rafid_opportunities_select on public.rafid_institution_opportunities;
create policy rafid_opportunities_select on public.rafid_institution_opportunities for select to authenticated using (public.rafid_is_org_member(organization_id));
drop policy if exists rafid_opportunities_write on public.rafid_institution_opportunities;
create policy rafid_opportunities_write on public.rafid_institution_opportunities for all to authenticated using (public.rafid_has_org_role(organization_id,array['owner','admin','program_manager'])) with check (public.rafid_has_org_role(organization_id,array['owner','admin','program_manager']) and created_by=auth.uid());

drop policy if exists rafid_projects_select on public.rafid_institution_projects;
create policy rafid_projects_select on public.rafid_institution_projects for select to authenticated using (public.rafid_is_org_member(organization_id));
drop policy if exists rafid_projects_insert on public.rafid_institution_projects;
create policy rafid_projects_insert on public.rafid_institution_projects for insert to authenticated with check (public.rafid_has_org_role(organization_id,array['owner','admin','program_manager']) and created_by=auth.uid() and raw_content_stored=false);
drop policy if exists rafid_projects_update on public.rafid_institution_projects;
create policy rafid_projects_update on public.rafid_institution_projects for update to authenticated using (public.rafid_has_org_role(organization_id,array['owner','admin','program_manager'])) with check (public.rafid_has_org_role(organization_id,array['owner','admin','program_manager']) and raw_content_stored=false);
drop policy if exists rafid_projects_delete on public.rafid_institution_projects;
create policy rafid_projects_delete on public.rafid_institution_projects for delete to authenticated using (public.rafid_has_org_role(organization_id,array['owner','admin']));

drop policy if exists rafid_assignments_select on public.rafid_project_assignments;
create policy rafid_assignments_select on public.rafid_project_assignments for select to authenticated using (public.rafid_is_org_member(organization_id));
drop policy if exists rafid_assignments_write on public.rafid_project_assignments;
create policy rafid_assignments_write on public.rafid_project_assignments for all to authenticated using (public.rafid_has_org_role(organization_id,array['owner','admin','program_manager'])) with check (public.rafid_has_org_role(organization_id,array['owner','admin','program_manager']) and assigned_by=auth.uid());

drop policy if exists rafid_reviews_select on public.rafid_project_reviews;
create policy rafid_reviews_select on public.rafid_project_reviews for select to authenticated using (public.rafid_is_org_member(organization_id));
drop policy if exists rafid_reviews_insert on public.rafid_project_reviews;
create policy rafid_reviews_insert on public.rafid_project_reviews for insert to authenticated with check (public.rafid_has_org_role(organization_id,array['owner','admin','program_manager','reviewer']) and reviewed_by=auth.uid());
drop policy if exists rafid_reviews_update on public.rafid_project_reviews;
create policy rafid_reviews_update on public.rafid_project_reviews for update to authenticated using (reviewed_by=auth.uid() or public.rafid_has_org_role(organization_id,array['owner','admin','program_manager'])) with check (public.rafid_is_org_member(organization_id));

drop policy if exists rafid_audit_select on public.rafid_audit_log;
create policy rafid_audit_select on public.rafid_audit_log for select to authenticated using (public.rafid_has_org_role(organization_id,array['owner','admin']));

create or replace function public.rafid_institution_dashboard(target_org uuid)
returns jsonb language plpgsql stable security invoker set search_path = public
as $$ declare result jsonb; begin
  if not public.rafid_is_org_member(target_org) then raise exception 'access denied' using errcode='42501'; end if;
  select jsonb_build_object(
    'project_count',(select count(*) from public.rafid_institution_projects p where p.organization_id=target_org and p.status<>'archived'),
    'by_stage',(select coalesce(jsonb_object_agg(readiness_stage,total),'{}'::jsonb) from (select readiness_stage,count(*) total from public.rafid_institution_projects where organization_id=target_org group by readiness_stage) s),
    'top_projects',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select id,title,funding_score,technical_score,evidence_score,preparation_horizon from public.rafid_institution_projects where organization_id=target_org order by funding_score desc,evidence_score desc limit 10) x),
    'quick_projects',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select id,title,funding_score from public.rafid_institution_projects where organization_id=target_org and preparation_horizon='quick' order by funding_score desc limit 10) x),
    'long_support_projects',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select id,title,funding_score from public.rafid_institution_projects where organization_id=target_org and preparation_horizon='long' order by funding_score desc limit 10) x),
    'top_by_opportunity',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select distinct on (r.opportunity_id) r.opportunity_id,o.title opportunity_title,p.id project_id,p.title project_title,r.readiness_score,r.eligibility from public.rafid_project_reviews r join public.rafid_institution_projects p on p.id=r.project_id left join public.rafid_institution_opportunities o on o.id=r.opportunity_id where r.organization_id=target_org order by r.opportunity_id,r.readiness_score desc,r.evidence_score desc) x),
    'common_blockers',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select blocker,count(*) total from public.rafid_project_reviews r cross join lateral jsonb_array_elements_text(r.blockers) blocker where r.organization_id=target_org group by blocker order by total desc limit 12) x),
    'training_needs',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select need,count(*) total from public.rafid_project_reviews r cross join lateral unnest(r.training_needs) need where r.organization_id=target_org group by need order by total desc limit 12) x),
    'fields_with_high_opportunity',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select coalesce(field,'Unspecified') field,count(*) total,round(avg(funding_score),1) average_score from public.rafid_institution_projects where organization_id=target_org group by field order by average_score desc,total desc limit 10) x),
    'round_progress',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select round_number,round(avg(readiness_score),1) readiness,round(avg(evidence_score),1) evidence,count(*) reviews from public.rafid_project_reviews where organization_id=target_org group by round_number order by round_number) x)
  ) into result;
  return result;
end; $$;

grant execute on function public.rafid_institution_dashboard(uuid) to authenticated;

create or replace function public.rafid_accept_my_institution_invites()
returns integer language plpgsql security definer set search_path = public
as $$ declare accepted_count integer; begin
  if auth.uid() is null or coalesce(auth.jwt()->>'email','')='' then return 0; end if;
  with accepted as (
    update public.rafid_organization_invites i set accepted_at=now(),accepted_by=auth.uid()
    where lower(i.email)=lower(auth.jwt()->>'email') and i.accepted_at is null and i.expires_at>now()
    returning i.organization_id,i.role,i.department_id,i.created_by
  ), inserted as (
    insert into public.rafid_organization_members(organization_id,user_id,department_id,role,created_by)
    select organization_id,auth.uid(),department_id,role,created_by from accepted
    on conflict (organization_id,user_id) do update set role=excluded.role,department_id=excluded.department_id,is_active=true
    returning 1
  ) select count(*) into accepted_count from inserted;
  return accepted_count;
end; $$;

revoke all on function public.rafid_accept_my_institution_invites() from public;
grant execute on function public.rafid_accept_my_institution_invites() to authenticated;
