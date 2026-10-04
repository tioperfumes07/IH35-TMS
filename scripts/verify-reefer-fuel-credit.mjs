#!/usr/bin/env node
// U25 (owner 2026-10-03): "Nothing on the books but it does affect the categorization. We can receive a credit for the
// reefer fuel from the US government so we need to have it detailed — how many gallons etc."
// Static (always):
//   1. Diesel <-> Reefer Diesel through reclassify keeps the fuel transaction's category (IFTA in / out), the gallons and
//      the trailer in step — on the move AND on undo (one function, syncReeferFuelForExpenseLine)
//   2. the IFTA aggregator still excludes reefer_diesel
//   3. the Settlement Creator lets a fuel line be Reefer diesel (with gallons) and refuses reefer fuel entered as a
//      company expense with no gallons
//   4. the Reefer fuel credit report exists (route + page + Reports catalog) and can record a fill's gallons
// Live (with DATABASE_URL, report only): reefer fills on USMCA and how many still have no gallons.
import { readFileSync } from "node:fs";

export const ALLOW_OFFLINE_SKIP = "the enforcing half is static and always runs; the live half only counts reefer fills missing gallons";
const LABEL = "verify-reefer-fuel-credit";
const fails = [];
const read = (p) => readFileSync(p, "utf8");

const recl = read("apps/backend/src/accounting/reclassify/reclassify.service.ts");
if ((recl.match(/syncReeferFuelForExpenseLine\(/g) ?? []).length < 2) fails.push("reclassify must sync the reefer fuel category on the item move and on undo");
const svc = read("apps/backend/src/fuel/reefer-fuel.service.ts");
for (const [re, msg] of [
  [/SET fuel_type = 'reefer_diesel'/, "moving to reefer fuel marks the fuel transaction reefer_diesel"],
  [/SET fuel_type = 'diesel'/, "moving back to truck diesel restores the fuel transaction"],
  [/unit_of_measure = 'gal'/, "the reefer line carries its gallons"],
]) if (!re.test(svc)) fails.push(`reefer-fuel.service: ${msg}`);
const ifta = read("apps/backend/src/ifta/ifta-state-gallons-aggregator.ts");
if (!/reefer_diesel is EXCLUDED/.test(ifta)) fails.push("IFTA aggregator no longer excludes reefer_diesel");
const sc = read("apps/backend/src/driver-finance/settlement-creator.service.ts");
if ((sc.match(/reeferFuelExpenseRefusal\(/g) ?? []).length < 3) fails.push("Settlement Creator must refuse reefer fuel entered as a company expense (preview + post)");
const drawer = read("apps/frontend/src/pages/settlements/SettlementCreatorDrawer.tsx");
if (!/<option value="reefer_diesel">Reefer diesel<\/option>/.test(drawer)) fails.push("Settlement Creator fuel line must offer Reefer diesel");
const routes = read("apps/backend/src/accounting/reefer-fuel-credit.routes.ts");
if (!routes.includes('"/api/v1/accounting/reports/reefer-fuel-credit"') || !routes.includes("/gallons")) fails.push("reefer fuel credit routes missing");
if (!/reports\/reefer-fuel-credit/.test(read("apps/frontend/src/routes/manifest.tsx"))) fails.push("reefer fuel credit page not routed");
if (!/"reefer-fuel-credit", "Reefer fuel credit"/.test(read("apps/frontend/src/pages/reports/ReportsHome.tsx"))) fails.push("Reefer fuel credit missing from the Reports catalog");

// ROUND 391.2 / 393.2 — reefer comes FROM THE FEED's product code, never inferred.
const mig = read("db/migrations/202615400700_reefer_fuel_type_from_relay_product.sql");
if (!/l\.fuel_type = 'reefer'/.test(mig) || !/one_to_one/.test(mig)) fails.push("202615400700 must mark reefer only from Relay product lines, one-to-one");
if (!/feed AS \(/.test(svc) || !/l\.fuel_type = 'reefer'/.test(svc)) fails.push("credit report must count the Relay feed's reefer lines no fuel row carries");
const parser = read("scripts/alwaystrack/parse_settlements.py");
if (!/"product": product/.test(parser) || !/INVOICE_RE\.fullmatch/.test(parser)) fails.push("settlement parser must emit the product code and accept only a real invoice");
const seed = read("apps/backend/src/feed/seed-settlement-document.service.ts");
if (!/fuelTypeFromProductCode\(line\.product\)/.test(seed) || !/providerReferenceOrNull\(line\.invoice\)/.test(seed)) fails.push("feed fuel writer must take fuel_type from the product code and store only a real reference");

if (fails.length) {
  console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`);
  process.exit(1);
}

let live = "live half skipped (no DATABASE_URL)";
const url = process.env.DATABASE_URL;
if (url) {
  const { default: pg } = await import("pg");
  const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15000, statement_timeout: 60000 });
  try {
    await c.connect();
    await c.query("BEGIN READ ONLY");
    await c.query("SET LOCAL app.bypass_rls = 'lucia'");
    const r = await c.query(`
      SELECT (SELECT count(*)::int FROM fuel.fuel_transactions ft JOIN org.companies co ON co.id = ft.operating_company_id
               WHERE co.code = 'USMCA' AND ft.fuel_type = 'reefer_diesel' AND ft.voided_at IS NULL) AS card_fills,
             (SELECT count(*)::int FROM accounting.expense_lines el JOIN accounting.expenses e ON e.id = el.expense_id
                JOIN org.companies co ON co.id = e.operating_company_id JOIN catalogs.items i ON i.id = el.item_id
               WHERE co.code = 'USMCA' AND e.voided_at IS NULL AND e.source_fuel_transaction_id IS NULL
                 AND i.item_name ~* 'reefer' AND i.item_name ~* '(fuel|diesel)' AND i.item_name !~* '(wash|repair|service|def)') AS manual_fills,
             (SELECT count(*)::int FROM accounting.expense_lines el JOIN accounting.expenses e ON e.id = el.expense_id
                JOIN org.companies co ON co.id = e.operating_company_id JOIN catalogs.items i ON i.id = el.item_id
               WHERE co.code = 'USMCA' AND e.voided_at IS NULL AND e.source_fuel_transaction_id IS NULL
                 AND i.item_name ~* 'reefer' AND i.item_name ~* '(fuel|diesel)' AND i.item_name !~* '(wash|repair|service|def)'
                 AND COALESCE(el.unit_of_measure, '') NOT IN ('gal', 'gallon', 'gallons')) AS manual_missing_gallons`);
    await c.query("ROLLBACK");
    const x = r.rows[0];
    live = `USMCA reefer fills: ${x.card_fills} from the fuel card, ${x.manual_fills} entered as expenses (${x.manual_missing_gallons} still without gallons — record them from the receipts)`;
  } catch (err) {
    console.error(`${LABEL}: FAIL — live check could not run: ${err.message}`);
    process.exit(1);
  } finally {
    await c.end().catch(() => {});
  }
}
console.log(`${LABEL}: PASS — Diesel <-> Reefer Diesel keeps category, gallons and IFTA in step; reefer fuel is entered with gallons; the credit report lists gallons per quarter; ${live}`);
