#!/usr/bin/env node
/**
 * LEAD 443.294 (owner 10-23 8:52 PM) — ONE override reason catalog, ONE engine, ONE button; nothing to type.
 * Step 1 (this guard's first arm): catalogs.override_reasons is company-scoped, FORCE RLS, audited, context-checked,
 * and carries NO free-text reason ('other' / requires_note) — Owner/Accountant confirm via the role_only rows.
 *   R1  table + FORCE RLS + audit trigger + no DELETE policy;
 *   R2  contexts[] CHECK limited to the 10 owner contexts;
 *   R3  no 'other' code and no requires_note column (no free text);
 *   R4  role_only owner_override + accountant_override rows seeded (what the engine stores for those roles).
 * Step 1b:
 *   R5  GET /catalogs/override-reasons never offers role_only rows unless asked (include_role_only), and filters by context;
 *   R6  a role_only row keeps its code and contexts (409 role_only_reason_locked) and is never deactivated;
 *   R7  the Lists screen is mounted (/lists/accounting/override-reasons) and listed in All Catalogs.
 * Later steps extend this guard (engine refusal, one button, 0 free-text sites).
 * --selftest plants each regression and requires a FAIL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ALLOW_OFFLINE_SKIP = "static source scan; never connects to a database";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-override-reasons-one-catalog";
const MIG = "db/migrations/202616230300_override_reasons_catalog.sql";
const ROUTES = "apps/backend/src/catalogs/override-reasons.routes.ts";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";
const MAP = "apps/frontend/src/pages/lists/components/AllCatalogsMap.tsx";

export function auditStep1b(src) {
  const f = [];
  if (!/if \(q\.data\.include_role_only !== "true"\) where\.push\(`role_only = false`\)/.test(src.routes)) f.push("R5: the reason list offers role_only rows by default");
  if (!/where\.push\(`\$\$\{values\.length\}::text = ANY \(contexts\)`\)/.test(src.routes)) f.push("R5: the reason list does not filter by context");
  if (!/oldRow\.role_only && \("reason_code" in b \|\| "contexts" in b\)\) return \{ status: 409/.test(src.routes)) f.push("R6: a role_only row's code/contexts can be edited");
  if (!/WHERE id = \$1 AND role_only = false RETURNING/.test(src.routes)) f.push("R6: a role_only row can be deactivated");
  if (!/path="\/lists\/accounting\/override-reasons"/.test(src.manifest) || !/catalogKey: "override-reasons"/.test(src.map)) f.push("R7: the Override Reasons Lists screen is not mounted / listed");
  return f;
}

export function audit(sql) {
  const f = [];
  if (!/CREATE TABLE IF NOT EXISTS catalogs\.override_reasons/.test(sql)) f.push("R1: catalogs.override_reasons table missing");
  if (!/ALTER TABLE catalogs\.override_reasons FORCE ROW LEVEL SECURITY/.test(sql)) f.push("R1: catalogs.override_reasons is not FORCE RLS");
  if (!/CREATE TRIGGER trg_audit_override_reasons[\s\S]*?audit\.tg_audit_row\(\)/.test(sql)) f.push("R1: catalogs.override_reasons is not audited");
  if (/CREATE POLICY \w+ ON catalogs\.override_reasons\s+FOR DELETE/.test(sql)) f.push("R1: a DELETE policy exists (void-not-delete)");
  if (!/contexts <@ ARRAY\['factoring','expense','load_wizard','settlement','banking','invoice','bill','dispatch','safety','maintenance'\]::text\[\]/.test(sql)) f.push("R2: contexts are not limited to the owner's 10 contexts");
  if (/\('other'/.test(sql) || /requires_note/.test(sql)) f.push("R3: a free-text reason ('other' / requires_note) is in the override catalog");
  if (!/\('owner_override',[\s\S]{0,260}?true, 1\)/.test(sql) || !/\('accountant_override',[\s\S]{0,260}?true, 2\)/.test(sql)) f.push("R4: role_only owner_override / accountant_override rows not seeded");
  return f;
}

const sql = fs.readFileSync(path.join(ROOT, MIG), "utf8");
const src1b = {
  routes: fs.readFileSync(path.join(ROOT, ROUTES), "utf8"),
  manifest: fs.readFileSync(path.join(ROOT, MANIFEST), "utf8"),
  map: fs.readFileSync(path.join(ROOT, MAP), "utf8"),
};
if (process.argv.includes("--selftest")) {
  const plant = (a, b) => (sql.includes(a) ? audit(sql.replace(a, b)).length > 0 : null);
  const cases = [
    ["clean migration passes", audit(sql).length === 0],
    ["no FORCE RLS FAILS", plant("ALTER TABLE catalogs.override_reasons FORCE ROW LEVEL SECURITY;", "")],
    ["unaudited FAILS", plant("CREATE TRIGGER trg_audit_override_reasons", "CREATE TRIGGER trg_x")],
    ["open contexts FAIL", plant("AND contexts <@ ARRAY[", "AND contexts && ARRAY[")],
    ["a free-text 'other' FAILS", plant("('customer_change',", "('other', 'Other', 'Otro', ARRAY['dispatch'], false, 90),\n    ('customer_change',")],
    ["no owner_override row FAILS", plant("('owner_override',", "('owner_x',")],
    ["dropdown offering role_only rows FAILS", auditStep1b({ ...src1b, routes: src1b.routes.replace('where.push(`role_only = false`)', "void 0") }).length > 0],
    ["editable role_only code FAILS", auditStep1b({ ...src1b, routes: src1b.routes.replace('oldRow.role_only && ("reason_code" in b || "contexts" in b)', "false") }).length > 0],
    ["deactivatable role_only row FAILS", auditStep1b({ ...src1b, routes: src1b.routes.replace("WHERE id = $1 AND role_only = false RETURNING", "WHERE id = $1 RETURNING") }).length > 0],
    ["unmounted Lists screen FAILS", auditStep1b({ ...src1b, manifest: src1b.manifest.replace('path="/lists/accounting/override-reasons"', 'path="/x"') }).length > 0],
  ];
  let bad = 0;
  for (const [n, ok] of cases) { console.log(`  ${ok ? "✓" : "✗"} ${n}${ok === null ? " (plant anchor missing)" : ""}`); if (!ok) bad += 1; }
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}
const failures = [...audit(sql), ...auditStep1b(src1b)];
if (failures.length) { console.error(`${LABEL}: FAIL — ${failures.length}`); for (const x of failures) console.error(`  ✗ ${x}`); process.exit(1); }
console.log(`${LABEL}: OK — one company-scoped, FORCE-RLS, audited override catalog with no free-text reason; Lists screen + context-filtered reason list`);
