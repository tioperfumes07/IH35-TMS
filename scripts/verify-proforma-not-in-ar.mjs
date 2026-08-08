#!/usr/bin/env node
/**
 * GUARD: an A/R surface must not count PROFORMA invoices. ACCT-F223.
 *
 * A proforma invoice posts NO journal entry. It is a projection minted at Book time from the load's
 * rate — verified on prod, where every proforma has ZERO rows in accounting.journal_entry_postings.
 *
 * WHAT COUNTING THEM COST. A/R aging excluded ('paid','void','voided','draft') and NOT 'proforma', so
 * the report claimed $22,720.00 of receivable on USMCA that the general ledger had no record of —
 * including $4,910 on a load that had been CANCELLED. Aging drives collections, DSO and the
 * balance-sheet A/R figure. A projection in that report is not a harmless extra row; it is an invented
 * receivable, and it makes the subledger disagree with the ledger by its full amount.
 *
 * 'draft' was already excluded for precisely this reason. 'proforma' is the same class and was simply
 * missed. A proforma that is genuinely owed becomes 'sent', and then it belongs in A/R.
 *
 * WHY THIS GUARD LOOKS AT THE PREDICATE AND NOT AT A COUNT. A data check ("no proforma in aging today")
 * passes whenever the sample happens to be empty. The defect is in the WHERE clause, so that is what is
 * asserted — the same reason the void-filter guard (ACCT-F202) reads predicates rather than rows.
 *
 * Run:  node scripts/verify-proforma-not-in-ar.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-proforma-not-in-ar";

/** A/R surfaces whose invoice-status exclusion must name 'proforma'. Prod-verified 2026-08-08. */
export const AR_SURFACES = [
  "apps/backend/src/accounting/ar-aging.service.ts",
  "apps/backend/src/accounting/consolidated-statements.service.ts",
];

export function stripComments(src) {
  return src.replace(/--[^\n]*/g, "").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Every invoice-status NOT IN (...) exclusion in the file, with whether it names 'proforma'.
 * Comments are stripped first: this fix ships with prose naming the literal, and a parser that read
 * comments would pass on the explanation after the code was reverted.
 */
export function statusExclusions(src) {
  const clean = stripComments(src);
  const out = [];
  // Capture the ALIAS, because one file can hold predicates for different tables. On
  // consolidated-statements.service.ts the bills predicate is b.status NOT IN ('voided','draft') and
  // the invoice one is i.status NOT IN (...). Judging by the literal list alone flagged the BILLS
  // predicate for not excluding 'proforma' — a status bills do not even have. That false positive was
  // caught by running this guard against the very file it was written for.
  const re = /(\w+)\.status\s+NOT\s+IN\s*\(([^)]*)\)/gi;
  let m;
  while ((m = re.exec(clean)) !== null) {
    const alias = m[1];
    // Only judge aliases bound to accounting.invoices by a FROM/JOIN in this same file.
    const boundToInvoices = new RegExp(
      `(?:FROM|JOIN)\\s+accounting\\.invoices\\s+(?:AS\\s+)?${alias}\\b`,
      "i"
    ).test(clean);
    if (!boundToInvoices) continue;
    out.push({ alias, list: m[2], hasProforma: /'proforma'/i.test(m[2]), hasDraft: /'draft'/i.test(m[2]) });
  }
  return out;
}

export function collectProblems(sources) {
  const problems = [];
  for (const { file, src } of sources) {
    const exclusions = statusExclusions(src);
    if (exclusions.length === 0) {
      // FAIL CLOSED only where invoices are actually queried. A file that never touches
      // accounting.invoices simply is not an A/R surface, and demanding an invoice predicate from it
      // was its own false positive — the bills-only fixture tripped it.
      if (/accounting\.invoices/i.test(stripComments(src))) {
        problems.push(
          `${file}: queries accounting.invoices but has no invoice status exclusion. If this surface ` +
            `moved, move the guard with it — an unparsed A/R surface must not read as a pass (ACCT-F223).`
        );
      }
      continue;
    }
    for (const e of exclusions) {
      if (!e.hasProforma) {
        problems.push(
          `${file}: an A/R status exclusion (${e.list.trim()}) does not exclude 'proforma'. A proforma ` +
            `posts NO journal entry, so counting it reports a receivable the general ledger has no ` +
            `record of — $22,720.00 on USMCA when this was found, including $4,910 on a CANCELLED ` +
            `load (ACCT-F223).`
        );
      }
    }
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];
  const F = "x.ts";

  const FROM_INV = "FROM accounting.invoices i\n";
  const bad = FROM_INV + "AND i.status NOT IN ('paid', 'void', 'voided', 'draft')";
  if (collectProblems([{ file: F, src: bad }]).length !== 1) {
    failures.push("the ACCT-F223 predicate verbatim was NOT caught");
  }

  const good = FROM_INV + "AND i.status NOT IN ('paid', 'void', 'voided', 'draft', 'proforma')";
  if (collectProblems([{ file: F, src: good }]).length !== 0) {
    failures.push("the corrected predicate was flagged");
  }

  // A comment naming proforma must NOT satisfy the check — this fix ships with exactly such prose.
  const commentOnly = "-- proforma is excluded below\n" + bad;
  if (collectProblems([{ file: F, src: commentOnly }]).length !== 1) {
    failures.push("a COMMENT naming proforma satisfied the check — false green");
  }

  // A non-invoice status exclusion (e.g. bills) must not be judged.
  const billsLike = "FROM accounting.bills b\nAND b.status NOT IN ('voided', 'draft')";
  if (collectProblems([{ file: F, src: billsLike }]).length !== 0) {
    failures.push("a non-invoice status exclusion was judged");
  }

  // Fail closed when a file DOES query invoices but no predicate parses. The fixture must reference
  // accounting.invoices: after narrowing, a file that never touches invoices is legitimately not an
  // A/R surface, so demanding a predicate from it was the guard's own false positive.
  const invoicesNoPredicate = "SELECT 1 FROM accounting.invoices i WHERE i.operating_company_id = $1";
  if (collectProblems([{ file: F, src: invoicesNoPredicate }]).length !== 1) {
    failures.push("an invoice surface with no status predicate read as a pass — must fail closed");
  }
  // And a file with no invoices at all must stay silent.
  if (collectProblems([{ file: F, src: "const x = 1;" }]).length !== 0) {
    failures.push("a non-A/R file was judged");
  }

  // Multiple exclusions in one file: the bad one must still be caught.
  const mixed = good + "\n" + bad;
  if (collectProblems([{ file: F, src: mixed }]).length !== 1) {
    failures.push("a second, unfixed exclusion in the same file was missed");
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — 7/7 (defect caught, fix passes, comment cannot fake a pass, non-invoice ` +
      `predicate ignored, invoice-surface-without-predicate fails closed, non-A/R file ignored, second bad exclusion still caught)`
  );
  process.exit(0);
}

const sources = [];
for (const rel of AR_SURFACES) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    console.error(`${LABEL} FAIL — ${rel} is missing; the A/R proforma exclusion cannot be verified.`);
    process.exit(1);
  }
  sources.push({ file: rel, src: fs.readFileSync(abs, "utf8") });
}
const problems = collectProblems(sources);
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} A/R surface(s) counting proforma invoices:`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(
  `${LABEL} OK — no A/R surface counts proforma invoices (${AR_SURFACES.length} surfaces checked).`
);
