#!/usr/bin/env node
/**
 * verify-subledger-writes-post-to-gl.mjs — CLS-SUBLEDGER-GL-DARK ratchet.
 *
 * THE CLASS. A route INSERTs into accounting.payments AND accounting.payment_applications in one
 * operation. That moves the A/R subledger: the invoice's open amount drops, the customer's balance
 * drops, aging changes. If that same route never invokes the posting engine, the GENERAL LEDGER does
 * not move with it. The books are then out by the amount of the receipt, and — this is what makes the
 * class dangerous rather than merely wrong — NOTHING reports a failure. The payment reads fine. The
 * invoice reads fine. Only a trial balance against the subledger shows it, and only if someone runs one.
 *
 * Found live, not by reading code: USMCA payment a0b83bf5 applied $250.00 against an invoice on
 * 2026-08-06 and produced ZERO journal_entry_postings. It was not a flag problem and not a mapping
 * problem — CUSTOMER_PAYMENT_GL_POSTING_ENABLED was true for USMCA and the CoA roles were bound and
 * active. The poster was simply never called on that path. A sweep of every money-subledger writer in
 * the backend then found a SECOND route with the identical shape, so this is a class, not an incident.
 *
 * WHAT THIS GUARD ASSERTS. For every non-test file that writes BOTH accounting.payments and
 * accounting.payment_applications, the file must also reference the posting engine. Scoped narrowly and
 * deliberately:
 *
 *   - BOTH tables required. A file touching only one is not necessarily completing a receipt (a
 *     read-model, a backfill, a display-id helper), and reddening on those would train people to
 *     exempt the guard.
 *   - Tests excluded. A fixture legitimately writes rows with no poster.
 *   - QBO pullers excluded BY PATH, and this exclusion is the point rather than a convenience:
 *     qbo-sync/* clones history that QuickBooks already posted. Posting it again would DOUBLE the one
 *     set of genuinely real financial data in the system. Under PARALLEL BOOKS an unposted QBO clone is
 *     CORRECT STATE, not a defect — the origin test from the linkage law applies (imported rows are not
 *     defects, and "fixing" them means inventing financial data).
 *
 * WHY IT MATCHES THE ENGINE IMPORT RATHER THAN A CALL. The call site may be postSourceTransaction or
 * postSourceTransactionInClientTx (routes inside withCompanyScope must use the in-tx form — the other
 * takes a second pool connection and cannot see the uncommitted payment). Matching the import covers
 * both without the guard having an opinion about which is right for a given call site.
 *
 * Selftest: --selftest plants the defect (a matching file with the poster import stripped) and proves
 * RED, then proves GREEN on restore. A guard that cannot fail is worthless.
 */
import fs from "node:fs";
import path from "node:path";

const LABEL = "verify-subledger-writes-post-to-gl";
const ROOT = path.resolve(process.argv[2] ?? "apps/backend/src");

const WRITES_PAYMENTS = /INSERT\s+INTO\s+accounting\.payments\b/i;
const WRITES_APPLICATIONS = /INSERT\s+INTO\s+accounting\.payment_applications\b/i;
const POSTS_TO_GL = /postSourceTransaction(InClientTx)?\b/;

/** Excluded by path: fixtures, and QBO clone pullers (posting a clone would double the books). */
function isExempt(rel) {
  return (
    /(^|\/)__tests__\//.test(rel) ||
    /\.(test|spec)\.[cm]?tsx?$/.test(rel) ||
    /(^|\/)qbo-sync\//.test(rel)
  );
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist") continue;
      walk(p, out);
    } else if (/\.[cm]?tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

export function findDarkWriters(root = ROOT) {
  if (!fs.existsSync(root)) return [];
  const offenders = [];
  for (const file of walk(root)) {
    const rel = path.relative(process.cwd(), file).replace(/\\/g, "/");
    if (isExempt(rel)) continue;
    const src = fs.readFileSync(file, "utf8");
    if (!WRITES_PAYMENTS.test(src) || !WRITES_APPLICATIONS.test(src)) continue;
    if (!POSTS_TO_GL.test(src)) offenders.push(rel);
  }
  return offenders.sort();
}

function report(offenders) {
  if (offenders.length === 0) {
    console.log(`${LABEL} OK — every customer-payment write path posts to the GL`);
    return 0;
  }
  console.error(
    `${LABEL} FAIL — ${offenders.length} route(s) move the A/R subledger without posting to the GL:\n`
  );
  for (const f of offenders) console.error(`  - ${f}`);
  console.error(
    `\nA receipt that writes accounting.payments + accounting.payment_applications reduces the invoice's\n` +
      `open amount. Without a posting-engine call the general ledger never moves, the books are out by the\n` +
      `amount of the receipt, and nothing reports a failure.\n\n` +
      `Fix: gate on the entity's CUSTOMER_PAYMENT_GL_POSTING_ENABLED flag and call the EXISTING poster —\n` +
      `write no new GL math. Inside a withCompanyScope callback use postSourceTransactionInClientTx(client, …):\n` +
      `postSourceTransaction() opens its own connection and cannot see the uncommitted payment. When the flag\n` +
      `is OFF, record the skip via recordPostingFlagSkip() so it can never read as a silent success.\n`
  );
  return 1;
}

async function selftest() {
  const os = await import("node:os");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gl-dark-"));
  const dir = path.join(tmp, "accounting");
  fs.mkdirSync(dir, { recursive: true });
  const good = path.join(dir, "receipts.routes.ts");
  const clean = `
    import { postSourceTransactionInClientTx } from "./posting-engine.service.js";
    await client.query(\`INSERT INTO accounting.payments (id) VALUES ($1)\`);
    await client.query(\`INSERT INTO accounting.payment_applications (id) VALUES ($1)\`);
    await postSourceTransactionInClientTx(client, {}, {});
  `;
  fs.writeFileSync(good, clean);

  // A QBO clone puller with no poster must NOT redden — unposted clones are correct under parallel books.
  const qbo = path.join(tmp, "qbo-sync");
  fs.mkdirSync(qbo, { recursive: true });
  fs.writeFileSync(
    path.join(qbo, "qbo-ar-payments-puller.ts"),
    `await c.query(\`INSERT INTO accounting.payments (id) VALUES ($1)\`);
     await c.query(\`INSERT INTO accounting.payment_applications (id) VALUES ($1)\`);`
  );

  const failures = [];
  if (findDarkWriters(tmp).length !== 0) failures.push("case1 FAIL — clean tree must be GREEN.");

  fs.writeFileSync(good, clean.replace(/import \{ postSourceTransactionInClientTx \}.*\n/, "").replace(/await postSourceTransactionInClientTx.*\n/, ""));
  const planted = findDarkWriters(tmp);
  if (planted.length !== 1) failures.push(`case2 FAIL — planted defect must go RED, got ${planted.length}.`);

  fs.writeFileSync(good, clean);
  if (findDarkWriters(tmp).length !== 0) failures.push("case3 FAIL — restore must return to GREEN.");

  fs.rmSync(tmp, { recursive: true, force: true });
  if (failures.length) {
    for (const f of failures) console.error(`${LABEL} ${f}`);
    // Exit NON-ZERO here, in the selftest body itself. A selftest that prints failures and still
    // returns a code someone else may ignore is the fake-green pattern verify-selftests-can-fail
    // exists to catch — and it is right to insist: a guard whose selftest cannot fail proves nothing.
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — GREEN clean, RED on planted defect, GREEN on restore, QBO clone exempt`);
  return 0;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const code = process.argv.includes("--selftest") ? await selftest() : report(findDarkWriters());
  process.exit(code);
}
