#!/usr/bin/env node
/**
 * AN INVOICE MAY NOT BE ISSUED WITHOUT ITS LEDGER ENTRY AND ITS SPINE LINK (ROUND 331).
 *
 * MEASURED LIVE ON USMCA 2026-10-02 (prod tiny-field-89581227 / br-fancy-credit-akjnd07a):
 *
 *   6 invoices carry status='sent' with ZERO journal-entry postings, ZERO spine links and no A/R
 *   posting via their load — $20,800.00 billed to customers that the general ledger has never
 *   heard of (13616 $5,700 · 13621 $4,900 · 13620 $4,300 · 13618 $3,700 · 13622 $2,200 ·
 *   13525 $0.00). A/R and revenue are both understated by that amount.
 *
 *   102 of 110 non-void invoices have NO row in accounting.transaction_source_links. The spine
 *   holds 4,252 links for this company and declares linkage richly for everything else --
 *   expense/source_transaction 672, expense_cash_payment 660, fuel_event 207+207,
 *   load/revrec_earn 126, load/revrec_bill 125, journal_entry/manual_entry 1,122 --
 *   but invoice/source_transaction is **8**. The load half of revenue recognition is fully wired
 *   and the invoice half is not, which is exactly why an invoice's linkage is not visible.
 *
 * ROOT CAUSE OF THE FIRST ONE, IN CODE:
 *   apps/backend/src/accounting/invoice-gl.service.ts says in its own header "Flag default OFF,
 *   per-entity override", and postInvoiceGlIfEnabled() returns
 *   `{ posted: false, reason: "posting_disabled" }` when INVOICE_AR_GL_POSTING_ENABLED is off.
 *   apps/backend/src/accounting/invoice-send.service.ts then stamps status='sent' and completes.
 *   So the ledger entry is optional while issuing the document to the customer is not. In
 *   QuickBooks and in NetSuite there is no such thing as sending an invoice without posting it --
 *   issuing the document IS the posting event. A flag that permits the one without the other
 *   manufactures exactly this hole.
 *
 * THE RULES, each fails the push:
 *
 *   1. SILENT posting_disabled. A send path that receives reason="posting_disabled" (or any
 *      { posted: false } result) must refuse the send, not continue to a posted-state status.
 *      Treating it as a tolerable outcome is the defect.
 *
 *   2. STATUS WITHOUT POSTER. A file that writes a posted-state status onto accounting.invoices
 *      (sent / partial / paid) must also call the GL poster and the spine writer. Six other
 *      services write that column today -- from-load, broker-advances, factoring-advances.routes,
 *      poster.service, invoice-date-recompute, bulk-void -- and each is a second source of this
 *      defect. The shrink-only WRITERS_WITHOUT_POSTER set below is the ratchet.
 *
 *   3. POSTER WITHOUT A SPINE LINK. The invoice GL poster must call writeTransactionSourceLink.
 *      A journal entry with no spine row is a posting nothing can traverse back to its document,
 *      and transaction_source_links is this app's declared linkage mechanism, not a column on the
 *      posting.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runGuard, withTmpFixture, statusOf, outputOf, reportSelftest } from "./lib/guard-selftest.mjs";


if (process.argv.includes("--selftest")) selftest();

// VERIFY_ROOT lets --selftest point the whole guard at a throwaway tree (never tracked source).
const ROOT = process.env.VERIFY_ROOT
  ? resolve(process.env.VERIFY_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-invoice-issue-implies-posted-and-linked";

const POSTED_STATES = ["sent", "partial", "paid"];
const SEND_PATHS = ["apps/backend/src/accounting/invoice-send.service.ts"];
const POSTER_PATH = "apps/backend/src/accounting/invoice-gl.service.ts";

/**
 * SHRINK-ONLY. Files that write a posted-state status onto accounting.invoices without calling
 * the poster, measured by THIS GUARD on origin/main 2026-10-02. Removing a name is the fix;
 * adding one is rejected.
 *
 * My first hand-written list for this set was wrong — I guessed from-load, broker-advances and
 * invoice-date-recompute from a grep of "UPDATE accounting.invoices". The guard, which strips
 * comments and checks that a posted-state value is actually assigned, found a different four.
 * That is the second time today a grep of mine was corrected by a guard of mine, and the reason
 * the ratchet is measured rather than typed.
 *
 * NOTE ON RULES 1 AND 3: they are deliberately NOT baselined. They are the $20,800 hole and the
 * missing invoice linkage themselves, so a baseline would freeze the defect instead of the debt.
 * This guard therefore FAILS on origin/main today, by design, and starts passing when the two
 * engine fixes land. It is wired into the gate in the same PR as those fixes, never before.
 */
const WRITERS_WITHOUT_POSTER = new Set([
  "apps/backend/src/accounting/invoices.routes.ts",
  "apps/backend/src/dispatch/loads-bulk.routes.ts",
  "apps/backend/src/factoring/batch.service.ts",
  "apps/backend/src/accounting/factoring-advances.routes.ts",
]);
const WRITERS_CEILING = WRITERS_WITHOUT_POSTER.size;

/** bulk-void and poster.service legitimately move status without the A/R poster. */
const EXEMPT = new Set([
  "apps/backend/src/accounting/bulk-void.service.ts",
  "apps/backend/src/accounting/factoring-posting/poster.service.ts",
]);

function git(args) {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr || r.stdout}`);
  return (r.stdout || "").trim();
}
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const read = (p) => (existsSync(resolve(ROOT, p)) ? readFileSync(resolve(ROOT, p), "utf8") : null);

export function collectFailures() {
const failures = [];

// Fail closed on a tree this guard cannot see: with no git repo and no backend sources it
// vacuously reported OK (measured 2026-10-05 — exited 0 in a bare directory). Missing core
// inputs are a FAIL, never a pass.
const coreMissing = [...SEND_PATHS, POSTER_PATH].filter((p) => !existsSync(resolve(ROOT, p)));
if (coreMissing.length) {
  failures.push(
    `CORE INPUTS MISSING: ${coreMissing.join(", ")} — refusing to report OK on a tree this guard cannot see.`,
  );
  return { failures, statusWriters: [] };
}

// ---- RULE 1 : a send path must refuse a disabled posting ----
for (const p of SEND_PATHS) {
  const raw = read(p);
  if (!raw) continue;
  const code = strip(raw);
  if (!/postInvoiceGl/.test(code)) continue;
  const refuses =
    /posting_disabled[\s\S]{0,400}?(throw|return\s+reply|statusCode|BadRequest|Error\()/.test(code) ||
    /if\s*\(\s*!?\w*\.?posted\s*\)[\s\S]{0,200}?(throw|Error\()/.test(code);
  if (!refuses) {
    failures.push(
      `RULE 1 — SILENT posting_disabled: ${p} calls the invoice GL poster but never refuses the\n` +
        `  send when it comes back { posted: false }. Live result of exactly this: 6 invoices are\n` +
        `  status='sent' with no journal entry and no spine link, $20,800.00 billed and absent from\n` +
        `  the ledger. Issuing the document IS the posting event — if the poster will not post,\n` +
        `  the send must fail, not proceed.`
    );
  }
}

// ---- RULE 2 : no posted-state status write without the poster ----
const statusWriters = [];
for (const f of git(["ls-files", "apps/backend/src"]).split("\n")) {
  if (!/\.ts$/.test(f) || /__tests__|\.test\.ts$/.test(f)) continue;
  const raw = read(f);
  if (!raw) continue;
  const code = strip(raw);
  if (!/UPDATE\s+accounting\.invoices/i.test(code)) continue;
  const setsPosted = POSTED_STATES.some((s) =>
    new RegExp(`status\\s*=\\s*'${s}'|status\\s*=\\s*\\$\\d`, "i").test(code)
  );
  if (!setsPosted) continue;
  const callsPoster = /postInvoiceGl|writeTransactionSourceLink/.test(code);
  if (callsPoster || EXEMPT.has(f) || SEND_PATHS.includes(f)) continue;
  statusWriters.push(f);
  if (!WRITERS_WITHOUT_POSTER.has(f)) {
    failures.push(
      `RULE 2 — STATUS WITHOUT POSTER: ${f} writes a posted-state status onto\n` +
        `  accounting.invoices without calling the GL poster or the spine writer. Every such path\n` +
        `  is a second source of the $20,800 hole. Route it through the poster, or add it to EXEMPT\n` +
        `  with the accounting reason in a comment.`
    );
  }
}
if (statusWriters.length > WRITERS_CEILING) {
  failures.push(`RULE 2 RATCHET: ${statusWriters.length} unposted status writers, ceiling ${WRITERS_CEILING}.`);
}
const staleWriters = [...WRITERS_WITHOUT_POSTER].filter((f) => !statusWriters.includes(f));
if (staleWriters.length) {
  failures.push(
    `RULE 2 RATCHET: fixed (or gone) but still listed — remove so the ceiling drops:\n` +
      staleWriters.map((f) => `    ${f}`).join("\n")
  );
}

// ---- RULE 3 : the poster must declare linkage on the spine ----
const poster = read(POSTER_PATH);
if (poster && !/writeTransactionSourceLink/.test(strip(poster))) {
  failures.push(
    `RULE 3 — POSTER WITHOUT A SPINE LINK: ${POSTER_PATH} posts the invoice journal entry but\n` +
      `  never calls writeTransactionSourceLink. Live: accounting.transaction_source_links holds\n` +
      `  4,252 rows for USMCA — expense/source_transaction 672, fuel_event 207+207,\n` +
      `  load/revrec_earn 126, load/revrec_bill 125 — and invoice/source_transaction is 8, for 110\n` +
      `  invoices. The load half of revenue recognition is wired and the invoice half is not, which\n` +
      `  is why an invoice's linkage is not visible anywhere. Write\n` +
      `  linked_object_type='invoice', relationship_role='source_transaction' in the SAME\n` +
      `  transaction as the journal entry.`
  );
}

return { failures, statusWriters };
}

export function run() { return collectFailures().failures; }

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
const { failures, statusWriters } = collectFailures();
if (failures.length) {
  console.error(`${LABEL}: FAIL\n`);
  for (const f of failures) console.error(`  ${f}\n`);
  process.exit(1);
}
console.log(`${LABEL}: OK — send paths refuse a disabled posting, ${statusWriters.length}/${WRITERS_CEILING} unposted status writers, poster declares its spine link.`);
}

// --selftest (Devin build order 2026-10-05): one case that MUST pass (the real tree) and one
// that MUST fail (a throwaway tree missing this guard's inputs — proves it fails closed,
// never a vacuous green). This guard resolves paths against its own ROOT, so the fixture is
// pointed at via VERIFY_ROOT, not cwd.
function selftest() {
  const me = fileURLToPath(import.meta.url);
  const real = runGuard(me);
  const missing = withTmpFixture({}, [], (tmp) =>
    runGuard(me, { cwd: tmp, env: { VERIFY_ROOT: tmp } }),
  );
  reportSelftest("verify-invoice-issue-implies-posted-and-linked", [
    { name: "real repo tree passes", pass: statusOf(real) === 0, detail: statusOf(real) === 0 ? undefined : outputOf(real).slice(-400) },
    { name: "guard fails closed when its inputs are absent", pass: statusOf(missing) !== 0 },
  ]);
}
