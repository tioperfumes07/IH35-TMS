#!/usr/bin/env node
/**
 * liability COLUMN-WAVE — VERTICAL-WIRING-LAW-2026-08-12.
 *
 * @matrix-built {"modules":["drivers"],"cols":["liability"],"task":"WAVE-C-liability-driver-cash-advance","vertical":"column-wave","leafRe":"^cash_advances$"}
 * @matrix-built {"modules":["safety"],"cols":["liability"],"task":"WAVE-C-liability-safety-origins","vertical":"column-wave","leafRe":"^(accidents\\.create|internal_fines\\.create|escrow_record\\.list|safety\\.drawer\\.fine_detail)$"}
 *
 * Root cause (cross-cutting, blocked EVERY leaf in EVERY module): views.liabilities_active_with_context
 * dropped origin/origin_id/reference_doc_id/status from its SELECT list even though the base table
 * always had them — fixed in db/migrations/202608120900_liabilities_view_reverse_link_columns.sql.
 * liabilities.routes.ts already `SELECT *`s from the view, so no route change was needed once the view
 * carried the columns.
 *
 * Per-leaf result (audited every priority-10 module before touching anything):
 *   - lists, accounting, dispatch, factoring, customers, vendors: N/A — none creates a
 *     driver_finance.driver_liabilities row (accounting only READS an existing one to resolve a GL
 *     role; factoring's "liability_cents" is a distinct FARO recourse/chargeback GL concept with no
 *     driver_liabilities row at all).
 *   - drivers (cash-advance-create.ts): forward already wired; reverse was blocked by the view AND by
 *     the INSERT never setting origin/origin_id — both fixed in this commit (view migration above +
 *     a one-time UPDATE right after the advance row's id exists, same commit).
 *   - safety civil fine (fines.routes.ts) + internal fine (safety-v5.routes.ts): forward already
 *     wired, reverse was blocked only by the view — fixed by the view migration alone.
 *   - safety accident (safety.routes.ts spawn-liability): forward was GAP-FRONTEND (result only
 *     toasted, never persisted/re-read) — fixed via a reverse-JOIN in the accident detail GET
 *     (same discipline as its existing spawned_work_orders reload) + a render in
 *     AccidentReportDrawer.tsx.
 *   - safety escrow-forfeit (settle-against, not create): GAP was pure render — linked_liability_id
 *     already flowed end-to-end from escrow-forfeit.service.ts through timelineToAttempts; only
 *     EscrowRecordTab.tsx's render was missing. Fixed.
 *   - settlements (deduction → liability, forward) and banking (driver-advance liability_id
 *     persistence, reverse) are REAL, CONFIRMED gaps that are NOT fixed here — both need a genuine new
 *     schema column (no liability_id FK exists anywhere in the settlement-lines chain; no
 *     categorization_liability_id column exists for banking), not just a reverse-JOIN. Deliberately
 *     left out of this guard's Built claim rather than force a fabricated linkage or silently claim
 *     Built on unshipped work — tracked as REMAINING in the shipping commit, not deferred silently.
 *
 * Self-test: node scripts/verify-liability-column-wave.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-liability-column-wave";

const CHECKS = [
  {
    name: "view carries reverse-link columns",
    file: "db/migrations/202608120900_liabilities_view_reverse_link_columns.sql",
    pattern: /l\.origin,\s*\n\s*l\.origin_id,\s*\n\s*l\.reference_doc_id,\s*\n\s*l\.status/,
  },
  {
    name: "drivers: cash-advance backfills origin/origin_id",
    file: "apps/backend/src/cash-advances/cash-advance-create.ts",
    pattern: /UPDATE driver_finance\.driver_liabilities SET origin = 'cash_advance', origin_id = \$1/,
  },
  {
    name: "frontend: LiabilityDetailDrawer renders the reverse drill-through",
    file: "apps/frontend/src/pages/liabilities/components/LiabilityDetailDrawer.tsx",
    pattern: /ORIGIN_TO_ENTITY_KIND/,
  },
  {
    name: "frontend: EntityLink knows the internal_fine kind",
    file: "apps/frontend/src/components/shared/EntityLink.tsx",
    pattern: /"internal_fine"/,
  },
  {
    name: "safety: accident detail reverse-JOINs the spawned liability",
    file: "apps/backend/src/safety/safety.routes.ts",
    pattern: /spawned_liability_id: spawnedLiabilityId/,
  },
  {
    name: "frontend: AccidentReportDrawer renders the spawned liability",
    file: "apps/frontend/src/components/safety/AccidentReportDrawer.tsx",
    pattern: /accident-spawned-liability/,
  },
  {
    name: "frontend: EscrowRecordTab renders the forfeited-against liability",
    file: "apps/frontend/src/pages/safety/tabs/EscrowRecordTab.tsx",
    pattern: /entry\.linked_liability_id \?/,
  },
];

export function checkAll(readFile) {
  const failures = [];
  for (const c of CHECKS) {
    const src = readFile(c.file);
    if (src === null) {
      failures.push(`${c.name}: ${c.file} not found`);
      continue;
    }
    if (!c.pattern.test(src)) {
      failures.push(`${c.name}: ${c.file} no longer matches expected shape`);
    }
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  // Hand-written literal fixtures, one per check, each matching its own pattern exactly — safer than
  // trying to auto-derive a string from the regex source (backreferences like \$1 don't round-trip).
  const GOOD_FIXTURES = {
    "db/migrations/202608120900_liabilities_view_reverse_link_columns.sql":
      "SELECT\n      l.origin,\n      l.origin_id,\n      l.reference_doc_id,\n      l.status,\n",
    "apps/backend/src/cash-advances/cash-advance-create.ts":
      "UPDATE driver_finance.driver_liabilities SET origin = 'cash_advance', origin_id = $1 WHERE id = $2",
    "apps/frontend/src/pages/liabilities/components/LiabilityDetailDrawer.tsx": "const ORIGIN_TO_ENTITY_KIND = {}",
    "apps/frontend/src/components/shared/EntityLink.tsx": '| "internal_fine"',
    "apps/backend/src/safety/safety.routes.ts": "return { ...accident, spawned_liability_id: spawnedLiabilityId };",
    "apps/frontend/src/components/safety/AccidentReportDrawer.tsx": 'data-testid="accident-spawned-liability"',
    "apps/frontend/src/pages/safety/tabs/EscrowRecordTab.tsx": "{entry.linked_liability_id ? (",
  };
  const goodFailures = checkAll((f) => GOOD_FIXTURES[f] ?? null);
  if (goodFailures.length) {
    console.error(`[${LABEL}] selftest FAIL: known-good fixture should pass — ${goodFailures.join("; ")}`);
    process.exit(1);
  }
  const regressedFailures = checkAll(() => "nothing matches here");
  if (regressedFailures.length !== CHECKS.length) {
    console.error(`[${LABEL}] selftest FAIL: regressed fixture (all-empty) should fail every check`);
    process.exit(1);
  }
  console.log(`[${LABEL}] selftest: PASS — good/regressed fixtures classify correctly`);
  process.exit(0);
}

const failures = checkAll((rel) => {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
});

if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s) regressed:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — drivers + safety liability reverse-link (cross-cutting view fix + 4 leaf fixes) all present`);
