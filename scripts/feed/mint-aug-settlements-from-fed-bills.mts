#!/usr/bin/env tsx
/**
 * ROUND 152.1 — mint driver (+ company on close) settlements from already-fed Aug bills.
 *
 * Why variance exists (owner asked):
 *   - Invoice without driver bill = AlwaysTrack driver_pay $0 (feed skips bill).
 *   - Driver bill without invoice = AlwaysTrack line_haul $0 (Faro-unpurchased / no customer charge).
 *   Measured: 13525 (bill, no inv, LH=0); 13530+13532 (inv, no bill, pay=0); 13554 SPAN (bill, no inv).
 *
 * Why settlements were missing:
 *   Day feed wrote loads/invoices/bills but never called settlement mint. Live auto-mint only
 *   runs on status ping. This script + ensureSettlementFromFedBills closes that gap.
 *
 * Usage:
 *   E11_LEAD_AUTH=1 npx tsx scripts/feed/mint-aug-settlements-from-fed-bills.mts
 *   E11_LEAD_AUTH=1 npx tsx scripts/feed/mint-aug-settlements-from-fed-bills.mts --apply
 *   ... --only 5778,5769
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
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
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
};

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
    if (!(num >= 5769 && num <= 5796)) continue;
    if (ONLY && !ONLY.has(n)) continue;
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
    const close = periodEnd < "2026-09-01"; // pure-Aug close; Aug–Sep span leave open
    docs.push({
      documentNumber,
      driverId,
      periodStart,
      periodEnd,
      loadNumbers: loads.map((l) => l.load_number),
      close,
    });
  }

  // Close pure-Aug first (frees one-open-per-driver), then mint SPAN open.
  docs.sort((a, b) => Number(b.close) - Number(a.close) || Number(a.documentNumber) - Number(b.documentNumber));
  return docs;
}

async function main() {
  if (!existsSync(FEED_INPUT)) throw new Error(`feed_input missing: ${FEED_INPUT}`);
  const feed = JSON.parse(readFileSync(FEED_INPUT, "utf8")) as { records: FeedRec[] };
  const docs = buildDocs(feed.records);
  const report: string[] = [];
  report.push(`docs=${docs.length} pure=${docs.filter((d) => d.close).length} span=${docs.filter((d) => !d.close).length} apply=${APPLY}`);

  if (!APPLY) {
    for (const d of docs) {
      report.push(`DRY ${d.documentNumber} ${d.periodStart}→${d.periodEnd} ${d.close ? "CLOSE" : "OPEN"} loads=${d.loadNumbers.join(",")}`);
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
      // Phase 2 AFTER mint commit — GL poster opens its own connection.
      const closed = await closeFedSettlementIfRequested({
        operatingCompanyId: USMCA,
        actorUserId: OWNER,
        settlementId: minted.settlementId,
        documentNumber: minted.documentNumber,
        close: minted.closeRequested,
      });
      const warnings = [...minted.warnings, ...closed.warnings];
      report.push(
        `OK ${minted.documentNumber} settl=${minted.settlementId.slice(0, 8)} ` +
          `existed=${minted.alreadyExisted} status=${closed.status || minted.status} bills=${minted.billsLinked} ` +
          `loads=${minted.linesAppendedForLoads.join(",")} closed=${closed.closed} ` +
          `posted=${closed.settlementPosted} je=${closed.journalEntryId ?? "—"}` +
          (warnings.length ? ` WARN=${warnings.join(" | ")}` : "")
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const code = (e as { code?: string })?.code;
      if (code === "no_bills_for_settlement" || msg.includes("no_bills_for_settlement")) {
        report.push(`SKIP ${doc.documentNumber}: no driver bills (zero-pay loads ${doc.loadNumbers.join(",")})`);
        continue;
      }
      report.push(`FAIL ${doc.documentNumber}: ${msg}`);
    }
  }

  await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    const census = await c.query<{
      driver_n: number;
      company_n: number;
      open_n: number;
      closed_n: number;
    }>(
      `SELECT
         (SELECT count(*)::int FROM driver_finance.driver_settlements
           WHERE operating_company_id=$1::uuid AND voided_at IS NULL
             AND source_document_ref ~ '^[0-9]+$' AND source_document_ref::int BETWEEN 5769 AND 5796) AS driver_n,
         (SELECT count(*)::int FROM accounting.company_settlements cs
           WHERE cs.operating_company_id=$1::uuid AND cs.voided_at IS NULL
             AND EXISTS (
               SELECT 1 FROM accounting.company_settlement_driver_settlements j
               JOIN driver_finance.driver_settlements ds ON ds.id=j.driver_settlement_id
               WHERE j.company_settlement_id=cs.id
                 AND ds.source_document_ref ~ '^[0-9]+$'
                 AND ds.source_document_ref::int BETWEEN 5769 AND 5796
             )) AS company_n,
         (SELECT count(*)::int FROM driver_finance.driver_settlements
           WHERE operating_company_id=$1::uuid AND voided_at IS NULL AND status='open'
             AND source_document_ref ~ '^[0-9]+$' AND source_document_ref::int BETWEEN 5769 AND 5796) AS open_n,
         (SELECT count(*)::int FROM driver_finance.driver_settlements
           WHERE operating_company_id=$1::uuid AND voided_at IS NULL AND status IN ('approved','closed','paid','final','locked')
             AND source_document_ref ~ '^[0-9]+$' AND source_document_ref::int BETWEEN 5769 AND 5796) AS closed_n`,
      [USMCA]
    );
    const row = census.rows[0]!;
    report.push(
      `CENSUS driver_settls=${row.driver_n} company_settls=${row.company_n} open=${row.open_n} closedish=${row.closed_n}`
    );
  });

  console.log(report.join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
