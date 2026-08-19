"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const migration = fs.readFileSync(path.join(root, "supabase", "migrations", "20260810_institutional_workspaces.sql"), "utf8");
const frontend = fs.readFileSync(path.join(root, "frontend", "institution-workspace.js"), "utf8");
const html = fs.readFileSync(path.join(root, "frontend", "index.html"), "utf8");
const auth = fs.readFileSync(path.join(root, "src", "lib", "auth.js"), "utf8");

const tenantTables = [
  "rafid_organizations", "rafid_departments", "rafid_organization_members",
  "rafid_organization_invites", "rafid_institution_opportunities",
  "rafid_institution_projects", "rafid_project_assignments",
  "rafid_project_reviews", "rafid_audit_log",
];

for (const table of tenantTables) {
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"), `${table} must enable RLS.`);
  assert.match(migration, new RegExp(`public\\.${table}`), `${table} must be covered by migration.`);
}
assert.match(migration, /rafid_is_org_member\(organization_id\)/, "Tenant reads must be membership-bound.");
assert.match(migration, /rafid_has_org_role\(organization_id,array\['owner','admin'/, "Privileged writes must require an explicit role.");
assert.match(migration, /raw_content_stored boolean not null default false check \(raw_content_stored = false\)/, "Raw research storage must be prohibited by schema.");
for (const constraint of ["rafid_members_department_tenant_fk", "rafid_invites_department_tenant_fk", "rafid_projects_department_tenant_fk", "rafid_assignments_project_tenant_fk", "rafid_reviews_project_tenant_fk", "rafid_reviews_opportunity_tenant_fk"]) {
  assert.match(migration, new RegExp(constraint), `${constraint} must enforce cross-table tenant consistency.`);
}
assert.match(migration, /create trigger [^\n]+_audit/si, "Institution changes must be audited.");
assert.match(migration, /revoke all on public\.rafid_organizations[^;]+from anon;/s, "Anonymous users must have no institutional table privileges.");
assert.doesNotMatch(migration, /revoke all on all tables in schema public from anon/i, "The institutional migration must not mutate unrelated table grants.");
assert.doesNotMatch(frontend + html, /SUPABASE_SERVICE_ROLE_KEY|service[_-]?role/i, "Service role material must not appear in the browser bundle.");
assert.match(frontend, /headers\.Authorization = `Bearer \$\{token\}`/, "Institution requests must carry the user's JWT for RLS.");
assert.match(frontend, /sessionStorage/, "Institution sessions must not be persisted beyond the browser tab.");
assert.match(frontend, /storage: window\.sessionStorage[^]*flowType: "pkce"/s, "Google OAuth must use PKCE with tab-scoped storage.");
assert.match(frontend, /auth\.signOut\(\{ scope: "local" \}\)/, "Signing out must clear the SDK's local OAuth session.");
assert.match(frontend, /provider: "google"/, "Institution owners need a Google OAuth sign-in path.");
assert.match(frontend, /redirectTo: oauthRedirectUrl\(\)/, "OAuth must return through the controlled same-origin callback.");
assert.match(frontend, /searchParams\.delete\("rafid_auth"\)[^]*history\.replaceState/s, "OAuth callback markers must be removed from the visible URL.");
assert.match(frontend, /addEventListener\("load", async \(\) =>[^]*restoreOAuthSession\(\)/s, "OAuth restoration must run after the main shell has finished initializing.");
assert.match(frontend, /raw_content_stored: false/, "Project writes must explicitly reject raw content persistence.");
assert.match(auth, /service_role_exposed: false/, "Public config must declare that service role is not exposed.");
assert.match(html, /rafid-i18n\.js[^]*institution-workspace\.js/, "Language support must load before the institution workspace.");
console.log("Rafid institutional tenant isolation, roles, audit, privacy, and browser-secret checks passed.");
