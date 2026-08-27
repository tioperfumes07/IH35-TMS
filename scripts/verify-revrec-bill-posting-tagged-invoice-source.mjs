#!/usr/bin/env node
/**
 * INVOICE-SENT-WITHOUT-AR-RECOGNITION-JE (reconciliation-gap half)
 *
 * Event 2's DR A/R leg is economically the invoice's own A/R: the invoice poster
 * (posting-engine.service.ts) REFUSES to post its own A/R+revenue JE whenever the DISP-01 latch
 * owns the load (InvoiceRevrecLatchOwnsLoadError — "The invoice's A/R belongs to latch Event 2 ...
 * do not post around it"). Leaving the resulting posting's source_transaction_type/
 * source_transaction_id NULL meant the invoice detail page's own JE lookup, account-register, and
 * any GL<->sub-ledger tie-out could never find this JE via its invoice — confirmed live on prod:
 * Balance Sheet 1100 A/R vs /reports/ar-aging silently diverged by the sum of untagged Event-2 legs.
 *
 * Fixed by tagging the A/R debit posting line with the standard source_transaction_type='invoice'/
 * source_transaction_id column pair (the same structured columns bank_categorization/
 * customer_payment/bill_payment/... already use) whenever an invoice is linked to the load via
 * accounting.invoices.source_load_id — only for the bill (A/R) leg, only when resolvable.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const FILE = "apps/backend/src/accounting/revrec-delivery-posting/poster.service.ts";
const TEST_FILE = "apps/backend/src/accounting/revrec-delivery-posting/__tests__/revrec-latch-two-event-live.db.test.ts";

export function check(src, testSrc) {
  const failures = [];

  if (!/if \(prepared\.event === "bill"\) \{/.test(src)) {
    failures.push(`${FILE}: no longer gates the invoice-tagging block on event === "bill"`);
  }
  if (!/FROM accounting\.invoices\s*\n\s*WHERE source_load_id = \$1::uuid/.test(src)) {
    failures.push(`${FILE}: no longer resolves an invoice via source_load_id for the load`);
  }
  if (!/UPDATE accounting\.journal_entry_postings\s*\n\s*SET source_transaction_type = 'invoice', source_transaction_id = \$2/.test(src)) {
    failures.push(`${FILE}: no longer UPDATEs the posting's source_transaction_type/source_transaction_id to 'invoice'`);
  }
  if (!/AND source_transaction_type IS NULL/.test(src)) {
    failures.push(`${FILE}: the tagging UPDATE no longer guards on source_transaction_type IS NULL (could clobber an existing, differently-sourced tag)`);
  }

  if (!/source_transaction_type: string \| null;/.test(testSrc) || !/expect\(arLine!\.source_transaction_type\)\.toBe\("invoice"\);/.test(testSrc)) {
    failures.push(`${TEST_FILE}: the live-DB assertion that the A/R posting is tagged source_transaction_type='invoice' is missing`);
  }
  if (!/expect\(arLine!\.source_transaction_id\)\.toBe\(invoiceId\);/.test(testSrc)) {
    failures.push(`${TEST_FILE}: the live-DB assertion that source_transaction_id matches the real invoice id is missing`);
  }

  return failures;
}

function readAll() {
  return {
    src: fs.readFileSync(path.join(root, FILE), "utf8"),
    testSrc: fs.readFileSync(path.join(root, TEST_FILE), "utf8"),
  };
}

function run() {
  const { src, testSrc } = readAll();
  const failures = check(src, testSrc);
  if (failures.length > 0) {
    console.error("FAIL: revrec-bill-posting-tagged-invoice-source");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "PASS: revrec Event 2's A/R debit leg is tagged source_transaction_type='invoice'/source_transaction_id when an invoice is linked to the load, live-DB-tested"
  );
}

function selftest() {
  const { src, testSrc } = readAll();
  const baseline = check(src, testSrc);
  if (baseline.length !== 0) {
    console.error("FAIL(selftest): baseline (current HEAD) is not clean:", baseline);
    process.exit(1);
  }

  // Mutation 1: the whole tagging block is removed (the exact pre-fix shape).
  const blockStart = src.indexOf('      // INVOICE-SENT-WITHOUT-AR-RECOGNITION-JE');
  const blockEnd = src.indexOf("\n    }\n  });", blockStart) + "\n    }\n  });".length;
  const offenderA = blockStart >= 0 && blockEnd > blockStart
    ? src.slice(0, blockStart) + "\n    }\n  });" + src.slice(blockEnd)
    : src.replace("if (prepared.event === \"bill\") {", "if (false) {");
  if (offenderA === src) {
    console.error("FAIL(selftest): offender A mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failuresA = check(offenderA, testSrc);
  if (failuresA.length === 0) {
    console.error("FAIL(selftest): planted offender (tagging block removed) was NOT caught");
    process.exit(1);
  }

  // Mutation 2: the IS NULL guard is dropped (could clobber an existing tag from another source).
  const offenderB = src.replace(
    "              WHERE id = $1::uuid\n                AND source_transaction_type IS NULL\n",
    "              WHERE id = $1::uuid\n"
  );
  if (offenderB === src) {
    console.error("FAIL(selftest): offender B mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failuresB = check(offenderB, testSrc);
  if (failuresB.length === 0) {
    console.error("FAIL(selftest): planted offender (IS NULL guard removed) was NOT caught");
    process.exit(1);
  }

  // Mutation 3: the live-DB test assertion is removed.
  const offenderC = testSrc.replace(
    'expect(arLine!.source_transaction_type).toBe("invoice");\n    expect(arLine!.source_transaction_id).toBe(invoiceId);\n',
    ""
  );
  if (offenderC === testSrc) {
    console.error("FAIL(selftest): offender C mutation did not change the test file — pattern out of sync");
    process.exit(1);
  }
  const failuresC = check(src, offenderC);
  if (failuresC.length === 0) {
    console.error("FAIL(selftest): planted offender (live-DB assertion removed) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): all 3 planted regressions correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
