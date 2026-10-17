#!/usr/bin/env node
/**
 * verify-customer-payment-posts-in-caller-tx.mjs — ACCT-F165.
 *
 * Every customer-payment (A/R receipt) posting call must use the IN-CLIENT-TX poster on the caller's
 * own client. Using the pool-connection variant from inside an open transaction makes the receipt
 * silently vanish.
 *
 * WHY THIS EXISTS. `postSourceTransaction()` opens its OWN pool connection and its OWN transaction.
 * `postSourceTransactionInClientTx(client, …)` runs on the caller's. When a caller has already
 * INSERTed the payment and its applications on `client` inside a still-open transaction, those rows
 * are UNCOMMITTED — and therefore INVISIBLE from a second connection. The poster then looks at a
 * payment with no visible applications, has nothing to post, and returns WITHOUT writing a journal
 * entry. No throw, no skip audit, no failed batch. The subledger moves and the GL does not.
 *
 * MEASURED ON PROD br-fancy-credit-akjnd07a 2026-08-07 (USMCA, RLS-bypassed):
 *     PMT-2026-00001 $250.00   posting_batches 0
 *     PMT-2026-00002 $437.25   posting_batches 0
 *     PMT-2026-00003 $600.00   posting_batches 0
 *   USMCA posting_batches by source_transaction_type: bill 12 · bank_categorization 5 · invoice 3 ·
 *   bill_payment 2 · expense 2 · transfer 1 — and NO `customer_payment` row of any kind.
 * The A/P side posts (bill_payment last at 02:47) while A/R created at 02:28 and 03:04 did not, on the
 * SAME deploy — so the posting engine works and the gap was one call site.
 *
 * CONSEQUENCE, which is why this is not a style rule: `INV-2026-00003` reads **paid, open $0.00** in
 * the subledger while GL A/R still carries the full **$1,200.00**, plus $87.25 of unapplied customer
 * cash with no GL representation. A subledger-to-GL tie-out — the first reconciliation any auditor,
 * CPA or lender performs — fails, and the gap grew with every payment received.
 *
 * WHAT IT ASSERTS, and deliberately nothing wider: in the three files that write a customer-payment
 * A/R receipt, a `customer_payment` post must be made with `postSourceTransactionInClientTx`.
 *
 * WHY NOT A BLANKET BAN ON `postSourceTransaction(`: the pool-connection variant is CORRECT when the
 * caller is not holding an open transaction, and several call sites use it that way legitimately —
 * `bill-payment-gl.service.ts` among them, PROVEN in production by a live A/P bill payment that
 * posted DR A/P / CR bank correctly in the same entity and session in which the A/R receipts posted
 * nothing. A guard that flagged every pool-variant call would be RED on correct code, and a guard
 * that is red on correct code gets muted. Scope is the point.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-customer-payment-posts-in-caller-tx";

/** The A/R receipt write paths. Each INSERTs payments and/or payment_applications on a caller client. */
const AR_RECEIPT_FILES = [
  path.join("apps", "backend", "src", "accounting", "payments", "apply.service.ts"),
  path.join("apps", "backend", "src", "accounting", "payments.routes.ts"),
  path.join("apps", "backend", "src", "accounting", "customer-payments.routes.ts"),
];

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
}

/** A `customer_payment` post made with the POOL-connection poster — the defect. */
export function findViolations(root = ROOT) {
  const problems = [];
  for (const rel of AR_RECEIPT_FILES) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) {
      problems.push({ where: rel, why: "A/R receipt write path missing — renamed or removed; re-point this guard" });
      continue;
    }
    const src = stripComments(fs.readFileSync(abs, "utf8"));
    if (!/customer_payment/.test(src)) continue; // file no longer posts A/R receipts

    // Pool-variant call: `postSourceTransaction(` NOT preceded by `InClientTx`. Match the call, then
    // look ahead for the customer_payment source type inside the same argument object.
    const re = /\bpostSourceTransaction\s*\(/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const window = src.slice(m.index, m.index + 400);
      if (/source_transaction_type\s*:\s*["']customer_payment["']/.test(window)) {
        problems.push({
          where: rel,
          why:
            "posts customer_payment with the POOL-connection poster — from a second connection the " +
            "caller's uncommitted payment/applications are invisible, so the receipt silently posts nothing. " +
            "Use postSourceTransactionInClientTx(client, …).",
        });
      }
    }

    // And the positive requirement: if the file posts customer_payment at all, it must do so in-client-tx.
    if (!/postSourceTransactionInClientTx\s*\(/.test(src)) {
      problems.push({
        where: rel,
        why: "references customer_payment posting but never calls postSourceTransactionInClientTx()",
      });
    }
  }
  return problems;
}

function report(problems) {
  if (problems.length === 0) {
    console.log(`${LABEL} — OK (every customer-payment post runs on the caller's transaction)`);
    return 0;
  }
  console.error(`${LABEL} FAIL — ${problems.length} violation(s):`);
  for (const p of problems) console.error(`  ${p.where}: ${p.why}`);
  console.error(
    "  A/R receipts that post from a second connection leave the subledger moved and the GL dark — " +
      "the subledger-to-GL tie-out then fails, which is the first check an auditor runs."
  );
  return 1;
}

/** Mutation-proven: plant the defect => RED, restore => GREEN. */
async function selftest() {
  const failures = [];
  const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "arpost-guard-"));
  const rel = AR_RECEIPT_FILES[0];
  const write = (body) => {
    const abs = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body);
    // the other two files must exist so their absence does not dominate the result
    for (const other of AR_RECEIPT_FILES.slice(1)) {
      const oa = path.join(tmp, other);
      fs.mkdirSync(path.dirname(oa), { recursive: true });
      fs.writeFileSync(oa, 'postSourceTransactionInClientTx(client, { source_transaction_type: "customer_payment" });\n');
    }
  };

  const GOOD = 'await postSourceTransactionInClientTx(client, { source_transaction_type: "customer_payment", posting_purpose: "initial_post" });\n';
  write(GOOD);
  if (findViolations(tmp).length !== 0) failures.push("case1 FAIL — the in-client-tx form must be GREEN.");

  // Mutation 1 — the actual production defect: the pool variant on a customer_payment.
  write('await postSourceTransaction({ source_transaction_type: "customer_payment", posting_purpose: "initial_post" });\n');
  if (findViolations(tmp).length === 0) failures.push("case2 FAIL — the pool-connection poster on customer_payment must go RED.");

  // Mutation 2 — posts customer_payment but with NO in-client-tx call anywhere.
  write('await somethingElse({ source_transaction_type: "customer_payment" });\n');
  if (findViolations(tmp).length === 0) failures.push("case3 FAIL — customer_payment with no in-client-tx post must go RED.");

  // Mutation 3 — a POOL-variant call for a DIFFERENT source type must stay GREEN (no false positive:
  // bill_payment legitimately uses the pool poster and posts correctly in production).
  write(GOOD + 'await postSourceTransaction({ source_transaction_type: "bill_payment" });\n');
  if (findViolations(tmp).length !== 0) failures.push("case4 FAIL — a pool-variant post for another source type must stay GREEN.");

  // Mutation 4 — the fix written only in a COMMENT must not read as the fix.
  write('// use postSourceTransactionInClientTx(client, ...) for customer_payment\nawait postSourceTransaction({ source_transaction_type: "customer_payment" });\n');
  if (findViolations(tmp).length === 0) failures.push("case5 FAIL — a fix written only in a comment must go RED.");

  // Mutation 5 — a missing A/R receipt file must be reported, not silently skipped.
  fs.rmSync(path.join(tmp, rel), { force: true });
  if (findViolations(tmp).length === 0) failures.push("case6 FAIL — a missing A/R receipt path must go RED.");

  write(GOOD);
  if (findViolations(tmp).length !== 0) failures.push("case7 FAIL — restore must return GREEN.");

  fs.rmSync(tmp, { recursive: true, force: true });
  if (failures.length) {
    for (const x of failures) console.error(`${LABEL} ${x}`);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST PASS — in-client-tx GREEN; pool-variant customer_payment, no-in-client-tx-call, ` +
      `comment-only "fix" and a missing path each RED; a pool-variant post for another source type stays GREEN; restore GREEN`
  );
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(process.argv.includes("--selftest") ? await selftest() : report(findViolations()));
}
