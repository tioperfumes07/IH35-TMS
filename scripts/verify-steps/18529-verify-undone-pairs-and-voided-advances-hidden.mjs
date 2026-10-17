#!/usr/bin/env node
/**
 * LEAD 443.177–179 (owner 2026-10-16 18:23 / 18:29 CT). Four rules, each asserted against the live tree:
 *  1. views.factoring_recourse_at_risk and views.factoring_chargebacks_fees — the LATEST migration defining each excludes
 *     voided advances (voided FAC-2026-00001..00008 printed "Unknown Customer" on Aging / Submit invoice).
 *  2. The account register hides an undone pair (original + its full reversal) when both halves are in the window,
 *     unless include_reversed=true ("why would reversals appear here? … not like quickbooks").
 *  3. Banking renders the feed-pairing panels (Relay wallet hints, related-party pairs) only on an account with a feed —
 *     never on Faro reserves / factoring ("why would it appear in any cash reserves, faro").
 *  4. A factoring purchase link opens the purchase itself in the edit form ("click on it … take me to that purchase").
 *  5. A non-Plaid account with no bank lines (Faro reserves / factoring) reads its tile balance from its posted ledger,
 *     not a structural $0 (Banking tiles read $0.00 while Faro Escrow held $2,634.76).
 *  6. LEAD 443.180 — a click anywhere on a ParityTable row opens that row's record (transaction link first), app-wide
 *     ("the entire app must be like quickbooks, clickable and must take you somewhere").
 * --selftest: mutates each rule's source in memory and asserts the guard fails on every mutation.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => readFileSync(resolve(ROOT, p), "utf8");

function latestViewSql(view) {
  const dir = resolve(ROOT, "db/migrations");
  const files = readdirSync(dir).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();
  let hit = null;
  const re = new RegExp(`CREATE (OR REPLACE )?VIEW ${view.replace(".", "\\.")}\\b`, "i");
  for (const f of files) {
    const sql = readFileSync(resolve(dir, f), "utf8");
    const m = sql.search(re);
    if (m >= 0) {
      const rest = sql.slice(m);
      const end = rest.indexOf(";");
      hit = { file: f, sql: end >= 0 ? rest.slice(0, end) : rest };
    }
  }
  return hit;
}

function load() {
  return {
    recourse: latestViewSql("views.factoring_recourse_at_risk"),
    fees: latestViewSql("views.factoring_chargebacks_fees"),
    service: read("apps/backend/src/accounting/account-register.service.ts"),
    routes: read("apps/backend/src/accounting/account-register.routes.ts"),
    banking: read("apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx"),
    entity: read("apps/frontend/src/components/shared/EntityLink.tsx"),
    wallet: read("apps/backend/src/banking/internal-wallet-balance.ts"),
    parity: read("apps/frontend/src/components/parity/ParityTable.tsx"),
  };
}

function check(s) {
  const f = [];
  for (const [name, def] of [["factoring_recourse_at_risk", s.recourse], ["factoring_chargebacks_fees", s.fees]]) {
    if (!def) { f.push(`no migration defines views.${name}`); continue; }
    if (!/fa\.voided_at IS NULL/i.test(def.sql) || !/status IS DISTINCT FROM 'voided'/i.test(def.sql)) {
      f.push(`${def.file}: views.${name} still reads voided advances`);
    }
  }
  if (!/if \(!input\.include_reversed\)[\s\S]{0,400}rv\.reverses_je_id = je\.id[\s\S]{0,600}og\.id = je\.reverses_je_id/.test(s.service)) {
    f.push("account-register.service.ts: undone pairs (original + full reversal) are not hidden by default");
  }
  if (!/include_reversed: query\.data\.include_reversed === "true"/.test(s.routes)) {
    f.push("account-register.routes.ts: include_reversed is not wired from the query");
  }
  if (!/\{feedlessAccountId \? null : \(\s*<>\s*<RelayDepositCategorizedMatchHintsPanel[\s\S]{0,120}<RelatedPartyPairSuggestionsPanel/.test(s.banking)) {
    f.push("BankingTransactionsDesignView.tsx: feed-pairing panels render on a feedless (Faro / reserve) account");
  }
  if (!/case "factoring_purchase":[\s\S]{0,500}return `\/factoring\/submit-invoice\?edit_purchase_id=/.test(s.entity)) {
    f.push("EntityLink.tsx: factoring_purchase does not open the purchase in its edit form");
  }
  if (!/const feedless = bankAccountIds\.filter\(\(id\) => !map\.has\(id\)\);[\s\S]{0,1600}JOIN accounting\.journal_entry_postings p[\s\S]{0,400}je\.status = 'posted'/.test(s.wallet)) {
    f.push("internal-wallet-balance.ts: a feedless non-Plaid account (Faro reserve / factoring) still reads a structural $0 tile balance");
  }
  if (!/: \(event\) => \{\s*openParityRowPrimaryLink\(event\.currentTarget, event\.target\);\s*\}\}/.test(s.parity)
      || !/anchors\.find\(\(a\) => !ROW_MASTER_DATA_HREF_RE\.test/.test(s.parity)) {
    f.push("ParityTable.tsx: a row click no longer opens the row's record (transaction link first)");
  }
  return f;
}

const live = load();
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["recourse view without void filter", { ...live, recourse: live.recourse && { ...live.recourse, sql: live.recourse.sql.replace(/AND fa\.voided_at IS NULL/i, "") } }],
    ["fees view without void filter", { ...live, fees: live.fees && { ...live.fees, sql: live.fees.sql.replace(/status IS DISTINCT FROM 'voided'/i, "true") } }],
    ["register shows undone pairs", { ...live, service: live.service.replace("if (!input.include_reversed)", "if (false)") }],
    ["include_reversed unwired", { ...live, routes: live.routes.replace('include_reversed: query.data.include_reversed === "true"', "") }],
    ["panels on feedless accounts", { ...live, banking: live.banking.replace("{feedlessAccountId ? null : (", "{(") }],
    ["feedless tile balance back to $0", { ...live, wallet: live.wallet.replace("const feedless = bankAccountIds.filter((id) => !map.has(id));", "const feedless = [];") }],
    ["row click opens nothing", { ...live, parity: live.parity.replace("openParityRowPrimaryLink(event.currentTarget, event.target);", "void event;") }],
    ["purchase link back to the list", { ...live, entity: live.entity.replace("/factoring/submit-invoice?edit_purchase_id=", "/factoring/payments-to-you?purchase_id=") }],
  ];
  for (const [label, m] of mutations) {
    if (!check(m).length) { console.error(`SELFTEST FAIL: ${label} not caught`); process.exit(1); }
  }
  console.log(`SELFTEST PASS: ${mutations.length}/${mutations.length} mutations caught`);
  process.exit(0);
}
const findings = check(live);
if (findings.length) {
  console.error(`verify-undone-pairs-and-voided-advances-hidden FAIL (${findings.length}):`);
  for (const x of findings) console.error(`  ${x}`);
  process.exit(1);
}
console.log("verify-undone-pairs-and-voided-advances-hidden PASS: 6 rules hold on the live tree");
