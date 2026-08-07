#!/usr/bin/env node
/**
 * GUARD — BANK-F01: undoing a bank-transaction categorization MUST reverse the journal entry it
 * posted, and MUST clear the posting link.
 *
 * THE DEFECT (verified on prod 2026-08-03, banking.bank_transactions 10975/10975 visible, n_tup_del
 * 46). POST /api/v1/banking/transactions/:id/undo-categorization cleared the categorization fields and
 * left `matched_journal_entry_id` set. Two consequences, neither visible to anyone:
 *
 *   1. the journal entry posted under the OLD (wrong) account stayed in the ledger, unreversed; and
 *   2. bank-feed-gl-posting.service.ts refuses to post a row that already carries
 *      `matched_journal_entry_id` (returns `already_posted`) — so the CORRECTED categorization could
 *      never post either.
 *
 * So re-categorising was a SILENT NO-OP against the general ledger: the operator saw the correction,
 * the books kept the error, and nothing surfaced the divergence. That is worse than a duplicate for an
 * auditor — the operational record and the ledger disagree permanently, with no signal. Zero rows were
 * stranded when this was found, i.e. the trap had not yet been sprung; it is closed before it is.
 *
 * WHAT IT ENFORCES (static, on the real handler):
 *   A. the undo handler calls reverseJournalEntryNoFlip — the EXISTING reversal primitive, not new
 *      GL math;
 *   B. the UPDATE clears matched_journal_entry_id, so the corrected categorization can post;
 *   C. the reversal is read + performed BEFORE the UPDATE, on the same client, so a failed reversal
 *      rolls the undo back (fail-closed) instead of leaving a stale GL line behind.
 *
 * (C) is the one worth stating plainly: reversing AFTER the update, or on a different client, would
 * still satisfy a naive "does it mention the function" check while leaving exactly the hole this
 * guard exists to close.
 */
import { readFileSync, existsSync } from "node:fs";

const LABEL = "verify:undo-categorization-reverses-je";
const ROUTES = "apps/backend/src/banking/banking.routes.ts";

/** Isolate the undo-categorization handler body so assertions cannot pass on some other route. */
export function extractUndoHandler(src) {
  const start = String(src).indexOf('app.post("/api/v1/banking/transactions/:id/undo-categorization"');
  if (start < 0) return null;
  // The next route registration bounds the handler; fall back to end-of-file for the last route.
  const next = String(src).indexOf("app.post(", start + 10);
  const nextGet = String(src).indexOf("app.get(", start + 10);
  const candidates = [next, nextGet].filter((i) => i > 0);
  const end = candidates.length ? Math.min(...candidates) : String(src).length;
  return String(src).slice(start, end);
}

export function analyse(files) {
  const problems = [];
  const src = files[ROUTES];

  if (src == null) {
    problems.push(`${ROUTES} is missing — cannot verify the undo-categorization reversal.`);
    return problems;
  }

  const handler = extractUndoHandler(src);
  if (handler == null) {
    problems.push(
      `${ROUTES}: the undo-categorization route was not found. It is the surface that must reverse the ` +
        `posted JE; if it moved, repoint this guard rather than leaving it unable to check anything.`
    );
    return problems;
  }

  const reversalIdx = handler.indexOf("reverseJournalEntryNoFlip");
  if (reversalIdx < 0) {
    problems.push(
      `${ROUTES} undo-categorization does not call reverseJournalEntryNoFlip. Clearing the ` +
        `categorization while the posted JE stands leaves the ledger holding the WRONG account, and ` +
        `because the poster refuses a row that already carries matched_journal_entry_id, the corrected ` +
        `categorization can never post — a silent no-op against the GL.`
    );
  }

  const clearsLink = /matched_journal_entry_id\s*=\s*NULL/i.test(handler);
  if (!clearsLink) {
    problems.push(
      `${ROUTES} undo-categorization does not clear matched_journal_entry_id. Leaving it set makes the ` +
        `re-categorised row unpostable (bank-feed-gl-posting returns already_posted), so the correction ` +
        `silently never reaches the ledger.`
    );
  }

  // (C) ordering: the reversal must precede the UPDATE that clears the fields, so a throwing reversal
  // rolls the whole undo back.
  const updateIdx = handler.search(/UPDATE\s+banking\.bank_transactions/i);
  if (reversalIdx >= 0 && updateIdx >= 0 && reversalIdx > updateIdx) {
    problems.push(
      `${ROUTES} undo-categorization reverses the JE AFTER clearing the categorization. The reversal ` +
        `must run FIRST on the same transaction client so that a failed reversal (closed period, ` +
        `integrity conflict) rolls the undo back — fail-closed. Reversing afterwards can leave the ` +
        `categorization cleared while the stale GL line survives.`
    );
  }

  return problems;
}

function readAll() {
  const out = {};
  out[ROUTES] = existsSync(ROUTES) ? readFileSync(ROUTES, "utf8") : null;
  return out;
}

function selftest() {
  const failures = [];
  const t = (l, c) => { if (!c) failures.push(l); };

  const mk = (body) => ({
    [ROUTES]:
      `app.post("/api/v1/banking/transactions/:id/undo-categorization", async (req, reply) => {\n${body}\n});\n` +
      `app.get("/api/v1/banking/next", async () => {});\n`,
  });

  const good = `
      const posted = await client.query('SELECT matched_journal_entry_id FROM banking.bank_transactions');
      if (priorJournalEntryId) { await reverseJournalEntryNoFlip(client, { journalEntryId: priorJournalEntryId }); }
      const res = await client.query(\`UPDATE banking.bank_transactions SET status = 'x', matched_journal_entry_id = NULL\`);
  `;
  // The REAL pre-fix shape: clears the fields, never reverses, never clears the link.
  const preFix = `
      const res = await client.query(\`UPDATE banking.bank_transactions SET status = 'pending_categorization', category = NULL\`);
  `;
  const reversesButKeepsLink = `
      if (priorJournalEntryId) { await reverseJournalEntryNoFlip(client, { journalEntryId: priorJournalEntryId }); }
      const res = await client.query(\`UPDATE banking.bank_transactions SET status = 'x'\`);
  `;
  const wrongOrder = `
      const res = await client.query(\`UPDATE banking.bank_transactions SET status = 'x', matched_journal_entry_id = NULL\`);
      if (priorJournalEntryId) { await reverseJournalEntryNoFlip(client, { journalEntryId: priorJournalEntryId }); }
  `;

  t("the fixed handler passes", analyse(mk(good)).length === 0);
  t("the REAL pre-fix handler FAILS (2 problems: no reversal, link not cleared)", analyse(mk(preFix)).length === 2);
  t("reversing but leaving the link set FAILS", analyse(mk(reversesButKeepsLink)).length === 1);
  t("reversing AFTER the update FAILS (fail-open ordering)", analyse(mk(wrongOrder)).length === 1);
  t("a missing route file FAILS", analyse({ [ROUTES]: null }).length === 1);
  t("a renamed/moved route FAILS rather than passing vacuously",
    analyse({ [ROUTES]: "app.post('/api/v1/banking/transactions/:id/something-else', async () => {});" }).length === 1);
  // Scoping: a DIFFERENT route calling the reversal must not satisfy this handler's requirement.
  t("another route's reversal does not count",
    analyse({
      [ROUTES]:
        `app.post("/api/v1/banking/transactions/:id/undo-categorization", async () => {\n${preFix}\n});\n` +
        `app.post("/api/v1/other", async () => { await reverseJournalEntryNoFlip(client, {}); });\n`,
    }).length === 2);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  selftest();
  console.log(`${LABEL} selftest OK — 7 cases (1 pass-shape, 6 fail-shapes incl. the real pre-fix handler, the fail-open ordering, and cross-route leakage)`);
  process.exit(0);
}
const problems = analyse(readAll());
if (problems.length) {
  console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL} OK — undo-categorization reverses the posted JE first, then clears matched_journal_entry_id`);
