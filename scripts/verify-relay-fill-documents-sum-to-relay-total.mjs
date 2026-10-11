#!/usr/bin/env node
// ROUND 443.29 a (owner 2026-10-10 7:15 PM CT): a Relay fill posts one fuel line per product + ONE fee line on "Fuel Card
// Fees" (5005) for the fee RELAY REPORTS, crediting "Relay Fuel Wallet" (1295) = Relay's total to the cent.
// Measured 2026-10-11: the poster resolves the fee leg by the item "Fuel Card Fee", which existed in no company — so no
// Relay fill with a fee could ever post (0 fuel_event postings on 1295).
//
// Static:
//   1. the bank-match poster, ingest and the wallet backfill all take the fee from relayFillFeeCents (Relay's fees[]
//      first, line fees only when empty) and the wallet amount from relayWalletDrawdownCents — one rule, three callers;
//   2. the poster refuses when product lines do not foot to Relay's paid amount (never a plug);
//   3. the migration seeding "Fuel Card Fee" -> 5005 is present.
// Live (USMCA): the "Fuel Card Fee" item exists and maps to 5005; every posted Relay fill journal entry credits 1295 =
//   paid + fee to the cent, and carries a 5005 fee line whenever Relay reported a fee.
// --selftest plants each regression.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
export const REQUIRES_LIVE_DB = "reads USMCA catalogs.items, relay fills and their fuel_event postings";

const LABEL = "verify-relay-fill-documents-sum-to-relay-total";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const FILES = {
  poster: "apps/backend/src/accounting/bank-recon/bank-match-fuel-post.service.ts",
  ingest: "apps/backend/src/integrations/relay-payments/relay-fuel-ingest.service.ts",
  backfill: "apps/backend/src/integrations/relay-payments/relay-wallet-bank-feed.service.ts",
  migration: "db/migrations/202615490300_usmca_fuel_card_fee_item.sql",
  deposit: "apps/backend/src/integrations/relay-payments/relay-deposit-post.service.ts",
  importRoute: "apps/backend/src/integrations/relay-payments/relay-fuel-csv-import.routes.ts",
  rollForward: "apps/backend/src/integrations/relay-payments/relay-wallet-roll-forward.service.ts",
};

export function check(src) {
  const f = [];
  for (const k of ["poster", "ingest", "backfill"]) {
    if (!/relayFillFeeCents\(\{/.test(src[k] ?? "")) f.push(`${FILES[k]}: fee must come from relayFillFeeCents (Relay's reported fee)`);
    if (!/relayWalletDrawdownCents\(/.test(src[k] ?? "")) f.push(`${FILES[k]}: wallet amount must come from relayWalletDrawdownCents`);
  }
  if (/fee_amount_cents, 0\)\)[\s\S]{0,200}AS fee_cents/.test(src.backfill ?? "")) f.push(`${FILES.backfill}: wallet backfill sums line fees only again`);
  if (!/relay_fill_lines_do_not_foot/.test(src.poster ?? "")) f.push(`${FILES.poster}: product lines must foot to Relay's paid amount (refuse, never plug)`);
  if (!/'Fuel Card Fee'/.test(src.migration ?? "") || !/account_number = '5005'/.test(src.migration ?? "")) f.push(`${FILES.migration}: must seed "Fuel Card Fee" -> 5005`);
  // ROUND 443.29 b — deposits.
  const dep = src.deposit ?? "";
  if (!/amount \+ fee !== total \|\| total !== stored/.test(dep)) f.push(`${FILES.deposit}: a deposit must refuse unless amount + fee = charged = stored`);
  if (!/if \(String\(d\.status\)\.toLowerCase\(\) !== "settled"\) return \{ outcome: "not_settled"/.test(dep)) f.push(`${FILES.deposit}: only a settled deposit may post`);
  if (!/reason: "card_owner_not_named"/.test(dep)) f.push(`${FILES.deposit}: an unnamed card must be held, never guessed`);
  if (!/"relay_fuel_wallet"[\s\S]{0,200}"5005"/.test(dep)) f.push(`${FILES.deposit}: deposit must debit 1295 and the fee on 5005`);
  if (!/postRelayDeposit\(/.test(src.importRoute ?? "")) f.push(`${FILES.importRoute}: settled deposits must post on import`);
  // ROUND 443.29 c — roll-forward.
  const rfw = src.rollForward ?? "";
  if (!/relayFillFeeCents\(\{/.test(rfw)) f.push(`${FILES.rollForward}: fill fees must come from relayFillFeeCents`);
  if (!/bal \+= x\.deposits_cents - x\.fills_cents - x\.fill_fees_cents - x\.lumper_cents;/.test(rfw)) f.push(`${FILES.rollForward}: balance must be deposits − fills − fill fees − lumper (the deposit fee is charged to the card, never the wallet)`);
  return f;
}

/** deposits: [{ deposit_id, charged_cents, dr_1295, dr_5005, cr_total }] for posted deposits */
export function judgeDeposits(rows) {
  const f = [];
  for (const r of rows) {
    if (r.dr_1295 + r.dr_5005 !== r.cr_total) f.push(`deposit ${r.deposit_id}: debits ${r.dr_1295}+${r.dr_5005} != credit ${r.cr_total}`);
    if (r.cr_total !== r.charged_cents) f.push(`deposit ${r.deposit_id}: credit ${r.cr_total} != amount charged ${r.charged_cents}`);
  }
  return f;
}

/** rows: [{ fill_id, paid_cents, fee_cents, credit_1295_cents, fee_line_cents }] for posted fills */
export function judgeLive(item, rows) {
  const f = [];
  if (!item) f.push(`USMCA has no "Fuel Card Fee" item — no Relay fill with a fee can post (migration 202615490300 not applied)`);
  else if (item.account_number !== "5005") f.push(`"Fuel Card Fee" maps to ${item.account_number ?? "no account"}, not 5005 Fuel Card Fees`);
  for (const r of rows) {
    if (r.credit_1295_cents !== r.paid_cents + r.fee_cents) f.push(`fill ${r.fill_id}: 1295 credit ${r.credit_1295_cents} != paid ${r.paid_cents} + fee ${r.fee_cents}`);
    if (r.fee_cents > 0 && r.fee_line_cents !== r.fee_cents) f.push(`fill ${r.fill_id}: Relay fee ${r.fee_cents} but fee line on 5005 = ${r.fee_line_cents}`);
  }
  return f;
}

const read = () => Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, fs.existsSync(path.join(ROOT, p)) ? fs.readFileSync(path.join(ROOT, p), "utf8") : ""]));

if (process.argv.includes("--selftest")) {
  const real = read();
  const fails = [];
  if (check(real).length) fails.push(`tree not clean: ${check(real).join("; ")}`);
  const plants = [
    ["backfill sums line fees only", { ...real, backfill: real.backfill.replace("relayFillFeeCents({", "lineFeesOnly({") }],
    ["poster plugs the difference", { ...real, poster: real.poster.replace(/relay_fill_lines_do_not_foot/g, "relay_fill_ok") }],
    ["ingest fee constant", { ...real, ingest: real.ingest.replace(/relayFillFeeCents\(\{/g, "constantFee({") }],
    ["migration missing", { ...real, migration: "" }],
    ["deposit plugs a mismatch", { ...real, deposit: real.deposit.replace("amount + fee !== total || total !== stored", "false") }],
    ["deposit guesses unnamed cards", { ...real, deposit: real.deposit.replace(/reason: "card_owner_not_named"/g, 'reason: "guessed"') }],
    ["canceled deposit posts", { ...real, deposit: real.deposit.replace('if (String(d.status).toLowerCase() !== "settled") return { outcome: "not_settled"', 'if (false) return { outcome: "not_settled"') }],
    ["import does not post", { ...real, importRoute: real.importRoute.replace(/postRelayDeposit\(/g, "noop(") }],
    ["deposit fee taken from the wallet", { ...real, rollForward: real.rollForward.replace("bal += x.deposits_cents - x.fills_cents", "bal += x.deposits_cents - x.deposit_fees_cents - x.fills_cents") }],
    ["roll-forward fee constant", { ...real, rollForward: real.rollForward.replace("relayFillFeeCents({", "constantFee({") }],
  ];
  for (const [name, s] of plants) if (check(s).length === 0) fails.push(`plant escaped: ${name}`);
  const ok = { account_number: "5005" };
  if (judgeLive(ok, [{ fill_id: "a", paid_cents: 61616, fee_cents: 200, credit_1295_cents: 61816, fee_line_cents: 200 }]).length) fails.push("a tied fill flagged");
  const livePlants = [
    ["no fee item", null, []],
    ["fee item on wrong account", { account_number: "5000" }, []],
    ["credit short the fee", ok, [{ fill_id: "a", paid_cents: 61616, fee_cents: 200, credit_1295_cents: 61616, fee_line_cents: 0 }]],
    ["fee line missing", ok, [{ fill_id: "a", paid_cents: 61616, fee_cents: 200, credit_1295_cents: 61816, fee_line_cents: 0 }]],
  ];
  for (const [name, item, rows] of livePlants) if (judgeLive(item, rows).length === 0) fails.push(`live plant escaped: ${name}`);
  if (judgeDeposits([{ deposit_id: "d", charged_cents: 722750, dr_1295: 700000, dr_5005: 22750, cr_total: 722750 }]).length) fails.push("a tied deposit flagged");
  if (judgeDeposits([{ deposit_id: "d", charged_cents: 722750, dr_1295: 700000, dr_5005: 0, cr_total: 700000 }]).length === 0) fails.push("deposit without its fee escaped");
  const n = plants.length + livePlants.length + 3;
  if (fails.length) { console.error(`${LABEL} --selftest FAIL: ${fails.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${n}/${n}`);
  process.exit(0);
}

const staticFails = check(read());
if (staticFails.length) { console.error(`${LABEL}: FAIL\n  ${staticFails.join("\n  ")}`); process.exit(1); }
if (!process.env.DATABASE_URL) { console.error(`${LABEL}: FAIL — static passed; the live check needs DATABASE_URL`); process.exit(1); }
const { default: pg } = await import("pg");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000, statement_timeout: 60000 });
try {
  await c.connect();
  await c.query("BEGIN READ ONLY");
  await c.query("SET LOCAL app.bypass_rls = 'lucia'");
  const item = (await c.query(
    `SELECT a.account_number FROM catalogs.items i LEFT JOIN catalogs.accounts a ON a.id = i.default_expense_account_id
      WHERE i.operating_company_id = $1::uuid AND i.item_name = 'Fuel Card Fee' AND i.deactivated_at IS NULL LIMIT 1`, [USMCA])).rows[0] ?? null;
  const rows = (await c.query(
    `WITH posted AS (
       SELECT p.source_transaction_id AS fill_id,
              sum(CASE WHEN a.account_number = '1295' THEN (CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE -p.amount_cents END) ELSE 0 END)::bigint AS credit_1295_cents,
              sum(CASE WHEN a.account_number = '5005' THEN (CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END) ELSE 0 END)::bigint AS fee_line_cents
         FROM accounting.journal_entry_postings p
         JOIN catalogs.accounts a ON a.id = p.account_id
        WHERE a.operating_company_id = $1::uuid AND p.source_transaction_type = 'fuel_event'
          AND p.reversed_by_line_id IS NULL AND p.reversal_of_line_id IS NULL
          AND p.source_transaction_id IN (SELECT id::text FROM integrations.relay_fuel_transactions WHERE operating_company_id = $1::uuid)
        GROUP BY 1)
     SELECT r.transaction_id AS fill_id, abs(r.total_amount_paid_cents)::bigint AS paid_cents,
            COALESCE((SELECT sum(round((f->>'amount')::numeric * 100)) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r.fees) = 'array' THEN r.fees ELSE '[]'::jsonb END) f), 0)::bigint AS fee_cents,
            posted.credit_1295_cents, posted.fee_line_cents
       FROM posted JOIN integrations.relay_fuel_transactions r ON r.id::text = posted.fill_id`, [USMCA])).rows
    .map((r) => ({ ...r, paid_cents: Number(r.paid_cents), fee_cents: Number(r.fee_cents), credit_1295_cents: Number(r.credit_1295_cents), fee_line_cents: Number(r.fee_line_cents) }));
  const deps = (await c.query(
    `SELECT d.deposit_id, d.total_amount_cents::bigint AS charged_cents,
            sum(CASE WHEN a.account_number = '1295' AND p.debit_or_credit = 'debit' THEN p.amount_cents ELSE 0 END)::bigint AS dr_1295,
            sum(CASE WHEN a.account_number = '5005' AND p.debit_or_credit = 'debit' THEN p.amount_cents ELSE 0 END)::bigint AS dr_5005,
            sum(CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE 0 END)::bigint AS cr_total
       FROM accounting.journal_entry_postings p
       JOIN catalogs.accounts a ON a.id = p.account_id
       JOIN integrations.relay_deposits d ON d.id::text = p.source_transaction_id
      WHERE p.operating_company_id = $1::uuid AND p.source_transaction_type = 'relay_deposit'
        AND p.reversed_by_line_id IS NULL AND p.reversal_of_line_id IS NULL
      GROUP BY 1, 2`, [USMCA])).rows.map((r) => ({ deposit_id: r.deposit_id, charged_cents: Number(r.charged_cents), dr_1295: Number(r.dr_1295), dr_5005: Number(r.dr_5005), cr_total: Number(r.cr_total) }));
  await c.query("ROLLBACK");
  const bad = [...judgeLive(item, rows), ...judgeDeposits(deps)];
  if (bad.length) { console.error(`${LABEL}: FAIL (${bad.length})\n  ${bad.slice(0, 30).join("\n  ")}`); process.exit(1); }
  console.log(`${LABEL}: PASS — "Fuel Card Fee" -> 5005; ${rows.length} posted Relay fill(s) each credit 1295 = paid + fee and carry the fee line; ${deps.length} posted deposit(s) each Dr 1295 + Dr 5005 fee = Cr = amount charged`);
} catch (err) {
  console.error(`${LABEL}: FAIL — live check could not run: ${err.message}`);
  process.exit(1);
} finally {
  await c.end().catch(() => {});
}
