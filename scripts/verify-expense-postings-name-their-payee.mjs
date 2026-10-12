#!/usr/bin/env node
/**
 * verify-expense-postings-name-their-payee — LEAD 443.112 #3 (Codex audit, verified on prod).
 *
 * Every expense posting belongs to the payee its expense names. The ONE posting writer stamps it from the document
 * (posting-line-writer.ts resolvePostingSourceEntity, expense branch: vendor -> driver -> customer; D6 813b152e65).
 * Ten USMCA expense postings (EXP-2026-00001..00005, written 2026-10-07 23:14-23:16 UTC, both legs) predate D6 and
 * carry no entity. A posting's entity cannot be filled in place (refuse_posting_fact_update, LAW 363.3), so readers
 * attribute such a posting through its document (apps/backend/src/accounting/posting-party.sql.ts) — the same
 * mechanism 443.102 / #26579 uses for settlement A/P legs.
 *
 * STATIC: the writer's expense branch derives vendor_uuid -> driver_uuid -> payee_customer_uuid; the reader helper
 * keeps the stored entity first and falls back to the expense payee in the same order, same company only; both
 * journal-entry posting readers use it.
 * LIVE (read-only, fail-closed): (a) no expense posting whose expense names a payee is left with NO party under the
 * helper; (b) FORWARD — no expense posting written since FORWARD_SINCE carries a NULL entity while its expense names a
 * payee (a writer regression fails here, attribution never hides it); (c) an empty read is unverifiable, not a pass.
 * Reports the legacy postings attributed through their document.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-expense-postings-name-their-payee";
const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");
const F = {
  writer: "apps/backend/src/accounting/posting-line-writer.ts",
  helper: "apps/backend/src/accounting/posting-party.sql.ts",
  readers: "apps/backend/src/accounting/journal-entries.service.ts",
};
/** The 10 legacy legs were written 2026-10-07 23:14-23:16 UTC; nothing after this instant may be written bare. */
export const FORWARD_SINCE = "2026-10-08T00:00:00Z";

export function checkStatic(s) {
  const p = [];
  if (!/expense:\s*`SELECT COALESCE\(vendor_uuid::text, driver_uuid::text, payee_customer_uuid::text\) AS e/.test(s.writer)) {
    p.push(`${F.writer}: the expense branch no longer derives vendor -> driver -> customer from the expense.`);
  }
  if (!/COALESCE\(\$\{p\}\.entity_uuid::text,\s*\(SELECT COALESCE\(pe\.vendor_uuid, pe\.driver_uuid, pe\.payee_customer_uuid\)::text/.test(s.helper)) {
    p.push(`${F.helper}: the reader must keep the stored entity first, then the expense payee (vendor, driver, customer).`);
  }
  if (!/pe\.operating_company_id = \$\{p\}\.operating_company_id/.test(s.helper)) p.push(`${F.helper}: the document fallback must be same-company.`);
  if (!/source_transaction_type = 'expense'/.test(s.helper)) p.push(`${F.helper}: the fallback must read only the posting's own expense.`);
  const uses = (s.readers.match(/\$\{postingPartyUuidSql\("p"\)\} AS entity_uuid/g) ?? []).length;
  if (uses < 2) p.push(`${F.readers}: both journal-entry posting readers must read the party through postingPartyUuidSql (found ${uses}).`);
  if (/^\s*p\.entity_uuid::text,\s*$/m.test(s.readers)) p.push(`${F.readers}: a posting reader still returns the bare p.entity_uuid.`);
  return p;
}

export function liveVerdict({ expensePostings, unattributed, forwardBare }) {
  const p = [];
  if (expensePostings === 0) p.push("no expense postings were read — an empty read is unverifiable (RLS mask or empty DB), not a pass.");
  if (unattributed > 0) p.push(`${unattributed} expense posting(s) have no party although their expense names a payee.`);
  if (forwardBare > 0) p.push(`${forwardBare} expense posting(s) written since ${FORWARD_SINCE} carry no entity although their expense names a payee — the writer regressed.`);
  return p;
}

const src = { writer: read(F.writer), helper: read(F.helper), readers: read(F.readers) };

if (process.argv.includes("--selftest")) {
  let ok = true;
  const ex = (n, c) => { if (!c) { console.error(`SELFTEST FAIL: ${n}`); ok = false; } };
  ex("real sources pass", checkStatic(src).length === 0);
  ex("writer expense branch removed is caught",
    checkStatic({ ...src, writer: src.writer.replace("COALESCE(vendor_uuid::text, driver_uuid::text, payee_customer_uuid::text) AS e", "NULL AS e") }).length > 0);
  ex("helper without the document fallback is caught",
    checkStatic({ ...src, helper: src.helper.replace("(SELECT COALESCE(pe.vendor_uuid, pe.driver_uuid, pe.payee_customer_uuid)::text", "(SELECT NULL::text") }).length > 0);
  ex("helper without the same-company predicate is caught",
    checkStatic({ ...src, helper: src.helper.replace("pe.operating_company_id = ${p}.operating_company_id", "true") }).length > 0);
  ex("a reader back on bare p.entity_uuid is caught",
    checkStatic({ ...src, readers: src.readers.replace('${postingPartyUuidSql("p")} AS entity_uuid', "p.entity_uuid::text") }).length > 0);
  ex("empty read is not a pass", liveVerdict({ expensePostings: 0, unattributed: 0, forwardBare: 0 }).length > 0);
  ex("an unattributed posting fails", liveVerdict({ expensePostings: 10, unattributed: 1, forwardBare: 0 }).length > 0);
  ex("a forward bare posting fails", liveVerdict({ expensePostings: 10, unattributed: 0, forwardBare: 1 }).length > 0);
  ex("clean live read passes", liveVerdict({ expensePostings: 10, unattributed: 0, forwardBare: 0 }).length === 0);
  console.log(ok ? `${LABEL} --selftest PASS (9/9)` : `${LABEL} --selftest FAIL`);
  process.exit(ok ? 0 : 1);
}

const problems = checkStatic(src);
if (problems.length) {
  console.error(`${LABEL} FAILED (static):\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}

const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
try {
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  const payee = `COALESCE(e.vendor_uuid, e.driver_uuid, e.payee_customer_uuid)`;
  const r = (await client.query(
    `SELECT count(*)::int AS expense_postings,
            count(*) FILTER (WHERE ${payee} IS NOT NULL AND COALESCE(p.entity_uuid, ${payee}) IS NULL)::int AS unattributed,
            count(*) FILTER (WHERE ${payee} IS NOT NULL AND p.entity_uuid IS NULL AND p.created_at >= $1::timestamptz)::int AS forward_bare,
            count(*) FILTER (WHERE ${payee} IS NOT NULL AND p.entity_uuid IS NULL)::int AS attributed_by_document
       FROM accounting.journal_entry_postings p
       JOIN accounting.expenses e ON e.id::text = p.source_transaction_id::text AND e.operating_company_id = p.operating_company_id
      WHERE p.source_transaction_type = 'expense'`,
    [FORWARD_SINCE]
  )).rows[0];
  await client.query("ROLLBACK");
  const bad = liveVerdict({ expensePostings: r.expense_postings, unattributed: r.unattributed, forwardBare: r.forward_bare });
  if (bad.length) {
    console.error(`${LABEL} FAILED (live):\n  - ${bad.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — ${r.expense_postings} expense posting(s); 0 without a party; 0 written bare since ${FORWARD_SINCE}; ${r.attributed_by_document} legacy posting(s) attributed through their expense document (WORM: entity cannot be filled in place).`);
} finally {
  client.release();
  await pool.end();
}
