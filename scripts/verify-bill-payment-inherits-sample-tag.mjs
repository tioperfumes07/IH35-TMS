#!/usr/bin/env node
/**
 * GUARD: every bill_payment writer must INHERIT its bill's sample flag. ACCT-F265.
 *
 * `accounting.bill_payments.is_sample_data` exists on 6,551 rows and NO writer set it. Paying a SAMPLE
 * bill therefore produced a REAL payment — and posting-engine resolves the flag from the SOURCE row
 * (bill_payment is in SAMPLE_TAGGED_SOURCE_TABLES), so it produced a REAL journal entry too. Sample cash
 * left sample A/P and landed in the real ledger.
 *
 * WHY INHERITANCE AND NOT A PARAMETER — this is the whole point of the guard. There are FOUR writers:
 *   accounting/bills.service.ts · accounting/vendor-bill-payments.routes.ts
 *   accounting/bills-bulk.routes.ts · cash-advances/cash-advances.routes.ts
 * An optional `isSampleData` argument would mean four call sites each remembering, and the one that
 * forgets fails SILENTLY — it writes false, which is indistinguishable from a deliberate real payment.
 * The bulk path is the worst case: one omission marks an entire batch as real money.
 *
 * Deriving from the parent is correct BY CONSTRUCTION, because a payment is never more or less sample
 * than the bill it pays. It is also the established pattern here rather than a new idea: the invoice
 * derives from the load (ACCT-F193), the revenue latch derives from the load (ACCT-F210), the settlement
 * derives from the load. This guard exists to stop the next writer regressing to a parameter.
 *
 * A subquery in VALUES was chosen deliberately over adding a placeholder: it needs NO renumbering of
 * positional params and NO change to any params array, so it cannot trip the lockstep
 * column/values/placeholder landmine that four separate INSERT shapes would otherwise guarantee.
 *
 * Run:  node scripts/verify-bill-payment-inherits-sample-tag.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bill-payment-inherits-sample-tag";

const WRITERS = [
  "apps/backend/src/accounting/bills.service.ts",
  "apps/backend/src/accounting/vendor-bill-payments.routes.ts",
  "apps/backend/src/accounting/bills-bulk.routes.ts",
  "apps/backend/src/cash-advances/cash-advances.routes.ts",
];

/** Strips JS AND SQL comments — an explanatory `-- …` must never count as evidence of a write. */
export function stripComments(src) {
  return src
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n]*/g, "");
}

/** Each INSERT INTO accounting.bill_payments must name the column AND derive it from accounting.bills. */
export function auditWriter(src) {
  const clean = stripComments(src);
  const out = [];
  const re = /INSERT\s+INTO\s+accounting\.bill_payments\s*\(([\s\S]{0,1200}?)\)\s*VALUES\s*\(([\s\S]{0,1600}?)\)\s*(?:RETURNING|`|;)/gi;
  let m;
  while ((m = re.exec(clean)) !== null) {
    const cols = m[1];
    const vals = m[2];
    // 443.182 C — the one row writer (bills.service.ts insertBillPaymentRowInClientTx) builds its column list from the
    // caller's row; its marker expansion is checked by writerExpandsSampleFromBill, its callers below.
    if (/\$\{\s*cols\.join/.test(cols)) continue;
    out.push({
      namesColumn: /\bis_sample_data\b/.test(cols),
      derivesFromBill: /SELECT\s+\w*\.?is_sample_data\s+FROM\s+accounting\.bills\b/i.test(vals),
    });
  }
  // 443.182 C — a call into the one row writer: the row object must name is_sample_data and derive it from the bill
  // (BILL_PAYMENT_SAMPLE_FROM_BILL), never a per-caller value.
  for (const call of clean.matchAll(/insertBillPaymentRowInClientTx(?:<[^>]*>)?\(\s*\w+\s*,\s*\{/g)) {
    let depth = 1;
    let k = call.index + call[0].length;
    for (; k < clean.length && depth > 0; k += 1) {
      if (clean[k] === "{") depth += 1;
      else if (clean[k] === "}") depth -= 1;
    }
    const obj = clean.slice(call.index + call[0].length, k - 1);
    out.push({
      namesColumn: /\bis_sample_data\s*:/.test(obj),
      derivesFromBill: /\bis_sample_data\s*:\s*BILL_PAYMENT_SAMPLE_FROM_BILL\b/.test(obj),
    });
  }
  return out;
}

/** 443.182 C — the one row writer must expand BILL_PAYMENT_SAMPLE_FROM_BILL to the paid bill's is_sample_data. */
export function writerExpandsSampleFromBill(src) {
  const clean = stripComments(src);
  return (
    /v\s*===\s*BILL_PAYMENT_SAMPLE_FROM_BILL\s*\)\s*vals\.push\(`COALESCE\(\$\{fromBill\("b\.is_sample_data"\)\}, false\)`\)/.test(clean) &&
    /FROM accounting\.bills b WHERE b\.id = \$\{billId\}::uuid/.test(clean)
  );
}

export function collectProblems(files) {
  const problems = [];
  for (const { file, src } of files) {
    const inserts = auditWriter(src);
    if (inserts.length === 0) {
      problems.push(
        `${file}: no INSERT INTO accounting.bill_payments found. If the writer moved, move this guard ` +
          `with it — an unparsed payment writer must not read as a pass (ACCT-F265).`
      );
      continue;
    }
    for (const ins of inserts) {
      if (!ins.namesColumn) {
        problems.push(
          `${file}: an INSERT INTO accounting.bill_payments does not name is_sample_data, so paying a ` +
            `SAMPLE bill writes a REAL payment — and posting-engine turns that into a REAL journal ` +
            `entry (ACCT-F265).`
        );
        continue;
      }
      if (!ins.derivesFromBill) {
        problems.push(
          `${file}: is_sample_data is written but NOT derived from accounting.bills. With four ` +
            `bill_payment writers, a per-caller value fails silently the moment one forgets — it writes ` +
            `false, which is indistinguishable from a deliberate real payment. Use ` +
            `(SELECT b.is_sample_data FROM accounting.bills b WHERE b.id = <bill_id>) (ACCT-F265).`
        );
      }
    }
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];
  const mk = (src) => [{ file: "x.ts", src }];
  const GOOD =
    "INSERT INTO accounting.bill_payments (bill_id, is_sample_data) VALUES ($2, COALESCE((SELECT b.is_sample_data FROM accounting.bills b WHERE b.id = $2::uuid), false)) RETURNING id";

  if (collectProblems(mk(GOOD)).length !== 0) failures.push("the inheriting writer was flagged");

  const NO_COL = "INSERT INTO accounting.bill_payments (bill_id, amount) VALUES ($2, $3) RETURNING id";
  if (!collectProblems(mk(NO_COL)).some((p) => /does not name is_sample_data/.test(p))) {
    failures.push("a writer omitting the column was NOT caught");
  }

  // THE POINT OF THE GUARD: a per-caller parameter must be rejected even though it "writes" the column.
  const PARAM = "INSERT INTO accounting.bill_payments (bill_id, is_sample_data) VALUES ($2, $9) RETURNING id";
  if (!collectProblems(mk(PARAM)).some((p) => /NOT derived from accounting\.bills/.test(p))) {
    failures.push("a per-caller parameter was accepted — that is the silent-failure shape");
  }

  // An SQL comment naming the column must not satisfy either half.
  const COMMENT = "INSERT INTO accounting.bill_payments (bill_id, -- is_sample_data goes here\n amount) VALUES ($2,$3) RETURNING id";
  if (!collectProblems(mk(COMMENT)).some((p) => /does not name is_sample_data/.test(p))) {
    failures.push("an SQL comment faked the column — false green");
  }

  // A file with no such INSERT must fail closed, not silently pass.
  if (!collectProblems(mk("const x = 1;")).some((p) => /no INSERT INTO accounting\.bill_payments/.test(p))) {
    failures.push("a missing writer did not fail closed");
  }

  // 443.182 C — the row-writer call form.
  const CALL_GOOD = "await insertBillPaymentRowInClientTx(client, { bill_id: id, is_sample_data: BILL_PAYMENT_SAMPLE_FROM_BILL }, \"id\");";
  if (collectProblems(mk(CALL_GOOD)).length !== 0) failures.push("a writer call deriving from the bill was flagged");
  const CALL_PARAM = "await insertBillPaymentRowInClientTx(client, { bill_id: id, is_sample_data: isSample }, \"id\");";
  if (!collectProblems(mk(CALL_PARAM)).some((p) => /NOT derived from accounting\.bills/.test(p))) failures.push("a writer call with a per-caller sample value was accepted");
  const CALL_NONE = "await insertBillPaymentRowInClientTx(client, { bill_id: id, amount: 1 });";
  if (!collectProblems(mk(CALL_NONE)).some((p) => /does not name is_sample_data/.test(p))) failures.push("a writer call omitting is_sample_data was accepted");

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — 8/8 (inheriting writer passes, missing column caught, per-caller param ` +
      `rejected, SQL comment cannot fake, missing writer fails closed, writer-call form: derived passes, per-caller / missing rejected)`
  );
  process.exit(0);
}

const files = [];
for (const f of WRITERS) {
  const p = path.join(root, f);
  if (!fs.existsSync(p)) {
    console.error(`${LABEL} FAIL — ${f} is missing; a bill_payment writer cannot be verified.`);
    process.exit(1);
  }
  files.push({ file: f, src: fs.readFileSync(p, "utf8") });
}
const problems = collectProblems(files);
const canonical = files.find((f) => f.file === "apps/backend/src/accounting/bills.service.ts");
if (canonical && /insertBillPaymentRowInClientTx/.test(canonical.src) && !writerExpandsSampleFromBill(canonical.src)) {
  problems.push("apps/backend/src/accounting/bills.service.ts: the one bill-payment row writer no longer expands BILL_PAYMENT_SAMPLE_FROM_BILL to the bill's is_sample_data (ACCT-F265).");
}
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} bill_payment writer issue(s):`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(`${LABEL} OK — all ${WRITERS.length} bill_payment writers inherit is_sample_data from their bill.`);
