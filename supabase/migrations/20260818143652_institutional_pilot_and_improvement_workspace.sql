-- Rafid institutional pilot and Improve Your Research workspace.
-- Stores structured operational records only; raw research and uploaded files remain prohibited.

alter table public.rafid_organizations
  add column if not exists pilot_status text not null default 'preparing'
    check (pilot_status in ('preparing','active','completed','paused')),
  add column if not exists pilot_started_at timestamptz null,
  add column if not exists pilot_completed_at timestamptz null;

alter table public.rafid_organization_invites
  add column if not exists revoked_at timestamptz null,
  add column if not exists revoked_by uuid null references auth.users(id) on delete set null;

create table if not exists public.rafid_project_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.rafid_organizations(id) on delete cascade,
  label text not null check (char_length(label) between 2 and 180),
  source_filename text null check (char_length(source_filename) <= 240),
  project_count integer not null default 0 check (project_count between 0 and 500),
  status text not null default 'imported' check (status in ('imported','reviewing','completed','failed')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id,id)
);

alter table public.rafid_institution_projects
  add column if not exists batch_id uuid null;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='rafid_projects_batch_tenant_fk') then
    alter table public.rafid_institution_projects
      add constraint rafid_projects_batch_tenant_fk
      foreign key(organization_id,batch_id)
      references public.rafid_project_batches(organization_id,id) on delete set null;
  end if;
end $$;

alter table public.rafid_project_reviews
  add column if not exists review_status text not null default 'submitted'
    check (review_status in ('draft','submitted','changes_requested','approved','rejected')),
  add column if not exists reviewer_comment text null check (char_length(reviewer_comment) <= 4000),
  add column if not exists recommendation text null check (char_length(recommendation) <= 1200),
  add column if not exists approved_by uuid null references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz null;

create table if not exists public.rafid_review_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.rafid_organizations(id) on delete cascade,
  review_id uuid not null references public.rafid_project_reviews(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  comment_kind text not null default 'review' check (comment_kind in ('review','evidence_request','decision')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id)
);

create unique index if not exists rafid_reviews_org_id_unique on public.rafid_project_reviews(organization_id,id);
do $$ begin
  if not exists(select 1 from pg_constraint where conname='rafid_comments_review_tenant_fk') then
    alter table public.rafid_review_comments
      add constraint rafid_comments_review_tenant_fk
      foreign key(organization_id,review_id)
      references public.rafid_project_reviews(organization_id,id) on delete cascade;
  end if;
end $$;

create table if not exists public.rafid_project_improvement_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.rafid_organizations(id) on delete cascade,
  project_id uuid not null references public.rafid_institution_projects(id) on delete cascade,
  source_review_id uuid null references public.rafid_project_reviews(id) on delete set null,
  item_type text not null check (item_type in ('gap','question','impact','budget','risk','implementation','evidence')),
  title text not null check (char_length(title) between 2 and 300),
  guidance text null check (char_length(guidance) <= 4000),
  evidence_required text null check (char_length(evidence_required) <= 2000),
  priority text not null default 'important' check (priority in ('critical','important','additional')),
  status text not null default 'open' check (status in ('open','in_progress','completed','blocked')),
  completed_at timestamptz null,
  completed_by uuid null references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id)
);

alter table public.rafid_project_improvement_items drop constraint if exists rafid_project_improvement_items_source_review_id_fkey;

create table if not exists public.rafid_readiness_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.rafid_organizations(id) on delete cascade,
  project_id uuid not null references public.rafid_institution_projects(id) on delete cascade,
  opportunity_id uuid null references public.rafid_institution_opportunities(id) on delete set null,
  round_number integer not null check (round_number between 1 and 100),
  technical_score smallint null check (technical_score between 0 and 100),
  funding_score smallint null check (funding_score between 0 and 100),
  evidence_score smallint not null default 0 check (evidence_score between 0 and 100),
  confidence_score smallint not null default 0 check (confidence_score between 0 and 100),
  eligibility text not null default 'unknown' check (eligibility in ('eligible','conditional','unknown','ineligible')),
  critical_gap_count integer not null default 0 check (critical_gap_count >= 0),
  completed_item_count integer not null default 0 check (completed_item_count >= 0),
  assessment_version text not null,
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  unique (project_id,opportunity_id,round_number),
  unique (organization_id,id)
);

do $$ begin
  if not exists(select 1 from pg_constraint where conname='rafid_improvements_project_tenant_fk') then
    alter table public.rafid_project_improvement_items add constraint rafid_improvements_project_tenant_fk foreign key(organization_id,project_id) references public.rafid_institution_projects(organization_id,id) on delete cascade;
  end if;
  if not exists(select 1 from pg_constraint where conname='rafid_improvements_review_tenant_fk') then
    alter table public.rafid_project_improvement_items add constraint rafid_improvements_review_tenant_fk foreign key(organization_id,source_review_id) references public.rafid_project_reviews(organization_id,id) on delete set null;
  end if;
  if not exists(select 1 from pg_constraint where conname='rafid_snapshots_project_tenant_fk') then
    alter table public.rafid_readiness_snapshots add constraint rafid_snapshots_project_tenant_fk foreign key(organization_id,project_id) references public.rafid_institution_projects(organization_id,id) on delete cascade;
  end if;
  if not exists(select 1 from pg_constraint where conname='rafid_snapshots_opportunity_tenant_fk') then
    alter table public.rafid_readiness_snapshots add constraint rafid_snapshots_opportunity_tenant_fk foreign key(organization_id,opportunity_id) references public.rafid_institution_opportunities(organization_id,id) on delete set null;
  end if;
end $$;

create index if not exists rafid_batches_org_idx on public.rafid_project_batches(organization_id,created_at desc);
create index if not exists rafid_comments_review_idx on public.rafid_review_comments(organization_id,review_id,created_at);
create index if not exists rafid_improvements_project_idx on public.rafid_project_improvement_items(organization_id,project_id,status,priority);
create index if not exists rafid_snapshots_project_idx on public.rafid_readiness_snapshots(organization_id,project_id,recorded_at);

create or replace function public.rafid_can_review_project(target_org uuid,target_project uuid)
returns boolean language sql stable security definer set search_path=public
as $$
  select public.rafid_has_org_role(target_org,array['owner','admin','program_manager'])
    or exists(
      select 1 from public.rafid_project_assignments a
      where a.organization_id=target_org and a.project_id=target_project
        and a.user_id=auth.uid() and a.assignment_role='reviewer'
    );
$$;
revoke all on function public.rafid_can_review_project(uuid,uuid) from public;
grant execute on function public.rafid_can_review_project(uuid,uuid) to authenticated;

create or replace function public.rafid_can_comment_review(target_org uuid,target_review uuid)
returns boolean language sql stable security definer set search_path=public
as $$
  select exists(
    select 1 from public.rafid_project_reviews r
    where r.organization_id=target_org and r.id=target_review
      and public.rafid_can_review_project(target_org,r.project_id)
  );
$$;
revoke all on function public.rafid_can_comment_review(uuid,uuid) from public;
grant execute on function public.rafid_can_comment_review(uuid,uuid) to authenticated;

alter table public.rafid_project_batches enable row level security;
alter table public.rafid_review_comments enable row level security;
alter table public.rafid_project_improvement_items enable row level security;
alter table public.rafid_readiness_snapshots enable row level security;

revoke all on public.rafid_project_batches,public.rafid_review_comments,public.rafid_project_improvement_items,public.rafid_readiness_snapshots from anon;
grant select,insert,update,delete on public.rafid_project_batches,public.rafid_review_comments,public.rafid_project_improvement_items,public.rafid_readiness_snapshots to authenticated;

create policy rafid_batches_select on public.rafid_project_batches for select to authenticated using (public.rafid_is_org_member(organization_id));
create policy rafid_batches_insert on public.rafid_project_batches for insert to authenticated
  with check (public.rafid_has_org_role(organization_id,array['owner','admin','program_manager']) and created_by=auth.uid());
create policy rafid_batches_update on public.rafid_project_batches for update to authenticated
  using (public.rafid_has_org_role(organization_id,array['owner','admin','program_manager']))
  with check (public.rafid_has_org_role(organization_id,array['owner','admin','program_manager']));
create policy rafid_batches_delete on public.rafid_project_batches for delete to authenticated
  using (public.rafid_has_org_role(organization_id,array['owner','admin']));

create policy rafid_comments_select on public.rafid_review_comments for select to authenticated using (public.rafid_is_org_member(organization_id));
create policy rafid_comments_insert on public.rafid_review_comments for insert to authenticated
  with check (public.rafid_can_comment_review(organization_id,review_id) and created_by=auth.uid());
create policy rafid_comments_update on public.rafid_review_comments for update to authenticated
  using (created_by=auth.uid()) with check (created_by=auth.uid() and public.rafid_is_org_member(organization_id));

create policy rafid_improvements_select on public.rafid_project_improvement_items for select to authenticated using (public.rafid_is_org_member(organization_id));
create policy rafid_improvements_write on public.rafid_project_improvement_items for all to authenticated
  using (public.rafid_can_review_project(organization_id,project_id))
  with check (public.rafid_can_review_project(organization_id,project_id));

create policy rafid_snapshots_select on public.rafid_readiness_snapshots for select to authenticated using (public.rafid_is_org_member(organization_id));
create policy rafid_snapshots_insert on public.rafid_readiness_snapshots for insert to authenticated
  with check (public.rafid_can_review_project(organization_id,project_id) and recorded_by=auth.uid());

drop policy if exists rafid_reviews_insert on public.rafid_project_reviews;
create policy rafid_reviews_insert on public.rafid_project_reviews for insert to authenticated
  with check (public.rafid_can_review_project(organization_id,project_id) and reviewed_by=auth.uid());
drop policy if exists rafid_reviews_update on public.rafid_project_reviews;
create policy rafid_reviews_update on public.rafid_project_reviews for update to authenticated
  using (public.rafid_can_review_project(organization_id,project_id))
  with check (public.rafid_can_review_project(organization_id,project_id)
    and (reviewed_by=auth.uid() or public.rafid_has_org_role(organization_id,array['owner','admin','program_manager']))
    and (approved_by is null or public.rafid_has_org_role(organization_id,array['owner','admin','program_manager'])));

drop policy if exists rafid_invites_update on public.rafid_organization_invites;
create policy rafid_invites_update on public.rafid_organization_invites for update to authenticated
  using (public.rafid_has_org_role(organization_id,array['owner','admin']))
  with check (public.rafid_has_org_role(organization_id,array['owner','admin']));

do $$ declare table_name text; begin
  foreach table_name in array array['rafid_project_batches','rafid_review_comments','rafid_project_improvement_items','rafid_readiness_snapshots'] loop
    execute format('drop trigger if exists %I_audit on public.%I',table_name,table_name);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.rafid_audit_change()',table_name,table_name);
  end loop;
end $$;

create or replace function public.rafid_institution_matrix(target_org uuid)
returns jsonb language sql stable security invoker set search_path=public
as $$
  select case when public.rafid_is_org_member(target_org) then jsonb_build_object(
    'projects',(select coalesce(jsonb_agg(to_jsonb(p) order by p.funding_score desc),'[]'::jsonb) from (select id,title,field,funding_score,evidence_score from public.rafid_institution_projects where organization_id=target_org and status<>'archived') p),
    'opportunities',(select coalesce(jsonb_agg(to_jsonb(o) order by o.deadline nulls last),'[]'::jsonb) from (select id,title,funder,deadline,status from public.rafid_institution_opportunities where organization_id=target_org) o),
    'reviews',(select coalesce(jsonb_agg(to_jsonb(r) order by r.round_number desc),'[]'::jsonb) from (select project_id,opportunity_id,round_number,eligibility,readiness_score,evidence_score,confidence_score,review_status from public.rafid_project_reviews where organization_id=target_org) r)
  ) else null end;
$$;
revoke all on function public.rafid_institution_matrix(uuid) from public,anon;
grant execute on function public.rafid_institution_matrix(uuid) to authenticated;

create or replace function public.rafid_accept_invitation(invite_id uuid)
returns uuid language plpgsql security definer set search_path=public
as $$ declare invite public.rafid_organization_invites; begin
  select * into invite from public.rafid_organization_invites
  where id=invite_id and accepted_at is null and revoked_at is null and expires_at>now()
    and lower(email)=lower(coalesce(auth.jwt()->>'email','')) for update;
  if invite.id is null then raise exception 'Invitation is invalid, expired, revoked, or belongs to another email.'; end if;
  insert into public.rafid_organization_members(organization_id,user_id,department_id,role,created_by)
  values(invite.organization_id,auth.uid(),invite.department_id,invite.role,invite.created_by)
  on conflict(organization_id,user_id) do update set department_id=excluded.department_id,role=excluded.role,is_active=true;
  update public.rafid_organization_invites set accepted_at=now(),accepted_by=auth.uid() where id=invite.id;
  return invite.organization_id;
end $$;
revoke all on function public.rafid_accept_invitation(uuid) from public,anon;
grant execute on function public.rafid_accept_invitation(uuid) to authenticated;

notify pgrst,'reload schema';
