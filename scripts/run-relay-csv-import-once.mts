/**
 * One-shot: Relay "All Transactions" CSV → integrations.relay_deposits (+ optional fuel)
 * and wallet Received mirror via upsertRelayDeposit → upsertRelayWalletDepositFeedRow.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/run-relay-csv-import-once.mts \
 *     "/path/to/All Transactions CSV.csv" [--deposits-only]
 *
 * Default TRANSP. Does NOT post GL. Idempotent on deposit_id / fuel transaction_id.
 */
import fs from "node:fs";
import pg from "pg";
import { loadCompanyCardSet, upsertRelayDeposit } from "../apps/backend/src/integrations/relay-payments/relay-deposit-classifier.service.ts";
import { parseRelayFuelTransactionRow } from "../apps/backend/src/integrations/relay-payments/relay-client.ts";
import { upsertRelayFuelTransaction } from "../apps/backend/src/integrations/relay-payments/relay-fuel-ingest.service.ts";

const TRANSP = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";
// POOLER LANDMINE (verified on prod 2026-08-04). This script sets SESSION-scoped GUCs
// (set_config(..., false)) and then relies on them across later statements. Neon's `-pooler` endpoint
// pools in TRANSACTION mode, so consecutive statements — even on a single dedicated client — can land
// on different server backends. The GUC is then absent, and because the tables are FORCE-RLS the query
// returns ZERO ROWS instead of erroring. A backfill silently processes nothing, or part of the set,
// and reports success. This exact failure skipped a row in the ACCT-F101 fuel reclass dry run.
// Prefer the DIRECT endpoint, where session state is stable; refuse the pooler rather than produce a
// silently-wrong answer.
const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL required");
if (/-pooler\./.test(url)) {
  throw new Error(
    "REFUSING to run against the -pooler endpoint: this script uses session-scoped app.bypass_rls, " +
      "which does not survive transaction pooling. Under FORCE-RLS that yields ZERO ROWS silently. " +
      "Re-run with DATABASE_DIRECT_URL pointing at the direct (non-pooler) endpoint."
  );
}

const csvPath = process.argv[2];
if (!csvPath) throw new Error("CSV path required as argv[2]");
const depositsOnly = process.argv.includes("--deposits-only");

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (inQ) {
      if (c === '"' && n === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\r") { /* skip */ }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const FUEL_TYPES = ["diesel", "def", "reefer", "reefer_2", "def_forecourt"];
const S = (v: string | undefined): string | null => {
  const t = String(v ?? "").trim();
  return t.length ? t : null;
};

function toIso(v: string | undefined, fallbackDate: string | undefined): string | null {
  const m = String(v ?? "").trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?\s*([+-]\d{4})?/);
  if (m) return `${m[1]}T${m[2]}${m[3] ? `${m[3].slice(0, 3)}:${m[3].slice(3)}` : "+00:00"}`;
  const d = String(fallbackDate ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T00:00:00+00:00` : null;
}

function csvRowToApiShape(g: (name: string) => string | undefined): Record<string, unknown> | null {
  const id = S(g("id"));
  if (!id) return null;
  const rowType = (S(g("type")) ?? "").toLowerCase();
  if (rowType !== "code") return null;
  const rowStatus = (S(g("status")) ?? "").toLowerCase();
  if (rowStatus === "canceled" || rowStatus === "cancelled" || rowStatus === "voided") return null;
  const created_at = toIso(g("processing time"), g("work_date"));
  if (!created_at) return null;
  const fuel_items: Record<string, unknown>[] = [];
  let retailSum = 0, hasRetail = false;
  for (const ft of FUEL_TYPES) {
    const vol = S(g(`volume ${ft}`));
    const totalGross = S(g(`total_gross ${ft}`));
    const totalPrice = S(g(`total_price ${ft}`));
    if (vol == null && totalGross == null && totalPrice == null) continue;
    const tg = Number(totalGross);
    if (Number.isFinite(tg)) { retailSum += tg; hasRetail = true; }
    fuel_items.push({
      fuel_type: ft, volume: vol, volume_uom: "gallon",
      retail_price_per_unit: S(g(`retail_price ${ft}`)),
      discounted_price_per_unit: S(g(`discounted_price ${ft}`)),
      total_retail_price: totalGross, total_discounted_price: totalPrice,
    });
  }
  const amount = Number(S(g("amount")) ?? "");
  if (fuel_items.length === 0 && Number.isFinite(amount) && amount > 0) {
    fuel_items.push({ fuel_type: "other", volume: null, volume_uom: null, total_discounted_price: S(g("amount")), total_retail_price: S(g("amount")) });
  }
  const prompts = ([["Truck #", "Truck #"], ["Load #", "Load #"], ["Odometer", "Odometer"], ["Trailer #", "Trailer #"], ["Trip #", "Trip #"], ["Driver #", "Driver #"]] as const)
    .map(([label, col]) => ({ label, value: S(g(col)) }))
    .filter((p) => p.value != null) as { label: string; value: string }[];
  const relayDriverId = S(g("relay driver id"));
  const name = (S(g("driver")) ?? "").split(/\s+/);
  const total = S(g("total"));
  return {
    transaction_id: id, created_at, relay_fuel_code: S(g("relay code")),
    total_amount_paid: total ?? "0", total_retail_price: hasRetail ? String(retailSum) : (total ?? "0"),
    currency_code: "USD", is_direct_bill: false, cash_advance: false, fuel_code_type: S(g("sub-type")),
    linked_org: { name: S(g("organization")) },
    driver: relayDriverId || name[0]
      ? { id: relayDriverId, integration_id: relayDriverId, first_name: S(name[0]), last_name: name.slice(1).join(" ") || null, phone: S(g("driver_phone_number")) }
      : null,
    merchant: { name: S(g("merchant_name")) ?? S(g("location")) },
    location: { name: S(g("location")), address: S(g("location_address")), city: S(g("location_city")), state: S(g("location_state")), zip_code: S(g("location_zip")) },
    prompts, fuel_items,
    fees: S(g("fee")) && Number(g("fee")) > 0 ? [{ type: "relay_fee", amount: S(g("fee")) }] : [],
    products: S(g("products")) ? [{ name: S(g("products")) }] : [],
  };
}

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

try {
  await client.query(`SELECT set_config('app.bypass_rls','lucia',false)`);
  await client.query(`SELECT set_config('app.operating_company_id',$1,false)`, [TRANSP]);

  const beforeDep = await client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM integrations.relay_deposits WHERE operating_company_id=$1::uuid`,
    [TRANSP],
  );
  const beforeBank = await client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM banking.bank_transactions
     WHERE operating_company_id=$1::uuid AND source_ref LIKE 'relay_deposit:%'`,
    [TRANSP],
  );
  console.log(JSON.stringify({ before_deposits: beforeDep.rows[0].n, before_bank_deposit: beforeBank.rows[0].n, depositsOnly }));

  const text = fs.readFileSync(csvPath, "utf8");
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("no data rows");
  const header = rows[0].map((h) => h.trim());
  const idx = new Map(header.map((h, i) => [h, i]));
  const companyCards = await loadCompanyCardSet(client, TRANSP);

  let deposits = 0, depositCompany = 0, depositUnclassified = 0, depositCanceled = 0;
  let imported = 0, skipped = 0, failed = 0;

  await client.query("BEGIN");
  try {
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length < 3) continue;
      const g = (name: string) => (idx.has(name) ? r[idx.get(name)!] : undefined);
      const rowType = String(g("type") ?? "").trim().toLowerCase();

      if (rowType === "deposit") {
        const depId = String(g("id") ?? "").trim();
        const created = toIso(g("processing time"), g("work_date"));
        const total = g("total") ?? g("amount");
        if (!depId || !created || total == null || String(total).trim() === "") { skipped++; continue; }
        const rowObj: Record<string, string> = {};
        for (const [h, ci] of idx) rowObj[h] = r[ci] ?? "";
        try {
          const dres = await upsertRelayDeposit(
            client, TRANSP,
            { deposit_id: depId, relay_created_at: created, status: String(g("status") ?? ""), total_amount: String(total), note: (g("Note") ?? null) as string | null, raw: rowObj },
            companyCards, "csv_import",
          );
          deposits++;
          if (dres.classification === "company") depositCompany++;
          else if (dres.classification === "unclassified") depositUnclassified++;
          else if (dres.classification === "canceled") depositCanceled++;
        } catch (err) {
          failed++;
          console.error("deposit_fail", depId, err instanceof Error ? err.message : err);
        }
        continue;
      }

      if (depositsOnly) continue;

      const raw = csvRowToApiShape(g);
      const tx = raw ? parseRelayFuelTransactionRow(raw) : null;
      if (!tx) { skipped++; continue; }
      try {
        await upsertRelayFuelTransaction(client, TRANSP, tx, "csv_import");
        imported++;
      } catch (err) {
        failed++;
        console.error("fuel_fail", tx.transaction_id, err instanceof Error ? err.message : err);
      }
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }

  const afterDep = await client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM integrations.relay_deposits WHERE operating_company_id=$1::uuid`,
    [TRANSP],
  );
  const afterBank = await client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM banking.bank_transactions
     WHERE operating_company_id=$1::uuid AND source_ref LIKE 'relay_deposit:%' AND is_credit = true`,
    [TRANSP],
  );

  console.log(JSON.stringify({
    deposits, depositCompany, depositUnclassified, depositCanceled,
    imported_fuel: imported, skipped, failed,
    after_deposits: afterDep.rows[0].n,
    after_bank_deposit_received: afterBank.rows[0].n,
  }, null, 2));
} finally {
  client.release();
  await pool.end();
}
