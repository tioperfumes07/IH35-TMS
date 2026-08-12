#!/usr/bin/env node
/**
 * WAVE-C-liability-factoring-leaves — factoring module "Liability / Reserve" column,
 * VERTICAL-WIRING-LAW-2026-08-12, remaining leaves after WAVE-C-liability-reserve-surfaces
 * (home.reserve_tracker/reserves.dashboard) and WAVE-C-liability-factoring (factors.admin/
 * home.equipment_loans).
 *
 * Ten leaves were open. Three (home.recourse_pipeline, dispatch.queue, banking.entry) stay
 * OPEN — they are documented HELD-FOR-JORGE phantom-view leaves (views.factoring_summary /
 * views.factoring_balance_invoice_linkage rebuild, migrations 202607600000 + 202609100100,
 * TIER 1 FINANCIAL, "Owner applies on Neon" — see db/migrations/.held-migrations.json). Never
 * force those; this guard does not tag them and never will until the owner applies the held
 * migration. Per INBOX-CC-1 law: "held phantom-view leaf — KEEP required, document, move on."
 *
 * The other seven are wired here, all reusing REAL, already-live sources — no new GL math, no
 * new reserve invention, no migration:
 *   - accounting.list (FactoringListPage): already renders the real, stored
 *     accounting.factoring_advances.reserve_amount_cents per row.
 *   - accounting.detail (FactoringDetailPage -> FactorReserveCard): already reads
 *     views.factoring_reserve_balances (migration 202607130000 — HELD tag but
 *     applied_on_prod:true, live-verified 2026-07-25).
 *   - accounting.factor_recon (FactorReconciliationPage): already renders real reserve figures
 *     from Faro statement imports + reconciliation runs.
 *   - submit.queue (SubmissionQueue.tsx / submission-queue.service.ts): NEW — resolves each
 *     invoice's effective-dated factor via getFactorForCustomer (the same lookup
 *     batch.service.ts:createDraftBatch already uses) and previews expected_reserve_cents =
 *     total_cents * reserve_rate. Preview only; nothing posted.
 *   - batches.create (BatchWizard.tsx): NEW — Expected Reserve = Face - Advance - Fee, the
 *     locked Faro formula (ih35-accounting-decisions §3, "Purchase Price = Net - Fee -
 *     Reserve"), derived from the already-real, already-stored draft batch totals.
 *   - batches.detail (BatchDetail.tsx): NEW — same derivation in the header summary, alongside
 *     the pre-existing real per-movement Reserve Movements ledger table.
 *   - accounting.submit (SubmitFactoringModal.tsx): NEW — expected reserve preview from the
 *     modal's own reservePct field (the same value already sent in the submit payload).
 *
 * @matrix-built {"modules":["factoring"],"cols":["liability"],"leafRe":"^(submit\\.queue|batches\\.create|batches\\.detail|accounting\\.list|accounting\\.submit|accounting\\.detail|accounting\\.factor_recon)$","task":"WAVE-C-liability-factoring-leaves","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-wave-c-liability-factoring-leaves.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wave-c-liability-factoring-leaves";

const CHECKS = [
  {
    name: "submit.queue: submission-queue.service.ts resolves expected_reserve_cents via getFactorForCustomer",
    file: "apps/backend/src/factoring/submission-queue.service.ts",
    pattern: /expected_reserve_cents:\s*reserveRate\s*!=\s*null\s*\?\s*Math\.round\(totalCents\s*\*\s*reserveRate\)/,
  },
  {
    name: "submit.queue: SubmissionQueue.tsx renders Expected Reserve",
    file: "apps/frontend/src/pages/factoring/SubmissionQueue.tsx",
    pattern: /expected_reserve_cents/,
  },
  {
    name: "batches.create: BatchWizard.tsx renders Expected Reserve (Face - Advance - Fee)",
    file: "apps/frontend/src/pages/factoring/BatchWizard.tsx",
    pattern: /factoring-batch-expected-reserve/,
  },
  {
    name: "batches.detail: BatchDetail.tsx renders Reserve in header summary",
    file: "apps/frontend/src/pages/factoring/BatchDetail.tsx",
    pattern: /factoring-batch-detail-expected-reserve/,
  },
  {
    name: "accounting.submit: SubmitFactoringModal.tsx renders expected reserve preview",
    file: "apps/frontend/src/pages/accounting/SubmitFactoringModal.tsx",
    pattern: /selectedExpectedReserve/,
  },
  {
    name: "accounting.list: FactoringListPage.tsx renders reserve_amount_cents",
    file: "apps/frontend/src/pages/accounting/FactoringListPage.tsx",
    pattern: /reserve_amount_cents/,
  },
  {
    name: "accounting.detail: FactoringDetailPage.tsx mounts FactorReserveCard",
    file: "apps/frontend/src/pages/accounting/FactoringDetailPage.tsx",
    pattern: /FactorReserveCard/,
  },
  {
    name: "accounting.factor_recon: FactorReconciliationPage.tsx renders reserve figures",
    file: "apps/frontend/src/pages/accounting/FactorReconciliationPage.tsx",
    pattern: /reserve_total_cents|total_reserves_released_cents/,
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
  const GOOD_FIXTURES = {
    "apps/backend/src/factoring/submission-queue.service.ts":
      "expected_reserve_cents: reserveRate != null ? Math.round(totalCents * reserveRate) : null,",
    "apps/frontend/src/pages/factoring/SubmissionQueue.tsx": "item.expected_reserve_cents",
    "apps/frontend/src/pages/factoring/BatchWizard.tsx": 'data-testid="factoring-batch-expected-reserve"',
    "apps/frontend/src/pages/factoring/BatchDetail.tsx": 'data-testid="factoring-batch-detail-expected-reserve"',
    "apps/frontend/src/pages/accounting/SubmitFactoringModal.tsx": "selectedExpectedReserve",
    "apps/frontend/src/pages/accounting/FactoringListPage.tsx": "row.reserve_amount_cents",
    "apps/frontend/src/pages/accounting/FactoringDetailPage.tsx": "<FactorReserveCard",
    "apps/frontend/src/pages/accounting/FactorReconciliationPage.tsx": "candidate.reserve_total_cents",
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
console.log(
  `[${LABEL}] PASS — submit.queue + batches.create + batches.detail + accounting.list/submit/detail/factor_recon liability/reserve wiring present`,
);
