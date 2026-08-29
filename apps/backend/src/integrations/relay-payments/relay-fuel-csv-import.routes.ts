/**
 * RELAY-FUEL-INGEST-1 (doc 21/23 Part A): owner-triggered CSV import of Relay fuel transactions. The daily
 * pull / webhook cover live sync; this endpoint ingests a Relay CSV EXPORT (the owner's historical data)
 * that has no API equivalent. It maps each CSV row → the confirmed Relay API shape → parseRelayFuelTransactionRow
 * → upsertRelayFuelTransaction, so it reuses ALL the deployed ingest logic (driver match via integration_id / phone / name,
 * per-fuel-type lines, idempotent upsert). Owner/Administrator only. Staging + canonical fuel bridge;
 * TMS GL post runs AFTER commit via flushFuelGlPostsAfterCommit (EXPENSE_GL_POSTING_ENABLED, default OFF).
 *
 * POST /api/integrations/relay/fuel/import-csv?operating_company_id=<uuid>
 * body: raw CSV text (Content-Type text/csv or text/plain). Returns { imported, skipped, lines }.
 */
import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../auth/session-middleware.js";
import { withLuciaBypass } from "../../auth/db.js";
import { parseRelayFuelTransactionRow } from "./relay-client.js";
import { upsertRelayFuelTransaction } from "./relay-fuel-ingest.service.js";
import { loadCompanyCardSet, upsertRelayDeposit } from "./relay-deposit-classifier.service.js";
import {
  flushFuelGlPostsAfterCommit,
  type FuelTxnGlPostCandidate,
} from "../../accounting/fuel-posting/maybe-post-from-fuel-transaction.service.js";

// RFC-4180-ish CSV parser: quoted fields, embedded commas/quotes/newlines.
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
const S = (v: string | undefined): string | null => { const t = String(v ?? "").trim(); return t.length ? t : null; };
// Relay CSV "processing time" like "2026-03-31 22:24:11.174249 -0500 CDT" → ISO 8601.
function toIso(v: string | undefined, fallbackDate: string | undefined): string | null {
  const m = String(v ?? "").trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?\s*([+-]\d{4})?/);
  if (m) return `${m[1]}T${m[2]}${m[3] ? `${m[3].slice(0, 3)}:${m[3].slice(3)}` : "+00:00"}`;
  const d = String(fallbackDate ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T00:00:00+00:00` : null;
}

/** Map one CSV row (by header name) to the raw Relay API transaction shape parseRelayFuelTransactionRow expects. */
function csvRowToApiShape(g: (name: string) => string | undefined): Record<string, unknown> | null {
  const id = S(g("id"));
  if (!id) return null;
  // CRITICAL (verified 2026-07-12): the Relay CSV mixes type=code (fuel PURCHASED at the pump) with
  // type=deposit (money FUNDED into the Relay account). Only 'code' rows are fuel transactions; 'deposit'
  // rows are account funding and belong to the Relay-wallet ledger (Part B), NOT this fuel table. Summing
  // them was the bug. Skip anything that is not a fuel-purchase code row.
  const rowType = (S(g("type")) ?? "").toLowerCase();
  if (rowType !== "code") return null;
  // Never count a canceled/voided pre-auth as spend (spec doc 24). In the verified Mar–Jun export every
  // 'code' row is 'settled' and only deposits carry 'canceled'; this guard keeps future exports honest.
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
  // "Other" bucket (~3% of code rows): a fuel code carrying a non-fuel item (service/advance/flat fee) has
  // an amount but NO product breakdown. Record one 'other' line so the amount is never forced into diesel/DEF.
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
    // Every code row carries a flat Relay fee (CSV `fee` col, typically $2.00) on top of the fuel amount.
    fees: S(g("fee")) && Number(g("fee")) > 0 ? [{ type: "relay_fee", amount: S(g("fee")) }] : [],
    products: S(g("products")) ? [{ name: S(g("products")) }] : [],
  };
}

export async function registerRelayFuelCsvImportRoute(app: FastifyInstance) {
  // Accept raw CSV bodies (text/csv, text/plain) — store the raw string, parse in the handler.
  app.addContentTypeParser(["text/csv", "text/plain"], { parseAs: "string" }, (_req, body, done) => done(null, body));

  // Heavy owner-only bulk import — tight rate limit (CodeQL js/missing-rate-limiting; DoS guard).
  app.post("/api/integrations/relay/fuel/import-csv", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!requireAuth(req, reply)) return reply;
    const role = String((req.user as { role?: string } | undefined)?.role ?? "");
    if (!["Owner", "Administrator"].includes(role)) return reply.code(403).send({ error: "forbidden" });
    const opco = String((req.query as { operating_company_id?: string } | undefined)?.operating_company_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(opco)) return reply.code(400).send({ error: "operating_company_id query param required (uuid)" });
    const csv = typeof req.body === "string" ? req.body : "";
    if (!csv.trim()) return reply.code(400).send({ error: "empty CSV body (send raw CSV, Content-Type text/csv)" });

    const rows = parseCsv(csv);
    if (rows.length < 2) return reply.code(400).send({ error: "no data rows" });
    const header = rows[0].map((h) => h.trim());
    const idx = new Map(header.map((h, i) => [h, i]));

    let imported = 0, skipped = 0, lines = 0, deposits = 0, depositCompany = 0, depositUnclassified = 0;
    const pendingGlPosts: FuelTxnGlPostCandidate[] = [];
    const actorUserId = String((req.user as { uuid?: string } | undefined)?.uuid ?? "");
    await withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      // Owner-editable company-card set — used to classify deposit funding sources (Part B). Loaded once.
      const companyCards = await loadCompanyCardSet(client, opco);
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || r.length < 3) { continue; }
        const g = (name: string) => (idx.has(name) ? r[idx.get(name)!] : undefined);
        const rowType = String(g("type") ?? "").trim().toLowerCase();

        // type=deposit → Relay-wallet FUNDING (money put INTO Relay), NOT fuel.
        // upsertRelayDeposit classifies + stores AND mirrors to banking.bank_transactions
        // as Received (is_credit) via upsertRelayWalletDepositFeedRow — visibility only, no GL.
        // External/unknown-card deposits land in the owner-review queue (classification).
        if (rowType === "deposit") {
          const depId = String(g("id") ?? "").trim();
          const created = toIso(g("processing time"), g("work_date"));
          const total = g("total") ?? g("amount");
          if (!depId || !created || total == null || String(total).trim() === "") { skipped++; continue; }
          const rowObj: Record<string, string> = {};
          for (const [h, ci] of idx) rowObj[h] = r[ci] ?? "";
          const dres = await upsertRelayDeposit(
            client, opco,
            { deposit_id: depId, relay_created_at: created, status: String(g("status") ?? ""), total_amount: String(total), note: (g("Note") ?? null) as string | null, raw: rowObj },
            companyCards, "csv_import"
          );
          deposits++;
          if (dres.classification === "company") depositCompany++;
          else if (dres.classification === "unclassified") depositUnclassified++;
          continue;
        }

        // type=code → fuel purchased at the pump.
        const raw = csvRowToApiShape(g);
        const tx = raw ? parseRelayFuelTransactionRow(raw) : null;
        if (!tx) { skipped++; continue; }
        const res = await upsertRelayFuelTransaction(client, opco, tx, "csv_import");
        imported++;
        lines += Array.isArray(tx.fuel_items) ? tx.fuel_items.length : 0;
        if (res.gl_post_candidate) {
          pendingGlPosts.push({
            ...res.gl_post_candidate,
            actor_user_id: actorUserId || res.gl_post_candidate.actor_user_id,
          });
        }
      }
    });

    // AFTER COMMIT — TMS GL only (EXPENSE_GL_POSTING_ENABLED); never QBO push.
    await flushFuelGlPostsAfterCommit(pendingGlPosts, app.log);

    app.log.info({ operating_company_id: opco, imported, skipped, lines, deposits, depositCompany, depositUnclassified, role }, "[RELAY_FUEL_CSV_IMPORT] complete");
    return reply.code(200).send({ status: "imported", operating_company_id: opco, imported, skipped, lines, deposits, depositCompany, depositUnclassified });
  });
}
