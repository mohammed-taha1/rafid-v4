-- Close direct RPC access to trigger/event-trigger functions and tune pilot RLS.

revoke execute on function public.rafid_add_owner_membership() from public,anon,authenticated;
revoke execute on function public.rafid_audit_change() from public,anon,authenticated;
revoke execute on function public.rls_auto_enable() from public,anon,authenticated;

create index if not exists rafid_projects_org_batch_idx
  on public.rafid_institution_projects(organization_id,batch_id)
  where batch_id is not null;
create index if not exists rafid_comments_org_review_idx
  on public.rafid_review_comments(organization_id,review_id);
create index if not exists rafid_improvements_org_review_idx
  on public.rafid_project_improvement_items(organization_id,source_review_id)
  where source_review_id is not null;
create index if not exists rafid_snapshots_org_opportunity_idx
  on public.rafid_readiness_snapshots(organization_id,opportunity_id)
  where opportunity_id is not null;

drop policy if exists rafid_improvements_write on public.rafid_project_improvement_items;
create policy rafid_improvements_insert on public.rafid_project_improvement_items
  for insert to authenticated
  with check (public.rafid_can_review_project(organization_id,project_id)
    and created_by=(select auth.uid()));
create policy rafid_improvements_update on public.rafid_project_improvement_items
  for update to authenticated
  using (public.rafid_can_review_project(organization_id,project_id))
  with check (public.rafid_can_review_project(organization_id,project_id));
create policy rafid_improvements_delete on public.rafid_project_improvement_items
  for delete to authenticated
  using (public.rafid_has_org_role(organization_id,array['owner','admin','program_manager']));

drop policy if exists rafid_batches_insert on public.rafid_project_batches;
create policy rafid_batches_insert on public.rafid_project_batches for insert to authenticated
  with check (public.rafid_has_org_role(organization_id,array['owner','admin','program_manager'])
    and created_by=(select auth.uid()));

drop policy if exists rafid_comments_insert on public.rafid_review_comments;
create policy rafid_comments_insert on public.rafid_review_comments for insert to authenticated
  with check (public.rafid_can_comment_review(organization_id,review_id)
    and created_by=(select auth.uid()));
drop policy if exists rafid_comments_update on public.rafid_review_comments;
create policy rafid_comments_update on public.rafid_review_comments for update to authenticated
  using (created_by=(select auth.uid()))
  with check (created_by=(select auth.uid()) and public.rafid_is_org_member(organization_id));

drop policy if exists rafid_snapshots_insert on public.rafid_readiness_snapshots;
create policy rafid_snapshots_insert on public.rafid_readiness_snapshots for insert to authenticated
  with check (public.rafid_can_review_project(organization_id,project_id)
    and recorded_by=(select auth.uid()));

drop policy if exists rafid_reviews_insert on public.rafid_project_reviews;
create policy rafid_reviews_insert on public.rafid_project_reviews for insert to authenticated
  with check (public.rafid_can_review_project(organization_id,project_id)
    and reviewed_by=(select auth.uid()));
drop policy if exists rafid_reviews_update on public.rafid_project_reviews;
create policy rafid_reviews_update on public.rafid_project_reviews for update to authenticated
  using (public.rafid_can_review_project(organization_id,project_id))
  with check (public.rafid_can_review_project(organization_id,project_id)
    and (reviewed_by=(select auth.uid()) or public.rafid_has_org_role(organization_id,array['owner','admin','program_manager']))
    and (approved_by is null or public.rafid_has_org_role(organization_id,array['owner','admin','program_manager'])));

notify pgrst,'reload schema';
