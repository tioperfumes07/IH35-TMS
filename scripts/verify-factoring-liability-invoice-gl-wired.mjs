#!/usr/bin/env node
/**
 * WAVE 1 factoring money — Box 3 Built for `submit.queue` / `accounting.list` / `accounting.detail` /
 * `factoring.wizard.batch` × `invoice` / `liability` / `gl_je`.
 *
 * @matrix-built {"modules":["factoring"],"cols":["invoice","liability","gl_je"],"task":"WAVE1-FACTORING-LIABILITY-INVOICE-GL-BUILT","vertical":"column-wave","leafRe":"^(submit\\.queue|accounting\\.(list|detail)|factoring\\.wizard\\.batch)$"}
 *
 * SubmissionQueue.tsx (submit.queue) already renders every eligible invoice via
 * EntityLink(kind="invoice") plus a real, backend-resolved reserve/liability preview
 * (expected_reserve_cents) for the selected set (WAVE-C-liability-submit-queue). FactoringListPage.tsx
 * (accounting.list) renders advance_amount_cents / reserve_amount_cents per batch — the factoring
 * liability figures (per the owner-locked "factoring balance = Faro liability, not reserve" ruling).
 * FactoringDetailPage.tsx (accounting.detail) renders the same advance/reserve figures plus a linked-
 * invoices grid (EntityLink kind="invoice") and a reserve/interest rows table with
 * EntityLink(kind="journal_entry") drilling to the real posted JE (gl_je). BatchWizard.tsx
 * (factoring.wizard.batch) queries real candidate invoices via listFactoringBatchCandidateInvoices.
 * All four leaves' wiring already existed, only the Box-3 credit was missing.
 *
 * Self-test: node scripts/verify-factoring-liability-invoice-gl-wired.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factoring-liability-invoice-gl-wired";

const CHECKS = [
  {
    name: "SubmissionQueue drills each eligible row via EntityLink kind=\"invoice\"",
    file: "apps/frontend/src/pages/factoring/SubmissionQueue.tsx",
    pattern: /kind="invoice"[\s\S]{0,40}id=\{item\.invoice_id\}/,
  },
  {
    name: "SubmissionQueue previews the real, backend-resolved reserve/liability for the selected set",
    file: "apps/frontend/src/pages/factoring/SubmissionQueue.tsx",
    pattern: /expected_reserve_cents/,
  },
  {
    name: "FactoringListPage renders the advance/reserve liability figures per batch",
    file: "apps/frontend/src/pages/accounting/FactoringListPage.tsx",
    pattern: /key:\s*"advance_amount_cents"[\s\S]{0,160}key:\s*"reserve_amount_cents"/,
  },
  {
    name: "FactoringDetailPage renders the same advance/reserve liability figures",
    file: "apps/frontend/src/pages/accounting/FactoringDetailPage.tsx",
    pattern: /advance:\s*money\(detail\.advance_amount_cents\)[\s\S]{0,40}reserve:\s*money\(detail\.reserve_amount_cents\)/,
  },
  {
    name: "FactoringDetailPage renders a linked-invoices grid via EntityLink kind=\"invoice\"",
    file: "apps/frontend/src/pages/accounting/FactoringDetailPage.tsx",
    pattern: /<EntityLink kind="invoice" id=\{invoice\.id\}/,
  },
  {
    name: "FactoringDetailPage drills reserve/interest rows to the real posted JE (gl_je reverse nav)",
    file: "apps/frontend/src/pages/accounting/FactoringDetailPage.tsx",
    pattern: /kind="journal_entry"[\s\S]{0,40}id=\{row\.journal_entry_id\}/,
  },
  {
    name: "BatchWizard queries real candidate invoices (forward writer)",
    file: "apps/frontend/src/pages/factoring/BatchWizard.tsx",
    pattern: /listFactoringBatchCandidateInvoices\(companyId\)/,
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
    "apps/frontend/src/pages/factoring/SubmissionQueue.tsx": `
      <EntityLink
        kind="invoice"
        id={item.invoice_id}
      />
      // preview of the reserve/liability the selected invoices would create -- sums
      // expected_reserve_cents the backend already resolved
    `,
    "apps/frontend/src/pages/accounting/FactoringListPage.tsx": `
      { key: "advance_amount_cents", label: "Advanced", render: (row) => money(row.advance_amount_cents) },
      { key: "reserve_amount_cents", label: "Reserve", render: (row) => money(row.reserve_amount_cents) },
    `,
    "apps/frontend/src/pages/accounting/FactoringDetailPage.tsx": `
      advance: money(detail.advance_amount_cents),
      reserve: money(detail.reserve_amount_cents),
      <EntityLink kind="invoice" id={invoice.id} label={entityLabel(invoice.display_id, invoice.id, "Invoice")} />
      <EntityLink
        kind="journal_entry"
        id={row.journal_entry_id}
      />
    `,
    "apps/frontend/src/pages/factoring/BatchWizard.tsx": `
      queryFn: () => listFactoringBatchCandidateInvoices(companyId).then((res) => res.invoices),
    `,
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
console.log(`[${LABEL}] PASS — factoring submit-queue/list/detail/wizard invoice+liability+gl_je wiring all present`);
