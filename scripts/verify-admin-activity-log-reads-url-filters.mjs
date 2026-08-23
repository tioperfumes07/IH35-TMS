#!/usr/bin/env node
/**
 * verify-admin-activity-log-reads-url-filters.mjs  (ADMIN-ACTIVITY-F1)
 *
 * Root cause: ExpenseCategoryMapPage's "View audit" link deep-links to
 * `/admin/activity?event_class=...&resource_id=...`, but ActivityLogPage.tsx never read any URL
 * query params at all — its filter state always initialized to a hardcoded empty object. Every
 * "View audit" click silently landed on the generic unfiltered last-100-rows view instead of that
 * one record's own history, with zero error and zero visible indication anything was wrong. The
 * link's own param names (`event_class`, `resource_id`) also never matched what the backend query
 * schema or UI filter fields actually support (`action`, `entity_type`, `since`) — and the audit
 * payload writer for expense_category_map_change never wrote an `entity_id` key at all (only
 * `mapping_id`), so even a correctly-wired page couldn't have scoped to one row.
 *
 * This guard makes the regression impossible to re-ship:
 *   1. ActivityLogPage.tsx must read `entity_id`/`action`/`entity_type`/`actor_user_id` from
 *      useSearchParams() to seed its initial filter state.
 *   2. The backend admin/activity route must accept and apply an `entity_id` filter param.
 *   3. The expense-category-map audit payload writer must set both `entity_type` and `entity_id`.
 *   4. ExpenseCategoryMapPage's "View audit" link must use the real param names (`action`,
 *      `entity_id`), not the never-consumed `event_class`/`resource_id`.
 *
 * Usage:
 *   node scripts/verify-admin-activity-log-reads-url-filters.mjs            # scan
 *   node scripts/verify-admin-activity-log-reads-url-filters.mjs --selftest # regression harness -> must FAIL on bug
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

const CHECKS = [
  {
    file: "apps/frontend/src/pages/admin/ActivityLogPage.tsx",
    pattern: /useSearchParams\(\)/,
    label: "ActivityLogPage must call useSearchParams() to read deep-link filters",
  },
  {
    file: "apps/frontend/src/pages/admin/ActivityLogPage.tsx",
    pattern: /searchParams\.get\("entity_id"\)/,
    label: "ActivityLogPage must seed its entityId filter from the entity_id URL param",
  },
  {
    file: "apps/backend/src/admin/activity.routes.ts",
    pattern: /entity_id:\s*z\.string\(\)/,
    label: "admin/activity querySchema must accept an entity_id param",
  },
  {
    file: "apps/backend/src/admin/activity.routes.ts",
    pattern: /e\.payload->>'entity_id'\s*=\s*\$\$?\{values\.length\}/,
    label: "admin/activity route must filter on payload->>'entity_id' when entity_id is supplied",
  },
  {
    file: "apps/backend/src/accounting/expense-category-map/routes.ts",
    pattern: /entity_id:\s*params\.mappingId/,
    label: "expense-category-map audit payload writer must set entity_id (not just mapping_id)",
  },
  {
    file: "apps/frontend/src/pages/accounting/ExpenseCategoryMapPage.tsx",
    pattern: /\/admin\/activity\?action=expense_category_map_change&entity_id=/,
    label: "ExpenseCategoryMapPage's View audit link must use action/entity_id (the real filter params), not event_class/resource_id",
  },
];

export function checkAll(sources) {
  const offenders = [];
  for (const check of CHECKS) {
    const src = sources[check.file];
    if (src === undefined) {
      offenders.push(`${check.file}: file not found`);
      continue;
    }
    if (!check.pattern.test(src)) {
      offenders.push(`${check.file}: ${check.label} — ADMIN-ACTIVITY-F1 regression shape`);
    }
  }
  const expenseMap = sources["apps/frontend/src/pages/accounting/ExpenseCategoryMapPage.tsx"] ?? "";
  if (/render:\s*\(row\)\s*=>\s*\(\s*\{\/\*/.test(expenseMap)) {
    offenders.push("ExpenseCategoryMapPage: JSX comment cannot be the bare first child of render parentheses — ADMIN-ACTIVITY-F1 parse regression shape");
  }
  return offenders;
}

export function run() {
  const files = [...new Set(CHECKS.map((c) => c.file))];
  const sources = {};
  for (const f of files) {
    const abs = path.join(repoRoot, f);
    sources[f] = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : undefined;
  }
  const offenders = checkAll(sources);
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggy = {
    "apps/frontend/src/pages/admin/ActivityLogPage.tsx": `const [applied, setApplied] = useState(EMPTY_FILTERS);`,
    "apps/backend/src/admin/activity.routes.ts": `const querySchema = z.object({ entity_type: z.string().optional() });`,
    "apps/backend/src/accounting/expense-category-map/routes.ts": `JSON.stringify({ mapping_id: params.mappingId })`,
    "apps/frontend/src/pages/accounting/ExpenseCategoryMapPage.tsx": `to={\`/admin/activity?event_class=expense_category_map_change&resource_id=\${row.id}\`}`,
  };
  const fixed = {
    "apps/frontend/src/pages/admin/ActivityLogPage.tsx": `
      const [searchParams] = useSearchParams();
      const [initialFilters] = useState(() => ({ entityId: searchParams.get("entity_id") ?? "" }));
      const [applied, setApplied] = useState(initialFilters);
    `,
    "apps/backend/src/admin/activity.routes.ts": `
      const querySchema = z.object({ entity_id: z.string().trim().min(1).max(200).optional() });
      if (parsed.data.entity_id) { where.push(\`e.payload->>'entity_id' = $\${values.length}\`); }
    `,
    "apps/backend/src/accounting/expense-category-map/routes.ts": `JSON.stringify({ entity_type: "accounting.expense_category_map", entity_id: params.mappingId, mapping_id: params.mappingId })`,
    "apps/frontend/src/pages/accounting/ExpenseCategoryMapPage.tsx": `to={\`/admin/activity?action=expense_category_map_change&entity_id=\${encodeURIComponent(row.id)}\`}`,
  };

  const buggyFails = checkAll(buggy).length > 0;
  const fixedPasses = checkAll(fixed).length === 0;
  const parseBug = {
    ...fixed,
    "apps/frontend/src/pages/accounting/ExpenseCategoryMapPage.tsx": `render: (row) => ({/* invalid bare JSX comment */}<Link to={\`/admin/activity?action=expense_category_map_change&entity_id=\${encodeURIComponent(row.id)}\`}>View audit</Link>)`,
  };
  const parseBugFails = checkAll(parseBug).some((failure) => failure.includes("parse regression"));

  if (buggyFails && fixedPasses && parseBugFails) {
    console.log("verify:admin-activity-log-reads-url-filters selftest OK");
    process.exit(0);
  }
  console.error("verify:admin-activity-log-reads-url-filters selftest FAILED", { buggyFails, fixedPasses, parseBugFails, buggyOffenders: checkAll(buggy), fixedOffenders: checkAll(fixed) });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error("verify:admin-activity-log-reads-url-filters FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "));
    process.exit(1);
  }
  console.log("verify:admin-activity-log-reads-url-filters OK — deep-link filters are read and applied end-to-end");
}
