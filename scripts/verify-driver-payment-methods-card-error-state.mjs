#!/usr/bin/env node
/**
 * GUARD: DRV-MONEY-F6106 — DriverPaymentMethodsCard.tsx must render a real error state when its
 * payment-methods GET fails, never let a failed fetch masquerade as "No payment methods on file."
 *
 * ROOT CAUSE this freezes shut: `const methods = methodsQuery.data?.payment_methods ?? [];` fed
 * ParityTable unconditionally, with `loading={methodsQuery.isLoading}` but no reference anywhere
 * to `methodsQuery.isError`. A failed GET (network blip, backend 500, RLS denial) rendered
 * identically to a driver who genuinely has no payment method on file — on a money-bearing
 * surface, where an Owner/Administrator could act on that false assumption, while the "+ Create
 * method" action stayed visible with no indication anything was broken.
 *
 * Static-only (text-pattern) check against the real component file: ListErrorState must be
 * imported, methodsQuery.isError must gate a real error render, and the ParityTable itself must
 * be gated so it cannot render alongside/instead of the error (a false-empty state disguised
 * behind a real error banner is still a false-empty state).
 *
 * Run:  node scripts/verify-driver-payment-methods-card-error-state.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE_PATH = path.join(root, "apps/frontend/src/components/driver-profile/DriverPaymentMethodsCard.tsx");
const LABEL = "verify-driver-payment-methods-card-error-state";

export function checkErrorState(src) {
  const problems = [];
  if (!/import\s*\{\s*ListErrorState\s*\}\s*from\s*["']\.\.\/ListErrorState["']/.test(src)) {
    problems.push("ListErrorState is no longer imported from ../ListErrorState");
  }
  if (!/methodsQuery\.isError/.test(src)) {
    problems.push("methodsQuery.isError is never referenced — a failed GET cannot be distinguished from a real empty list");
  }
  if (!/methodsQuery\.isError[\s\S]{0,80}\?\s*\(?\s*<ListErrorState/.test(src)) {
    problems.push("methodsQuery.isError does not gate a <ListErrorState /> render");
  }
  // The ParityTable must be the ELSE arm of the SAME ternary as the ListErrorState check — a
  // `) : (` immediately between them proves it's one ternary, not two independently-rendered
  // elements that could both show at once (the exact shape of the partial-regression selftest
  // case below: isError renders ListErrorState via its own `? ... : null`, then ParityTable
  // renders completely unconditionally as a SEPARATE sibling element).
  if (!/methodsQuery\.isError\s*\?\s*\([\s\S]{0,300}<ListErrorState[\s\S]{0,300}\)\s*:\s*\([\s\S]{0,300}<ParityTable/.test(src)) {
    problems.push("ParityTable is not the else-arm of the same methodsQuery.isError ternary as ListErrorState — it could still render a false-empty list alongside/instead of the error");
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];

  const bad = `
    const methods = methodsQuery.data?.payment_methods ?? [];
    return (
      <ParityTable columns={columns} rows={methods} loading={methodsQuery.isLoading} emptyText="No payment methods on file." />
    );
  `;
  if (checkErrorState(bad).length !== 4) {
    failures.push(`the real pre-fix defect verbatim expected 4 problems, got ${checkErrorState(bad).length}`);
  }

  const good = fs.readFileSync(FILE_PATH, "utf8");
  const goodProblems = checkErrorState(good);
  if (goodProblems.length !== 0) {
    failures.push(`the real fixed file was flagged: ${goodProblems.join("; ")}`);
  }

  // Partial regression: isError referenced and ListErrorState rendered, but ParityTable ALSO
  // renders unconditionally right after (a common copy-paste mistake — showing both).
  const partial = `
    import { ListErrorState } from "../ListErrorState";
    return (
      <div>
        {methodsQuery.isError ? <ListErrorState title="x" status={0} onRetry={() => {}} /> : null}
        <ParityTable columns={columns} rows={methods} loading={methodsQuery.isLoading} emptyText="No payment methods on file." />
      </div>
    );
  `;
  if (checkErrorState(partial).length !== 1) {
    failures.push("a partial regression (error shown AND table still renders unconditionally) was not caught");
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — the real pre-fix defect caught (4/4), the real fixed file clears, a ` +
      `partial "error shown but table still renders" regression caught.`
  );
  process.exit(0);
}

const src = fs.readFileSync(FILE_PATH, "utf8");
const problems = checkErrorState(src);
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} problem(s):`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(`${LABEL} OK — DriverPaymentMethodsCard.tsx renders a real error state on a failed GET, never a false-empty list.`);
