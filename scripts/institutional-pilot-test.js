"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const migration = fs.readFileSync(path.join(root, "supabase", "migrations", "20260818143652_institutional_pilot_and_improvement_workspace.sql"), "utf8");
const hardening = fs.readFileSync(path.join(root, "supabase", "migrations", "20260818145110_harden_institutional_pilot_rls.sql"), "utf8");
const ui = fs.readFileSync(path.join(root, "frontend", "institution-workspace.js"), "utf8");

for (const table of ["rafid_project_batches", "rafid_review_comments", "rafid_project_improvement_items", "rafid_readiness_snapshots"]) {
  assert.match(migration, new RegExp(`create table if not exists public\\.${table}`, "i"));
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  assert.match(migration, new RegExp(`revoke all on[^;]+${table}[^;]+from anon`, "is"));
}
for (const constraint of ["rafid_projects_batch_tenant_fk", "rafid_comments_review_tenant_fk", "rafid_improvements_project_tenant_fk", "rafid_improvements_review_tenant_fk", "rafid_snapshots_project_tenant_fk", "rafid_snapshots_opportunity_tenant_fk"]) {
  assert.match(migration, new RegExp(constraint));
}
assert.match(migration, /rafid_can_review_project\(organization_id,project_id\)/);
assert.match(migration, /assignment_role='reviewer'/);
assert.match(migration, /approved_by is null or public\.rafid_has_org_role/);
assert.match(migration, /security invoker/);
assert.match(migration, /revoked_at is null/);
assert.match(ui, /parseProjectCsv/);
assert.match(ui, /rafid_project_batches/);
assert.match(ui, /rafid_project_assignments/);
assert.match(ui, /rafid_project_reviews/);
assert.match(ui, /rafid_review_comments/);
assert.match(ui, /add-review-comment/);
assert.match(ui, /application\/vnd\.ms-excel/);
assert.match(ui, /report\.print\(\)/);
assert.doesNotMatch(ui, /service[_-]?role|SUPABASE_SERVICE_ROLE_KEY/i);
for (const triggerFunction of ["rafid_add_owner_membership", "rafid_audit_change", "rls_auto_enable"]) {
  assert.match(hardening, new RegExp(`revoke execute on function public\\.${triggerFunction}\\(\\) from public,anon,authenticated`, "i"));
}
assert.match(hardening, /rafid_improvements_insert/);
assert.match(hardening, /created_by=\(select auth\.uid\(\)\)/);

console.log("Rafid institutional pilot workflow and tenant-bound schema tests passed.");
