#!/usr/bin/env node
/**
 * verify-every-credit-document-posts — ROUND 373.4, CC-1.
 *
 * A credit memo (Dr the income it reduces / Cr A/R) and a manual vendor credit (Dr A/P / Cr the expense it reduces) post
 * at creation, on the creating transaction, through the canonical engine; void reverses through the engine. A document
 * posts through its own poster EXACTLY when it names its account (credit_memos.account_id / vendor_credits.account_id);
 * credits whose GL is owned elsewhere (payment overpayment, Faro short-pay write-down, QBO mirrors) name none.
 *
 * STATIC:
 *   RULE 1 — credit-memos.routes.ts and vendor-credits.routes.ts post their own source type in-transaction on create
 *            (postSourceTransactionInClientTx) and reverse it on void (reversePostedSourceTransactionInClientTx); the
 *            engine dispatches both source types.
 * LIVE (direct endpoint, unscoped, read-only), once migration 202615370000 is applied:
 *   RULE 2 — 0 live credit memos naming an account without a 'credit_memo' posting.
 *   RULE 3 — 0 live vendor credits naming an account without a 'vendor_credit' posting.
 * --selftest exercises every rule.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB = "credit documents move A/R and A/P — fails closed without a database";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-every-credit-document-posts";

export function staticFailures(read = (p) => readFileSync(join(ROOT, p), "utf8")) {
  const out = [];
  for (const [file, type] of [["apps/backend/src/accounting/credit-memos.routes.ts", "credit_memo"], ["apps/backend/src/accounting/vendor-credits.routes.ts", "vendor_credit"]]) {
    const src = read(file);
    // LST-F414: a vendor credit's create is the one writer createVendorCreditInClientTx (vendor-credits.service.ts),
    // shared by the route and the insurance refund / fleet-remove posters — the route must call it and it must post.
    const postsHere = new RegExp(`postSourceTransactionInClientTx\\([\\s\\S]{0,240}?source_transaction_type:\\s*"${type}"`);
    const delegated =
      type === "vendor_credit" &&
      /await createVendorCreditInClientTx\(client/.test(src) &&
      postsHere.test(read("apps/backend/src/accounting/vendor-credits.service.ts"));
    if (!postsHere.test(src) && !delegated) out.push(`RULE 1 ${file}: create does not post "${type}" on its own transaction`);
    if (!new RegExp(`reversePostedSourceTransactionInClientTx\\([\\s\\S]{0,240}?source_transaction_type:\\s*"${type}"`).test(src)) out.push(`RULE 1 ${file}: void does not reverse "${type}" through the engine`);
  }
  const engine = read("apps/backend/src/accounting/posting-engine.service.ts");
  for (const type of ["credit_memo", "vendor_credit"]) {
    if (!new RegExp(`sourceType === "${type}"\\) return build`).test(engine)) out.push(`RULE 1 posting engine does not dispatch "${type}"`);
  }
  return out;
}

export function liveFailures(m) {
  const out = [];
  if (m.applied && m.unpostedMemos > 0) out.push(`RULE 2 ${m.unpostedMemos} live credit memo(s) name an account but carry no credit_memo posting`);
  if (m.applied && m.unpostedVendorCredits > 0) out.push(`RULE 3 ${m.unpostedVendorCredits} live vendor credit(s) name an account but carry no vendor_credit posting`);
  return out;
}

async function measure(client) {
  await client.query("BEGIN READ ONLY");
  await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
  const applied = (await client.query(`SELECT 1 FROM _system._schema_migrations WHERE filename LIKE '202615370000%'`)).rows.length > 0;
  let unpostedMemos = 0, unpostedVendorCredits = 0;
  if (applied) {
    unpostedMemos = (await client.query(`
      SELECT count(*)::int AS n FROM accounting.credit_memos c
       WHERE c.account_id IS NOT NULL AND c.voided_at IS NULL AND COALESCE(c.status, '') <> 'voided'
         AND NOT EXISTS (SELECT 1 FROM accounting.journal_entry_postings p WHERE p.source_transaction_type = 'credit_memo' AND p.source_transaction_id = c.id::text)`)).rows[0].n;
    unpostedVendorCredits = (await client.query(`
      SELECT count(*)::int AS n FROM accounting.vendor_credits v
       WHERE v.account_id IS NOT NULL AND v.voided_at IS NULL AND COALESCE(v.status, '') <> 'voided'
         AND NOT EXISTS (SELECT 1 FROM accounting.journal_entry_postings p WHERE p.source_transaction_type = 'vendor_credit' AND p.source_transaction_id = v.id::text)`)).rows[0].n;
  }
  await client.query("ROLLBACK");
  return { applied, unpostedMemos, unpostedVendorCredits };
}

export function run() {
  return staticFailures();
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    const good = {
      "apps/backend/src/accounting/credit-memos.routes.ts": 'postSourceTransactionInClientTx(client, { operating_company_id: x, source_transaction_type: "credit_memo" }) reversePostedSourceTransactionInClientTx(client, { operating_company_id: x, source_transaction_type: "credit_memo" })',
      "apps/backend/src/accounting/vendor-credits.routes.ts": 'postSourceTransactionInClientTx(client, { operating_company_id: x, source_transaction_type: "vendor_credit" }) reversePostedSourceTransactionInClientTx(client, { operating_company_id: x, source_transaction_type: "vendor_credit" })',
      "apps/backend/src/accounting/posting-engine.service.ts": 'if (sourceType === "vendor_credit") return buildX(); if (sourceType === "credit_memo") return buildY();',
      "apps/backend/src/accounting/vendor-credits.service.ts": "",
    };
    // LST-F414 shape: the route delegates create to the one writer, which posts.
    const delegatedGood = {
      ...good,
      "apps/backend/src/accounting/vendor-credits.routes.ts": 'await createVendorCreditInClientTx(client, {}) reversePostedSourceTransactionInClientTx(client, { operating_company_id: x, source_transaction_type: "vendor_credit" })',
      "apps/backend/src/accounting/vendor-credits.service.ts": 'postSourceTransactionInClientTx(client, { operating_company_id: x, source_transaction_type: "vendor_credit" })',
    };
    const cases = [
      ["static clean passes", staticFailures((p) => good[p]).length === 0],
      ["a create that does not post fails", staticFailures((p) => good[p].replace('postSourceTransactionInClientTx(client, { operating_company_id: x, source_transaction_type: "credit_memo" })', "")).some((x) => x.startsWith("RULE 1"))],
      ["a void that does not reverse fails", staticFailures((p) => good[p].replace('reversePostedSourceTransactionInClientTx(client, { operating_company_id: x, source_transaction_type: "vendor_credit" })', "")).some((x) => x.startsWith("RULE 1"))],
      ["a create delegated to the one writer passes", staticFailures((p) => delegatedGood[p]).length === 0],
      ["a delegated writer that does not post fails", staticFailures((p) => (p.endsWith("vendor-credits.service.ts") ? "" : delegatedGood[p])).some((x) => x.startsWith("RULE 1"))],
      ["an engine without the dispatch fails", staticFailures((p) => good[p].replace('if (sourceType === "credit_memo") return buildY();', "")).some((x) => x.startsWith("RULE 1"))],
      ["live clean passes", liveFailures({ applied: true, unpostedMemos: 0, unpostedVendorCredits: 0 }).length === 0],
      ["an unposted credit memo fails", liveFailures({ applied: true, unpostedMemos: 1, unpostedVendorCredits: 0 }).some((x) => x.startsWith("RULE 2"))],
      ["an unposted vendor credit fails", liveFailures({ applied: true, unpostedMemos: 0, unpostedVendorCredits: 1 }).some((x) => x.startsWith("RULE 3"))],
    ];
    for (const [n, ok] of cases) console.log(`  ${ok ? "✓" : "✗"} ${n}`);
    const bad = cases.filter(([, ok]) => !ok).length;
    console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
    process.exit(bad ? 1 : 0);
  }
  const sf = run();
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    const m = await measure(client);
    const all = [...sf, ...liveFailures(m)];
    if (all.length) { console.error(`${LABEL}: FAIL\n  ${all.join("\n  ")}`); process.exitCode = 1; }
    else console.log(`${LABEL}: OK — credit memos and vendor credits post on create and reverse on void; ${m.applied ? `${m.unpostedMemos} unposted credit memo(s), ${m.unpostedVendorCredits} unposted vendor credit(s) naming an account` : "202615370000 not applied on this database yet — static rule only"}.`);
  } finally {
    client.release?.();
    await pool?.end?.();
  }
}
