#!/usr/bin/env tsx
/**
 * Create missing Faro factoring advances for Sep purchase days.
 * Authority for inv→load: scripts/feed/faro_load_map.json (from FARO LOAD MAP sheet).
 * Does NOT touch banking. Owner matches bank separately.
 *
 * Usage:
 *   E11_LEAD_AUTH=1 npx tsx scripts/feed/feed-sep-faro-fas.mts
 *   E11_LEAD_AUTH=1 npx tsx scripts/feed/feed-sep-faro-fas.mts --apply
 *   ... --day 9/4/26
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { withCurrentUser } from "../../apps/backend/src/auth/db.js";
import { setScopedCompanyContext } from "../../apps/backend/src/_helpers/scoped-company-context.js";
import { createIntegrationApp } from "../../apps/backend/test-helpers/http-app.js";
import factoringAdvancesPlugin from "../../apps/backend/src/accounting/factoring-advances.routes.js";
import { postFactoringAdvanceEvent } from "../../apps/backend/src/accounting/factoring-posting/poster.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const FARO_VENDOR = "a1f4c2b6-8e35-4f91-9c2d-6b7a58e0f3c4";
const FARO_PROFILE = "40b3690b-f1d4-44b4-90cf-c1cfd4f79c33";
const APPLY = process.argv.includes("--apply");
const dayIdx = process.argv.indexOf("--day");
const ONLY_DAY = dayIdx >= 0 ? process.argv[dayIdx + 1] : null;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const DL = "/Users/jorgemunoz/Downloads/IH35-RECONCILIATION-AND-FEED";

type LoadMapEntry = {
  load: string;
  settlement: string;
  date: string;
  gross: number;
  net_adv: number;
  escrow: number;
  discount: number;
};

function faroDateToIso(d: string) {
  const [m, day, y] = d.split("/").map(Number);
  const yy = y < 100 ? 2000 + y : y;
  return `${yy}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseMoney(s: string | undefined) {
  if (s == null || s === "") return 0;
  return Number(String(s).replace(/[$,]/g, "").trim() || 0);
}

function loadCsv(path: string) {
  const text = readFileSync(path, "utf8");
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols: string[] = [];
    let cur = "",
      inQ = false;
    for (const ch of lines[i]) {
      if (ch === '"') {
        inQ = !inQ;
        continue;
      }
      if (ch === "," && !inQ) {
        cols.push(cur);
        cur = "";
        continue;
      }
      cur += ch;
    }
    cols.push(cur);
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (cols[idx] ?? "").trim();
    });
    rows.push(obj);
  }
  return rows;
}

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
if (APPLY && process.env.E11_LEAD_AUTH !== "1") throw new Error("set E11_LEAD_AUTH=1");

async function main() {
  const dayControl = JSON.parse(readFileSync(join(ROOT, "scripts/feed/day_control.json"), "utf8")) as {
    days: Array<{ date: string; inv: string[]; purchase: number }>;
  };
  const loadMap = JSON.parse(readFileSync(join(ROOT, "scripts/feed/faro_load_map.json"), "utf8")) as Record<
    string,
    LoadMapEntry
  >;
  const purchase = loadCsv(join(DL, "03-SOURCE-DOCUMENTS/PURCHASE REPORT ALL.csv"));

  const days = dayControl.days.filter((d) => d.date.startsWith("9/") && (!ONLY_DAY || d.date === ONLY_DAY));

  process.env.IH35_TEST_AUTH_BYPASS = "1";
  const app = await createIntegrationApp(async (a) => {
    await a.register(factoringAdvancesPlugin);
  });
  const auth = {
    "x-test-auth": Buffer.from(
      JSON.stringify({ id: OWNER, role: "Owner", email: "tioperfumes07@gmail.com" }),
      "utf8"
    ).toString("base64url"),
    "content-type": "application/json",
  };

  let created = 0,
    skipped = 0,
    refused = 0;

  for (const day of days) {
    const iso = faroDateToIso(day.date);
    console.log(`\n=== ${day.date} (${iso}) inv=${day.inv.join(",")} ===`);
    for (const inv of day.inv.map(String)) {
      const existing = await withCurrentUser(OWNER, async (c) => {
        await setScopedCompanyContext(c, OWNER, USMCA);
        const r = await c.query<{ id: string }>(
          `SELECT id::text FROM accounting.factoring_advances
            WHERE operating_company_id=$1::uuid AND faro_invoice_number=$2
              AND faro_purchase_date=$3::date AND voided_at IS NULL LIMIT 1`,
          [USMCA, inv, iso]
        );
        return r.rows[0]?.id;
      });
      if (existing) {
        console.log(`SKIP ${inv} FA exists`);
        skipped++;
        continue;
      }

      const mapped = loadMap[inv];
      const purchaseRow = purchase.find((r) => r.Date === day.date && String(r["Inv #"]) === inv);
      const purchaseCents = Math.round(
        (parseMoney(purchaseRow?.Purchase) || mapped?.gross || 0) * 100
      );
      if (purchaseCents <= 0) {
        console.log(`REFUSE ${inv}: no purchase amount`);
        refused++;
        continue;
      }

      if (!mapped?.load) {
        console.log(`REFUSE ${inv}: no FARO LOAD MAP entry (do not amount-match)`);
        refused++;
        continue;
      }

      const loadHint = mapped.load;
      let invoiceId: string | null = null;
      let invoiceTot = 0;

      await withCurrentUser(OWNER, async (c) => {
        await setScopedCompanyContext(c, OWNER, USMCA);
        const invRow = await c.query<{ id: string; tot: string; factored: boolean }>(
          `SELECT id::text, total_cents::text AS tot,
                  (factoring_advance_id IS NOT NULL) AS factored
             FROM accounting.invoices
            WHERE operating_company_id=$1::uuid AND display_id=$2 AND voided_at IS NULL
            LIMIT 1`,
          [USMCA, loadHint]
        );
        if (!invRow.rows[0]) {
          console.log(`REFUSE ${inv}: load ${loadHint} has no invoice (feed load first)`);
          return;
        }
        if (invRow.rows[0].factored) {
          console.log(`SKIP ${inv}: invoice ${loadHint} already factored`);
          skipped++;
          return;
        }
        invoiceId = invRow.rows[0].id;
        invoiceTot = Number(invRow.rows[0].tot);
        if (Math.abs(invoiceTot - purchaseCents) > 1) {
          console.log(
            `NOTE ${inv}: invoice ${loadHint} tot ${invoiceTot} vs Faro purchase ${purchaseCents} — using Faro funding_figures`
          );
        }
      });

      if (!invoiceId) {
        refused++;
        continue;
      }
      if (!APPLY) {
        console.log(`DRY CREATE FA inv ${inv} ← invoice ${loadHint} Faro$${purchaseCents / 100}`);
        created++;
        continue;
      }

      const escrow = parseMoney(purchaseRow?.["Escrow Rsv"]) || mapped.escrow || 0;
      const cashRsv = parseMoney(purchaseRow?.["Cash Rsv"]);
      const discount = parseMoney(purchaseRow?.Discount) || mapped.discount || 0;
      const fees = parseMoney(purchaseRow?.Fees);
      const sch = parseMoney(purchaseRow?.["Sch Fee"]);
      const netAdv = parseMoney(purchaseRow?.["Net Adv"]) || mapped.net_adv || 0;
      const reservePct =
        purchaseCents > 0
          ? Number((((escrow + cashRsv) / (purchaseCents / 100)) * 100).toFixed(4))
          : 1.5;
      const feePct =
        purchaseCents > 0
          ? Number((((discount + fees + sch) / (purchaseCents / 100)) * 100).toFixed(4))
          : 1.5;
      const useReserve = Math.abs(reservePct - 1.5) < 0.05 ? 1.5 : reservePct;
      const useFee = Math.abs(feePct - 1.5) < 0.25 ? 1.5 : feePct;

      const createRes = await app.inject({
        method: "POST",
        url: `/api/v1/accounting/factoring-advances?operating_company_id=${USMCA}`,
        headers: auth,
        payload: {
          factoring_company_vendor_id: FARO_VENDOR,
          submission_batch_ref: `FARO-${iso}-INV-${inv}`,
          invoice_ids: [invoiceId],
          reserve_pct: useReserve,
          factor_fee_pct: useFee,
          notes: `Wire / Faro ${day.date} inv ${inv} load ${loadHint}`,
        },
      });
      if (createRes.statusCode >= 300) {
        console.log(`FAIL create ${inv}: ${createRes.statusCode} ${createRes.body.slice(0, 300)}`);
        refused++;
        continue;
      }
      const createdFa = JSON.parse(createRes.body) as { id: string; display_id: string };

      const reserveCents = Math.round((purchaseCents * useReserve) / 100);
      const feeCents = Math.round((purchaseCents * useFee) / 100);
      const advanceCents = purchaseCents - reserveCents - feeCents;

      await postFactoringAdvanceEvent({
        operating_company_id: USMCA,
        factoring_advance_id: createdFa.id,
        actor_user_id: OWNER,
        advanced_at_iso: `${iso}T18:00:00.000Z`,
        funding_figures: {
          invoice_total_cents: purchaseCents,
          reserve_cents: reserveCents,
          fee_cents: feeCents,
          ach_cents: Math.round(netAdv * 100) || advanceCents,
        },
        faro_invoice_number: inv,
        faro_purchase_date: iso,
      });

      const feeBlob = {
        escrow_rsv: escrow,
        cash_rsv: cashRsv,
        discount,
        fees,
        sch_fee: sch,
        net_adv: netAdv || advanceCents / 100,
        purchase: purchaseCents / 100,
        load: loadHint,
      };
      await withCurrentUser(OWNER, async (c) => {
        await setScopedCompanyContext(c, OWNER, USMCA);
        await c.query(
          `UPDATE accounting.factoring_advances
              SET status='advanced', advanced_at=$2::timestamptz,
                  notes=$3, faro_invoice_number=$4, faro_purchase_date=$5::date
            WHERE id=$1::uuid`,
          [
            createdFa.id,
            `${iso}T18:00:00.000Z`,
            `Wire / Faro ${day.date} inv ${inv} | FARO_FEES=${JSON.stringify(feeBlob)}`,
            inv,
            iso,
          ]
        );
        await c.query(
          `UPDATE accounting.invoices
              SET factoring_status='advanced',
                  factor_profile_id=COALESCE(factor_profile_id, $3::uuid),
                  updated_at=now(), updated_by_user_id=$2::uuid
            WHERE factoring_advance_id=$1::uuid`,
          [createdFa.id, OWNER, FARO_PROFILE]
        );
      });
      console.log(`CREATED ${inv} ${createdFa.display_id} ← ${loadHint} Faro$${purchaseCents / 100}`);
      created++;
    }
  }

  await app.close();
  console.log(
    APPLY
      ? `\nDONE apply created=${created} skipped=${skipped} refused=${refused}`
      : `\nDRY done created=${created} skipped=${skipped} refused=${refused} — pass --apply`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
