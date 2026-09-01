#!/usr/bin/env node
/**
 * FE-SORT-TOGGLE — ParityTable's sort cycle is a CONTRACT that report tests assert against.
 *
 * `ParityTable.toggleSort` sorts a NEWLY clicked column ASCENDING, and only flips to DESC when the
 * ALREADY-ACTIVE column is clicked again:
 *
 *     const nextDirection = sortKey === key && sortDirection === "asc" ? "desc" : "asc";
 *
 * Two reports tests silently rotted against this and were repaired together (FE-SUITE):
 *   - ProfitPerTruckPage  — clicked Miles TWICE (asc→desc) but asserted the ASC winner.
 *   - FuelReconciliationPage — clicked Unit # ONCE and asserted the DESC winner; because the fixture is
 *     already in ascending order that first click is a NO-OP on row order, so the test could never pass.
 *
 * Both read as data/fixture bugs ("Unable to find 102", "toHaveTextContent T-Hot") and neither names the
 * sort cycle, which is why they were expensive to diagnose. If someone flips the cycle to desc-first, the
 * repaired tests go red with those same misleading messages — this guard fails FIRST and says why.
 *
 * It also pins the ▲/▼ indicator, because that is the OTHER half of the same trap: ParityTable appends an
 * arrow to the ACTIVE column's label, so `getByText("Miles")` stops matching after the first click and the
 * tests must query the header by role with an anchored regex.
 *
 *   node scripts/verify-parity-table-sort-toggle-contract.mjs
 *   node scripts/verify-parity-table-sort-toggle-contract.mjs --selftest
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");
const LABEL = "verify-parity-table-sort-toggle-contract";
const TABLE = "apps/frontend/src/components/parity/ParityTable.tsx";

function assert(files) {
  const problems = [];
  const table = files[TABLE] ?? "";

  if (!/function toggleSort\s*\(/.test(table)) {
    problems.push(`${TABLE}: toggleSort( must exist — the sort cycle lives there`);
    return problems;
  }

  // Anchor on the ternary's SHAPE, not on whitespace: a new key (or a key already desc) => "asc";
  // only an active key that is currently "asc" => "desc". Written loosely enough to survive formatting
  // and a renamed local, strict enough that swapping the two branches fails.
  const ascFirst =
    /sortKey === key && sortDirection === "asc"\s*\?\s*"desc"\s*:\s*"asc"/.test(table);
  if (!ascFirst) {
    problems.push(
      `${TABLE}: toggleSort must sort a NEW column ASC and flip to DESC only on the active column ` +
        `(expected \`sortKey === key && sortDirection === "asc" ? "desc" : "asc"\`). ` +
        `Reports tests assert row order against this cycle — see FuelReconciliationPage / ProfitPerTruckPage.`,
    );
  }

  // The active-column arrow. Tests must query headers by role + anchored regex because of it.
  if (!/[▲▼]/.test(table)) {
    problems.push(
      `${TABLE}: the active sort column must still render a ▲/▼ indicator — tests query headers with ` +
        `anchored regexes (e.g. /^Miles/) precisely because the label is not exact text once active.`,
    );
  }

  // Cascade 2026-08-31 — full-cell hit target (DataTable already had w-full; ParityTable regressed).
  if (!/inline-flex w-full items-center gap-1/.test(table)) {
    problems.push(
      `${TABLE}: sortable header <button> must use inline-flex w-full (label-only hit target is a silent no-op)`,
    );
  }

  return problems;
}

const files = Object.fromEntries([TABLE].map((rel) => [rel, readFileSync(path.join(ROOT, rel), "utf8")]));

if (SELFTEST) {
  // Plant the exact regression this guard exists for: desc-first.
  const flipped = {
    ...files,
    [TABLE]: files[TABLE].replace(
      /sortKey === key && sortDirection === "asc"\s*\?\s*"desc"\s*:\s*"asc"/,
      'sortKey === key && sortDirection === "desc" ? "asc" : "desc"',
    ),
  };
  if (flipped[TABLE] === files[TABLE]) {
    console.error(`${LABEL} SELFTEST FAIL — could not plant the desc-first mutation (anchor drifted)`);
    process.exit(1);
  }
  const caught = assert(flipped);
  if (!caught.some((p) => /NEW column ASC/.test(p))) {
    console.error(`${LABEL} SELFTEST FAIL — planted desc-first cycle was not caught`);
    process.exit(1);
  }
  // And prove a stripped arrow is caught too.
  const noArrow = { ...files, [TABLE]: files[TABLE].replace(/[▲▼]/g, "") };
  if (!assert(noArrow).some((p) => /▲\/▼ indicator/.test(p))) {
    console.error(`${LABEL} SELFTEST FAIL — stripped sort indicator was not caught`);
    process.exit(1);
  }
  // Cascade DEFECT 1 — label-only hit target (no w-full).
  const noWfull = {
    ...files,
    [TABLE]: files[TABLE].replace(/inline-flex w-full items-center gap-1/g, "inline-flex items-center gap-1"),
  };
  if (noWfull[TABLE] === files[TABLE]) {
    console.error(`${LABEL} SELFTEST FAIL — could not plant missing w-full mutation`);
    process.exit(1);
  }
  if (!assert(noWfull).some((p) => /w-full/.test(p))) {
    console.error(`${LABEL} SELFTEST FAIL — planted label-only hit target was not caught`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — desc-first cycle caught, stripped ▲/▼ caught, missing w-full caught`);
  process.exit(0);
}

const problems = assert(files);
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(`${LABEL}: OK — new column sorts ASC, active column flips to DESC, ▲/▼ indicator intact`);
process.exit(0);
