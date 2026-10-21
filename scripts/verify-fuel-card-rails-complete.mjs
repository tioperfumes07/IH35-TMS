#!/usr/bin/env node
// ROUND 443.200: exercise the actual resolver, then require every active USMCA card's role binding.
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { tsImport } from "tsx/esm/api";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB = "Active USMCA fuel cards and their designated accounts";
const U = "5c854333-6ea5-4faa-af31-67cb272fef80";
const root = process.env.FUEL_RAIL_SOURCE_ROOT || path.resolve(import.meta.dirname, "..");
const load = (p) => tsImport(pathToFileURL(path.join(root, p)).href, import.meta.url);
const preference = await load("apps/backend/src/accounting/fuel-posting/fuel-credit-preference.ts");
const account = await load("apps/backend/src/accounting/fuel-posting/company-direct-credit-account.ts");
const expected = {
  DREAMLINE: ["dreamline_card_payable", "fuel_card_payable_dreamline", "2510"],
  RELAY: ["relay_fuel_wallet", "fuel_wallet_relay", "1295"],
  WEX: ["wex_card_payable", "fuel_card_payable_wex", "2520"],
};

async function checkCode(code) {
  assert.ok(Object.hasOwn(expected, code), "Active fuel card has no declared rail");
  const [rail, role] = expected[code];
  const candidate = { operating_company_id: U, fuel_transaction_id: "isolated-selftest", fuel_type: "diesel", transaction_at: "2026-10-21", amount_cents: 100 };
  if (code === "RELAY") {
    assert.throws(() => preference.resolveCompanyDirectCreditPreference(candidate, { fuel_card_code: code }), preference.RelayFillLinksNotPostsError);
  } else {
    assert.equal(preference.resolveCompanyDirectCreditPreference(candidate, { fuel_card_code: code }), rail);
  }
  let calledRole;
  const mock = { query: async (_sql, values) => {
    assert.equal(values[0], U);
    calledRole = values[1];
    return { rows: [{ account_id: "resolved-account" }] };
  } };
  const result = await account.resolveCompanyDirectCreditAccount(mock, U, rail);
  assert.equal(calledRole, role);
  assert.equal(result.account_id, "resolved-account");
  assert.equal(result.source, `role:${role}`);
  return expected[code];
}

for (const code of Object.keys(expected)) await checkCode(code);
if (process.argv.includes("--selftest")) {
  await assert.rejects(checkCode("UNKNOWN"), /no declared rail/);
  await assert.rejects(account.resolveCompanyDirectCreditAccount({ query: async () => ({ rows: [] }) }, U, "wex_card_payable"));
  console.log("verify-fuel-card-rails-complete: SELFTEST PASS 5/5 (three real resolver paths, unknown code, unbound WEX)");
} else {
  const { client, pool } = await requireLiveDbOrExit({ label: "verify-fuel-card-rails-complete" });
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true), set_config('app.operating_company_id', $1, true)", [U]);
    const cards = await client.query("SELECT code FROM catalogs.fuel_card_types WHERE operating_company_id = $1::uuid AND is_active", [U]);
    assert.ok(cards.rows.length > 0, "No active cards: population not proven");
    let failures = 0;
    for (const { code } of cards.rows) {
      try {
        const [, role, number] = await checkCode(code);
        const bound = await client.query(`SELECT count(*)::int n FROM accounting.chart_of_accounts_roles r
          JOIN catalogs.accounts a ON a.id = r.account_id AND a.operating_company_id = $1::uuid
          WHERE r.operating_company_id = $1::uuid AND r.role = $2 AND r.is_active
            AND a.account_number = $3 AND a.is_postable AND a.deactivated_at IS NULL`, [U, role, number]);
        assert.equal(bound.rows[0].n, 1, "Expected exactly one active role binding to the designated account");
      } catch { failures++; }
    }
    await client.query("ROLLBACK");
    console.log(`verify-fuel-card-rails-complete: active_cards=${cards.rows.length} failures=${failures}`);
    assert.equal(failures, 0, "Active fuel card rail is missing or misbound");
  } finally {
    client.release();
    await pool.end();
  }
}
