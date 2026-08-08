#!/usr/bin/env node
/**
 * LV-INVOICE-RATE-SNAPSHOT-NEVER-RESYNCS (create side) — never mint an invoice from a $0-rate load.
 *
 * An invoice built from a load snapshots the rate ONCE, at build time:
 *   apps/backend/src/accounting/from-load.ts:186  `const lineTotal = Number(load.rate_total_cents ?? 0);`
 * and NOTHING re-syncs it afterwards. `dispatch/update-load.service.ts` computes a `rateChanged` flag and
 * spends it on an audit field only; a grep for resync/refreshInvoiceFromLoad/syncInvoiceFromLoad across
 * apps/backend/src returns no non-test hits. So an invoice created while the load's rate is still 0 is
 * permanently $0 — which is exactly L-0087 ($3,210 load, $0 invoice).
 *
 * The Create/View Invoice button in the load drawer gated on STATUS ONLY
 * (`canInvoiceFromLoad = ["delivered","invoiced","paid","closed"].includes(load.status)`), so a delivered
 * load with no rate could mint one with a single click.
 *
 * This guard pins the CREATE-side gate. It deliberately does NOT require the button to be disabled: the
 * control is "Create / View", and blocking it outright would also block VIEWING an existing (already
 * broken) invoice. The gate must therefore be conditional on no invoice existing yet.
 *
 * Fixing the already-stale invoices is a separate, money-lane change (it writes accounting.invoices
 * amounts and must be scoped to non-posting statuses) — not covered here.
 *
 *   node scripts/verify-no-zero-rate-invoice-create.mjs
 *   node scripts/verify-no-zero-rate-invoice-create.mjs --selftest
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");
const LABEL = "verify-no-zero-rate-invoice-create";
const DRAWER = "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx";

function assert(files) {
  const problems = [];
  const drawer = files[DRAWER] ?? "";

  // The click handler must bail before calling the create mutation when the rate is falsy.
  const handler = /createInvoiceMutation\.mutateAsync/.test(drawer);
  if (!handler) {
    problems.push(`${DRAWER}: could not find createInvoiceMutation.mutateAsync — anchor drifted`);
    return problems;
  }

  const gate = /Number\(load\.rate_total_cents \?\? 0\)/.test(drawer);
  if (!gate) {
    problems.push(
      `${DRAWER}: the Create/View Invoice handler must check load.rate_total_cents before creating. ` +
        `from-load.ts snapshots the rate once and nothing re-syncs it, so a $0-rate load mints a ` +
        `permanently $0 invoice (L-0087).`,
    );
  }

  // The bail must happen BEFORE the mutation call, not after it.
  const gateIdx = drawer.indexOf("Number(load.rate_total_cents ?? 0)");
  const callIdx = drawer.indexOf("createInvoiceMutation.mutateAsync");
  if (gate && gateIdx > callIdx) {
    problems.push(`${DRAWER}: the rate check must run BEFORE createInvoiceMutation.mutateAsync, not after`);
  }

  // ...and it must be conditional on there being no invoice yet, so "View" still works.
  if (gate && !/existingInvoiceId/.test(drawer)) {
    problems.push(
      `${DRAWER}: the rate gate must be conditional on no existing invoice — this is a "Create / View" ` +
        `control, and an unconditional block would also stop users VIEWING an already-created invoice.`,
    );
  }

  return problems;
}

const files = Object.fromEntries([DRAWER].map((rel) => [rel, readFileSync(path.join(ROOT, rel), "utf8")]));

if (SELFTEST) {
  const checks = [];

  // 1. The original defect: no rate check at all.
  const noGate = { ...files, [DRAWER]: files[DRAWER].replace(/Number\(load\.rate_total_cents \?\? 0\)/g, "0") };
  checks.push(["rate gate removed", assert(noGate).some((p) => /must check load\.rate_total_cents/.test(p))]);

  // 2. Gate present but unconditional — would break View.
  const unconditional = { ...files, [DRAWER]: files[DRAWER].replace(/existingInvoiceId/g, "unrelatedFlag") };
  checks.push(["unconditional block", assert(unconditional).some((p) => /would also stop users VIEWING/.test(p))]);

  const failed = checks.filter(([, caught]) => !caught).map(([n]) => n);
  if (failed.length) {
    console.error(`${LABEL} SELFTEST FAIL — not caught: ${failed.join(", ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${checks.length}/${checks.length} planted regressions caught`);
  process.exit(0);
}

const problems = assert(files);
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(`${LABEL}: OK — a $0-rate load cannot mint an invoice; viewing an existing one still works`);
process.exit(0);
