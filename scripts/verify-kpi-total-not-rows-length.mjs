#!/usr/bin/env node
/**
 * 443.218 F-KPI — every list/KPI total exposed to the frontend must come from COUNT(*) OVER ()
 * or a separate COUNT query, never from rows.length (which equals the page size when LIMIT is
 * applied). rows.length is accurate only when the full result fits in one page; a badge showing
 * "91 settlements" that actually means "I returned 200 rows and counted them" is misleading and
 * breaks once data grows past the cap.
 *
 * WHAT TO FIX: replace `total: rows.length` (or `total: result.rows.length`) with a real aggregate.
 * The standard pattern is `COUNT(*) OVER () AS total_count` in the SELECT, then
 * `Number(rows[0]?.total_count ?? 0)` at the call site. For capped-all queries (LIMIT 500 with
 * no OFFSET) this is also correct: COUNT(*) OVER () sees ALL rows before LIMIT.
 *
 * ALLOWLIST: non-KPI internal paths where rows.length is the intentional value (no pagination,
 * no badge, not a user-facing total). These must be short and explained.
 */

import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-kpi-total-not-rows-length";

// Files where `total: rows.length` / `total_count: rows.length` is intentional:
// - compliance-aggregate.service.ts: summary object, not a paginated list badge
// - inbox-reporting.service.ts: internal telemetry count, not a KPI badge
// - samsara-hire-date.service.ts: internal integration sync, not a KPI badge
// - samsara-config.routes.ts: config probe, not a KPI badge
// - mdata/drivers-import.routes.ts: import batch count, not a KPI badge
// - mdata/canonical/driver-hub.service.ts: hub summary aggregated from the full driver set
// - program/audit-scoreboard.routes.ts: scoreboard rows — no LIMIT applies
// - program/program-tracker.service.ts: tracker batch — no LIMIT applies
// - maintenance/reports.routes.ts: maintenance report — full result, no LIMIT
// - maintenance/unit-maintenance-history.routes.ts: full unit history, no LIMIT
// - banking/categorization.routes.ts: full categorization result, no user-facing badge
// - reports/exception-queue.routes.ts: exception queue full result, no separate total badge
const ALLOWLIST = new Set([
  "apps/backend/src/compliance/compliance-aggregate.service.ts",
  "apps/backend/src/driver-finance/inbox-reporting.service.ts",
  "apps/backend/src/integrations/samsara/samsara-hire-date.service.ts",
  "apps/backend/src/integrations/samsara/samsara-config.routes.ts",
  "apps/backend/src/mdata/drivers-import.routes.ts",
  "apps/backend/src/mdata/canonical/driver-hub.service.ts",
  "apps/backend/src/program/audit-scoreboard.routes.ts",
  "apps/backend/src/program/program-tracker.service.ts",
  "apps/backend/src/maintenance/reports.routes.ts",
  "apps/backend/src/maintenance/unit-maintenance-history.routes.ts",
  "apps/backend/src/banking/categorization.routes.ts",
  "apps/backend/src/reports/exception-queue.routes.ts",
]);

function isKpiRowsLengthViolation(line) {
  const [filePath] = line.split(":");
  const rel = filePath?.replace(/^\//, "") ?? "";
  if (ALLOWLIST.has(rel)) return false;
  if (rel.includes("__tests__") || rel.endsWith(".d.ts") || rel.includes(".test.") || rel.includes(".spec.")) {
    return false;
  }
  return true;
}

if (process.argv.includes("--selftest")) {
  const cases = [
    ["allowlisted path skipped", "apps/backend/src/compliance/compliance-aggregate.service.ts:9: total: rows.length", false],
    ["non-allowlisted path flagged", "apps/backend/src/foo/list.routes.ts:12: total: rows.length", true],
  ];
  let bad = 0;
  for (const [label, sample, expectViol] of cases) {
    const got = isKpiRowsLengthViolation(sample);
    const ok = got === expectViol;
    console.log(`  ${ok ? "✓" : "✗"} ${label}`);
    if (!ok) bad += 1;
  }
  if (bad) {
    console.error(`${LABEL} --selftest FAIL`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(0);
}

let output;
try {
  output = execSync(
    `grep -rn "total:\\s*rows\\.length\\|total_count:\\s*rows\\.length\\|total:\\s*result\\.rows\\.length" apps/backend/src --include="*.ts"`,
    { cwd: ROOT, encoding: "utf8" }
  );
} catch {
  // grep exits non-zero when no matches — that is the PASS case.
  output = "";
}

const violations = output.split("\n").filter(Boolean).filter(isKpiRowsLengthViolation);

if (violations.length === 0) {
  console.log(`[${LABEL}] PASS — no KPI routes use rows.length as the list total`);
  process.exit(0);
} else {
  console.error(`[${LABEL}] FAIL — ${violations.length} route(s) expose rows.length as a KPI total (use COUNT(*) OVER () instead):`);
  for (const v of violations) console.error(` - ${v}`);
  console.error(`\nFix: add COUNT(*) OVER () AS total_count to the SELECT and use Number(rows[0]?.total_count ?? 0) as the total.`);
  process.exit(1);
}
