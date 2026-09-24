#!/usr/bin/env tsx
/**
 * ROUND 152.1 — complete + CLOSE Aug SPAN (5789–5794) and all Sep AT docs (5797–5816).
 *
 * Owner 2026-09-24 afternoon: close August AND September now (schedule slip).
 * Pure-Aug 5769–5788/5795/5796 already closed. Sep shells exist with bills linked but
 * 0 settlement_lines / $0 gross — reopen empty shells, append lines, close + company settl.
 *
 * Usage:
 *   E11_LEAD_AUTH=1 npx tsx scripts/feed/complete-aug-sep-settlements.mts
 *   E11_LEAD_AUTH=1 npx tsx scripts/feed/complete-aug-sep-settlements.mts --apply
 *   ... --only 5789,5797
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { withCurrentUser } from "../../apps/backend/src/auth/db.js";
import { setScopedCompanyContext } from "../../apps/backend/src/_helpers/scoped-company-context.js";
import {
  ensureSettlementFromFedBills,
  closeFedSettlementIfRequested,
  type FedSettlementDocInput,
} from "../../apps/backend/src/feed/ensure-settlement-from-fed-bills.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const DL = "/Users/jorgemunoz/Downloads/IH35-RECONCILIATION-AND-FEED";
const FEED_INPUT = existsSync(join(DL, "01-ENGINES/feed_input.json"))
  ? join(DL, "01-ENGINES/feed_input.json")
  : join(DL, "02-CONTROLS-AND-GATES/feed_input.json");

const DRIVER_BY_NAME: Record<string, string> = {
  "JORGE FLORES VALADEZ": "df9c64b6-caa9-40d1-a0a7-4deddddc624e",
  "Leonel Antonio Morales": "5dd518ff-db91-429f-b651-a71b5f0db672",
  "Jorge Luis Infante Corona": "3e138476-06db-4b08-9ebe-527a5d8c591d",
  "Rafael Rogelio Rivero Reynoso": "c864a4bb-a7ff-4373-a5e1-c1590eefe3b7",
  "JOSE ANTONIO VICENTE MARTINEZ": "45fac397-860e-4fe8-ae18-67e12e1959c1",
  "HUGO GAYTAN SARABIA": "3445cf68-4a7f-4d73-89f7-04bf1fd207b4",
  "HUGO GAYTAN": "3445cf68-4a7f-4d73-89f7-04bf1fd207b4",
  "ALFONSO HIDALGO CHAVEZ": "40823a77-d8d4-481c-88cb-1387556aa98e",
  "Angel Alfonso Sosa Perez": "52037e93-484a-4659-ab60-cf2a78f4c647",
  "ANGEL ALFONSO SOSA PEREZ": "52037e93-484a-4659-ab60-cf2a78f4c647",
  "Neftali Coronado Urbano": "a32a35c8-7cd5-4368-83f0-35e185092433",
  "PEDRO ABRAHAM LOPEZ COLLADO": "a785bea7-6dde-4bf9-81b9-b9135c2df4b5",
  "LUIS ARMANDO SOSA PEREZ": "4ff53886-41cc-434f-ae23-a36a0e3ec8e2",
  "Genaro Guerrero Chavez": "6edcb351-e81b-4bf2-adf7-5eca9eff9137",
  "GENARO GUERRERO CHAVEZ": "6edcb351-e81b-4bf2-adf7-5eca9eff9137",
  "Concepcion Cordova Dominguez": "424a3bb9-60c2-4f16-8d9c-afa6be475ad7",
  "Fernando Mecor Hernandez": "93be328f-ba1b-4175-adaf-bb619c1c51f2",
  "FERNANDO MECOR HERNANDEZ": "93be328f-ba1b-4175-adaf-bb619c1c51f2",
  "CARLOS MAURICIO PENA CARVALLO": "61727a46-af2e-4d33-8236-e2d99b737708",
  "Carlos Mauricio Pena Carvallo": "61727a46-af2e-4d33-8236-e2d99b737708",
  "Vicente Santos Contreras": "40022039-b657-4713-97de-439fba899946",
  "VICENTE SANTOS CONTRERAS": "40022039-b657-4713-97de-439fba899946",
};

/** Aug SPAN left open + all pure-Sep AT docs. */
const DOC_MIN = 5789;
const DOC_MAX = 5816;
/** Already-closed pure-Aug that we skip unless --only names them. */
const SKIP_UNLESS_ONLY = new Set(
  Array.from({ length: 20 }, (_, i) => String(5769 + i)).concat(["5795", "5796"])
);

const APPLY = process.argv.includes("--apply");
const onlyIdx = process.argv.indexOf("--only");
const ONLY = onlyIdx >= 0 ? new Set(process.argv[onlyIdx + 1].split(",").map((s) => s.trim())) : null;

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
if (/-pooler\./.test(process.env.DATABASE_URL)) throw new Error("Refuse -pooler DATABASE_URL");
if (APPLY && process.env.E11_LEAD_AUTH !== "1" && !process.env.E11_AUTH_ID) {
  throw new Error("set E11_LEAD_AUTH=1 or E11_AUTH_ID");
}

type FeedRec = {
  settlement_doc_no: string | number;
  load_number: string;
  period_start: string;
  period_end: string;
  driver_name: string;
};

function buildDocs(records: FeedRec[]): FedSettlementDocInput[] {
  const byDoc = new Map<string, FeedRec[]>();
  for (const r of records) {
    const n = String(r.settlement_doc_no);
    const num = Number(n);
    if (!(num >= DOC_MIN && num <= DOC_MAX)) continue;
    if (!ONLY && SKIP_UNLESS_ONLY.has(n) && num < 5789) continue;
    if (ONLY && !ONLY.has(n)) continue;
    // 5795/5796 already closed — skip unless --only
    if (!ONLY && (n === "5795" || n === "5796")) continue;
    const list = byDoc.get(n) ?? [];
    list.push(r);
    byDoc.set(n, list);
  }

  const docs: FedSettlementDocInput[] = [];
  for (const [documentNumber, loads] of [...byDoc.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))) {
    const periodDates = loads.flatMap((l) => [l.period_start, l.period_end]).sort();
    const periodStart = periodDates[0]!;
    const periodEnd = periodDates.at(-1)!;
    const driverName = loads[0]!.driver_name;
    const driverId = DRIVER_BY_NAME[driverName];
    if (!driverId) throw new Error(`unmapped driver ${driverName} for settl ${documentNumber}`);
    docs.push({
      documentNumber,
      driverId,
      periodStart,
      periodEnd,
      loadNumbers: loads.map((l) => l.load_number),
      close: true, // owner: close Aug + Sep now
    });
  }
  return docs;
}

async function main() {
  if (!existsSync(FEED_INPUT)) throw new Error(`feed_input missing: ${FEED_INPUT}`);
  const feed = JSON.parse(readFileSync(FEED_INPUT, "utf8")) as { records: FeedRec[] };
  const docs = buildDocs(feed.records);
  const report: string[] = [];
  report.push(`docs=${docs.length} apply=${APPLY} range=${DOC_MIN}-${DOC_MAX}`);

  if (!APPLY) {
    for (const d of docs) {
      report.push(`DRY ${d.documentNumber} ${d.periodStart}→${d.periodEnd} CLOSE loads=${d.loadNumbers.join(",")}`);
    }
    console.log(report.join("\n"));
    return;
  }

  for (const doc of docs) {
    try {
      const minted = await withCurrentUser(OWNER, async (c) => {
        await setScopedCompanyContext(c, OWNER, USMCA);
        return ensureSettlementFromFedBills(c as never, {
          operatingCompanyId: USMCA,
          actorUserId: OWNER,
          doc,
        });
      });
      const closed = await closeFedSettlementIfRequested({
        operatingCompanyId: USMCA,
        actorUserId: OWNER,
        settlementId: minted.settlementId,
        documentNumber: minted.documentNumber,
        close: true,
      });
      const warnings = [...minted.warnings, ...closed.warnings];
      report.push(
        `OK ${minted.documentNumber} settl=${minted.settlementId.slice(0, 8)} ` +
          `existed=${minted.alreadyExisted} status=${closed.status || minted.status} bills=${minted.billsLinked} ` +
          `loads=${minted.linesAppendedForLoads.join(",")} posted=${closed.settlementPosted} je=${closed.journalEntryId ?? "—"}` +
          (warnings.length ? ` WARN=${warnings.join(" | ")}` : "")
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const code = (e as { code?: string })?.code;
      if (code === "no_bills_for_settlement" || msg.includes("no_bills_for_settlement")) {
        report.push(`SKIP ${doc.documentNumber}: no driver bills (${doc.loadNumbers.join(",")})`);
        continue;
      }
      report.push(`FAIL ${doc.documentNumber}: ${msg}`);
    }
  }

  await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    const census = await c.query<{
      open_n: number;
      closed_n: number;
      company_n: number;
      zero_gross: number;
    }>(
      `SELECT
         (SELECT count(*)::int FROM driver_finance.driver_settlements
           WHERE operating_company_id=$1::uuid AND voided_at IS NULL AND status='open'
             AND source_document_ref ~ '^[0-9]+$' AND source_document_ref::int BETWEEN $2 AND $3) AS open_n,
         (SELECT count(*)::int FROM driver_finance.driver_settlements
           WHERE operating_company_id=$1::uuid AND voided_at IS NULL
             AND status IN ('approved','closed','paid','final','locked')
             AND source_document_ref ~ '^[0-9]+$' AND source_document_ref::int BETWEEN $2 AND $3) AS closed_n,
         (SELECT count(DISTINCT cs.id)::int FROM accounting.company_settlements cs
           JOIN accounting.company_settlement_driver_settlements j ON j.company_settlement_id=cs.id
           JOIN driver_finance.driver_settlements ds ON ds.id=j.driver_settlement_id
           WHERE cs.operating_company_id=$1::uuid AND cs.voided_at IS NULL
             AND ds.source_document_ref ~ '^[0-9]+$' AND ds.source_document_ref::int BETWEEN $2 AND $3) AS company_n,
         (SELECT count(*)::int FROM driver_finance.driver_settlements
           WHERE operating_company_id=$1::uuid AND voided_at IS NULL
             AND COALESCE(gross_pay,0)=0
             AND source_document_ref ~ '^[0-9]+$' AND source_document_ref::int BETWEEN $2 AND $3) AS zero_gross`,
      [USMCA, DOC_MIN, DOC_MAX]
    );
    const row = census.rows[0]!;
    report.push(
      `CENSUS ${DOC_MIN}-${DOC_MAX} open=${row.open_n} closedish=${row.closed_n} company=${row.company_n} zero_gross=${row.zero_gross}`
    );
  });

  console.log(report.join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
