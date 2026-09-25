#!/usr/bin/env tsx
/**
 * Owner 2026-09-25: AT company/driver settlements + Faro are SoT — every live USMCA expense
 * line must carry expense_category_uuid + expense_account_uuid (CoA), matched from AT
 * company-settlement expense descriptions where possible.
 *
 *   E11_LEAD_AUTH=1 npx tsx scripts/feed/backfill-expense-coa-categories.mts
 *   E11_LEAD_AUTH=1 npx tsx scripts/feed/backfill-expense-coa-categories.mts --apply
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import pg from "pg";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const APPLY = process.argv.includes("--apply");

type AtExp = { doc: string; invoice: string; description: string; amount: number };

function classifyCode(desc: string, memo: string): string {
  const t = `${desc} ${memo}`.toUpperCase();
  if (/DIESEL EXHAUST|FUEL-DEF|\bDEF\b|REIMBURSEMENT-FUEL-DEF/.test(t)) return "DEF";
  if (/LUMPER|WAREHOUSE-LUMPER/.test(t)) return "LUMPER";
  if (/FUEL-REEFER|REEFER DIESEL|WASHOUT|REEFER TRAILER-WASH|\bREEFER\b/.test(t)) return "REEFER";
  if (/TOLL|\bCRUCE\b|PAGO DE CRUCE|PARKING/.test(t)) return "TOLL";
  if (/SCALE|TPE-SCALE|REIMBURSEMENT-TPE|OTR-SCALE/.test(t)) return "MISC";
  if (/PERMIT|PLATE/.test(t)) return "PERMIT";
  if (/INSURANCE/.test(t)) return "INSURANCE";
  if (/TIRE/.test(t)) return "TIRES";
  if (
    /ROAD SERVICE|TRUCK REPAIR|REPAIR|MAINTENANCE|WINDSHIELD|HEADLIG|1ASC|2AS\d|PREMIUM/.test(t)
  ) {
    return "REPAIR";
  }
  if (/GASOLINA|DIESEL|FUEL/.test(t) && !/DEF/.test(t)) return "DIESEL";
  // Scale / parking fees often $5.25 / $15.25 with blank AT invoice
  if (/\$15\.25|\$5\.25/.test(memo) && /inv none/i.test(memo)) return "MISC";
  return "OTHER";
}

/** Prefer real AT invoice from memo; synthetic ATGTx / AT vendor docs are ignored. */
function extractInvoice(row: {
  vendor_document_number: string | null;
  memo: string;
  description: string | null;
}): string {
  const memoInv = row.memo.match(/\binv\s+([A-Za-z0-9-]+)/i)?.[1] ?? "";
  if (memoInv && memoInv.toLowerCase() !== "none") return memoInv;
  const descInv = row.description?.match(/\binv\s+([A-Za-z0-9-]+)/i)?.[1] ?? "";
  if (descInv && descInv.toLowerCase() !== "none") return descInv;
  const vdn = (row.vendor_document_number || "").trim();
  if (!vdn) return "";
  if (/^ATG?Tx?/i.test(vdn) || /^AT\d{4}-/i.test(vdn)) return "";
  return vdn.replace(/-L\d+$/, "");
}

function extractSettlementDoc(row: {
  source_settlement_ref: string | null;
  memo: string;
  vendor_document_number: string | null;
}): string {
  if (row.source_settlement_ref && /^\d{4}$/.test(row.source_settlement_ref)) {
    return row.source_settlement_ref;
  }
  const fromMemo = row.memo.match(/settl\s+(\d{4})/i)?.[1];
  if (fromMemo) return fromMemo;
  const fromVdn = (row.vendor_document_number || "").match(/ATG?Tx?(\d{4})/i)?.[1];
  return fromVdn || "";
}

function parseCompanyExpenseTexts(): AtExp[] {
  const dirs = [
    join(homedir(), "Downloads", "_st_txt"),
    join(homedir(), "Downloads", "IH35-RECONCILIATION-AND-FEED", "03-SOURCE-DOCUMENTS", "settlement-text"),
  ];
  const out: AtExp[] = [];
  const seen = new Set<string>();
  for (const dir of dirs) {
    let files: string[] = [];
    try {
      files = readdirSync(dir).filter((f) => f.startsWith("Company_Settlement_") && f.endsWith(".txt"));
    } catch {
      continue;
    }
    for (const f of files) {
      const doc = f.replace("Company_Settlement_", "").replace(".txt", "").replace(/ \(\d+\)$/, "");
      // Skip merged/page splits — full settlement txt is SoT
      if (/merged|page\s*\d/i.test(doc) || /\(\d+\)$/.test(f.replace(".txt", ""))) continue;
      const text = readFileSync(join(dir, f), "utf8");
      const expIdx = text.search(/\n\s*EXPENSES\b/);
      if (expIdx < 0) continue;
      const block = text.slice(expIdx);
      const end = block.search(/\n\s*REVENUE\b/);
      const section = end > 0 ? block.slice(0, end) : block;
      for (const line of section.split("\n")) {
        if (!/^\d{4}-\d{2}-\d{2}\s/.test(line)) continue;
        // Amount is always the last money token on the expense row
        const amtM = line.match(/([\d,]+\.\d{2})\s*$/);
        if (!amtM) continue;
        if (/Totals:/i.test(line)) continue;
        const amount = Number(amtM[1].replace(/,/g, ""));
        // Invoice: 5+ digit token after location, or blank → none
        const invM = line.match(
          /^\d{4}-\d{2}-\d{2}\s+\S[\s\S]*?\s(\d{5,}|\d{4,}[A-Za-z]\w*|none)\s{2,}/i
        );
        let invoice = invM?.[1]?.replace(/,/g, "") ?? "none";
        // Description: text between invoice (or vendor block) and Reimb/Drv/Y/amount
        let description = "";
        if (invM) {
          const afterInv = line.slice(line.indexOf(invM[1]) + invM[1].length);
          const descM = afterInv.match(
            /^\s+(.+?)\s+(?:Drv\s+)?Y\s+[\d,]+\.\d{2}\s*$/i
          ) || afterInv.match(/^\s+(.+?)\s+[\d,]+\.\d{2}\s*$/);
          description = (descM?.[1] || "").replace(/\s+/g, " ").trim();
        } else {
          // No invoice — description sits before trailing Y + amount
          const descM = line.match(
            /^\d{4}-\d{2}-\d{2}\s+\S[\s\S]*?\s{2,}(.+?)\s+(?:Drv\s+)?Y\s+[\d,]+\.\d{2}\s*$/i
          );
          description = (descM?.[1] || "").replace(/\s+/g, " ").trim();
          // Strip leading vendor/location junk if description still huge
          if (description.length > 80) {
            const known = description.match(
              /(Fuel-[^\s].+|Warehouse-Lumper.+|Reefer Trailer.+|Road Service-.+|Driver Reimbursement-.+|Scale Expense:.+|Gasolina.+|Warehouse.+)/i
            );
            if (known) description = known[1].trim();
          }
          invoice = "none";
        }
        if (!description) continue;
        // Skip fuel-purchase table rows that sit near EXPENSES (gallons / PPG / total)
        if (/\d+\.\d{3}\s+\d+\.\d{3}/.test(line) && !looksLikeExpense(description)) continue;
        if (!looksLikeExpense(description) && amount === 0) continue;
        const key = `${doc}|${invoice}|${amount}|${description}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ doc, invoice, description, amount });
      }
    }
  }
  return out;
}

function looksLikeExpense(d: string): boolean {
  return /Fuel-|Warehouse|Reefer|Road Service|Driver Reimburse|Scale|Toll|Parking|Gasolina|Lumper|Tire|Washout|Windshield|Headlig|1ASC|2AS|Premium|Permit|Insurance/i.test(
    d
  );
}

async function main() {
  if (process.env.E11_LEAD_AUTH !== "1" && !process.env.E11_AUTH_ID) {
    throw new Error("E11_LEAD_AUTH=1 required");
  }
  const at = parseCompanyExpenseTexts();
  console.log(`AT company expense rows parsed: ${at.length}`);

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const c = await pool.connect();
  try {
    await c.query(`SELECT set_config('app.bypass_rls','lucia',true)`);

    const cats = await c.query<{ id: string; code: string }>(
      `SELECT id::text, upper(code) AS code FROM catalogs.expense_categories
        WHERE operating_company_id=$1::uuid AND is_active`,
      [USMCA]
    );
    const catByCode = new Map(cats.rows.map((r) => [r.code, r.id]));

    const maps = await c.query<{ code: string; account_id: string }>(
      `SELECT lower(category_code) AS code, account_id::text
         FROM accounting.expense_category_account_map
        WHERE operating_company_id=$1::uuid
          AND COALESCE(is_active, true) IS TRUE`,
      [USMCA]
    ).catch(async () =>
      c.query<{ code: string; account_id: string }>(
        `SELECT lower(category_code) AS code, account_id::text
           FROM accounting.expense_category_account_map
          WHERE operating_company_id=$1::uuid`,
        [USMCA]
      )
    );
    const acctByCode = new Map(maps.rows.map((r) => [r.code, r.account_id]));

    const fuel5000 = await c.query<{ id: string }>(
      `SELECT id::text FROM catalogs.accounts
        WHERE operating_company_id=$1::uuid AND account_number='5000'
        LIMIT 1`,
      [USMCA]
    );
    const fallbackFuel = fuel5000.rows[0]?.id ?? null;

    const lines = await c.query<{
      line_id: string;
      expense_id: string;
      memo: string;
      description: string | null;
      vendor_document_number: string | null;
      amount_cents: string;
      expense_category_uuid: string | null;
      expense_account_uuid: string | null;
      source_settlement_ref: string | null;
    }>(
      `SELECT el.id::text AS line_id, e.id::text AS expense_id, e.memo,
              el.description, e.vendor_document_number,
              COALESCE(el.amount_cents, ROUND(el.amount * 100)::bigint, e.total_amount_cents)::text AS amount_cents,
              el.expense_category_uuid::text, el.expense_account_uuid::text,
              e.source_settlement_ref
         FROM accounting.expense_lines el
         JOIN accounting.expenses e ON e.id = el.expense_id
        WHERE e.operating_company_id=$1::uuid
          AND e.voided_at IS NULL AND e.is_sample_data IS NOT TRUE
          AND (el.expense_category_uuid IS NULL OR el.expense_account_uuid IS NULL)`,
      [USMCA]
    );

    // Prefer active map row when duplicates exist (def/lumper/misc have 2).
    const mapsPrefer = await c.query<{ code: string; account_id: string }>(
      `SELECT lower(category_code) AS code, account_id::text
         FROM (
           SELECT category_code, account_id,
                  ROW_NUMBER() OVER (
                    PARTITION BY lower(category_code)
                    ORDER BY COALESCE(is_active, true) DESC, created_at DESC NULLS LAST
                  ) AS rn
             FROM accounting.expense_category_account_map
            WHERE operating_company_id=$1::uuid
         ) x WHERE rn = 1`,
      [USMCA]
    ).catch(() => maps);
    for (const r of mapsPrefer.rows) acctByCode.set(r.code, r.account_id);
    // REPAIR catalogs → maintenance CoA when map has no repair key
    if (!acctByCode.has("repair") && acctByCode.has("maintenance")) {
      acctByCode.set("repair", acctByCode.get("maintenance")!);
    }
    if (!acctByCode.has("reefer") && acctByCode.has("fuel")) {
      acctByCode.set("reefer", acctByCode.get("fuel")!);
    }

    let updated = 0;
    let skipped = 0;
    const byCode: Record<string, number> = {};
    for (const row of lines.rows) {
      const cents = Number(row.amount_cents);
      const dollars = cents / 100;
      const inv = extractInvoice(row);
      const doc = extractSettlementDoc(row);

      const looksLikeExpenseDesc = (d: string) =>
        /Fuel-|Warehouse|Reefer|Road Service|Driver Reimburse|Scale|Toll|Parking|Gasolina|Lumper|Tire|Washout/i.test(
          d
        );

      let atMatch: AtExp | undefined;
      if (inv && inv !== "none") {
        const byInv = at.filter((x) => x.invoice === inv && looksLikeExpenseDesc(x.description));
        const pool = byInv.length > 0 ? byInv : at.filter((x) => x.invoice === inv);
        pool.sort((a, b) => Math.abs(a.amount - dollars) - Math.abs(b.amount - dollars));
        if (pool[0] && Math.abs(pool[0].amount - dollars) < 0.05) atMatch = pool[0];
        else if (pool.length === 1 && looksLikeExpenseDesc(pool[0].description)) atMatch = pool[0];
      }
      if (!atMatch && doc) {
        const byDocAmt = at.filter(
          (x) =>
            x.doc === doc &&
            Math.abs(x.amount - dollars) < 0.01 &&
            looksLikeExpenseDesc(x.description)
        );
        if (byDocAmt.length === 1) atMatch = byDocAmt[0];
        else if (inv && inv !== "none") {
          atMatch = byDocAmt.find((x) => x.invoice === inv);
        } else {
          atMatch =
            byDocAmt.find((x) => !x.invoice || x.invoice === "none") ||
            (byDocAmt.length === 1 ? byDocAmt[0] : undefined);
        }
      }

      const desc = atMatch?.description || row.description || row.memo || "";
      const code = classifyCode(desc, row.memo);
      const catId = catByCode.get(code) || catByCode.get("OTHER");
      if (!catId) {
        skipped += 1;
        continue;
      }
      const acctId =
        acctByCode.get(code.toLowerCase()) ||
        acctByCode.get("other") ||
        row.expense_account_uuid ||
        fallbackFuel;
      if (!acctId) {
        skipped += 1;
        continue;
      }

      byCode[code] = (byCode[code] || 0) + 1;
      console.log(
        `${APPLY ? "SET" : "DRY"} ${row.line_id.slice(0, 8)} cat=${code} acct=${acctId.slice(0, 8)} ` +
          `inv=${inv || "—"} doc=${doc || "—"} $${dollars.toFixed(2)} ${desc.slice(0, 55)}`
      );
      if (APPLY) {
        await c.query(
          `UPDATE accounting.expense_lines
              SET expense_category_uuid = COALESCE(expense_category_uuid, $2::uuid),
                  expense_account_uuid = COALESCE(expense_account_uuid, $3::uuid),
                  line_category = COALESCE(NULLIF(line_category,''), lower($4)),
                  load_exemption_reason = CASE
                    WHEN load_id IS NULL
                         AND (load_exemption_reason IS NULL OR length(trim(load_exemption_reason)) < 20)
                    THEN 'AT company-settlement historical expense — category/CoA backfill 2026-09-25'
                    ELSE load_exemption_reason
                  END
            WHERE id = $1::uuid`,
          [row.line_id, catId, acctId, code]
        );
      }
      updated += 1;
    }
    console.log(`BY_CODE ${JSON.stringify(byCode)}`);
    console.log(`DONE updated=${updated} skipped=${skipped} apply=${APPLY}`);

    // Bill lines — same CoA/category hardline when present
    const billGaps = await c.query<{
      line_id: string;
      description: string | null;
      amount: string;
      expense_category_uuid: string | null;
      account_id: string | null;
    }>(
      `SELECT bl.id::text AS line_id, bl.description, bl.amount::text,
              bl.expense_category_uuid::text, bl.account_id::text
         FROM accounting.bill_lines bl
         JOIN accounting.bills b ON b.id = bl.bill_id
        WHERE b.operating_company_id=$1::uuid
          AND b.voided_at IS NULL AND COALESCE(b.is_sample_data,false)=false
          AND bl.voided_at IS NULL
          AND (bl.expense_category_uuid IS NULL OR bl.account_id IS NULL)`,
      [USMCA]
    );
    let billUpdated = 0;
    for (const row of billGaps.rows) {
      const code = classifyCode(row.description || "", "");
      const catId = catByCode.get(code) || catByCode.get("OTHER");
      const acctId =
        acctByCode.get(code.toLowerCase()) || acctByCode.get("other") || row.account_id || fallbackFuel;
      if (!catId || !acctId) continue;
      if (APPLY) {
        await c.query(
          `UPDATE accounting.bill_lines
              SET expense_category_uuid = COALESCE(expense_category_uuid, $2::uuid),
                  account_id = COALESCE(account_id, $3::uuid),
                  category_code = COALESCE(NULLIF(category_code,''), lower($4)),
                  line_category = COALESCE(NULLIF(line_category,''), lower($4))
            WHERE id = $1::uuid`,
          [row.line_id, catId, acctId, code]
        );
      }
      billUpdated += 1;
    }
    console.log(`BILL_LINES updated=${billUpdated} gaps=${billGaps.rows.length} apply=${APPLY}`);
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
