#!/usr/bin/env tsx
/**
 * Complete pure-August AlwaysTrack settlement deductions — escrow + cash advances + admin fees.
 *
 * Source: data/alwaystrack/settlements-truth-2026-09-13.json driver docs whose start_date AND
 * end_date fall in 2026-08 (pure-Aug). Cross-month Aug–Sep docs are LEFT OPEN (owner 2026-09-24)
 * and are not closed here; their Aug-side escrow/CA still get seeded when the load exists in USMCA.
 *
 * 13524 LINE HAUL = $3,800 (rate con MPHC261334) — AT $4,200 was our misprint.
 *
 * Usage:
 *   E11_LEAD_AUTH=1 npx tsx scripts/feed/complete-aug-settlement-deductions.mts
 *   E11_LEAD_AUTH=1 npx tsx scripts/feed/complete-aug-settlement-deductions.mts --apply
 *   ... --only 5778,5775
 */
import fs from "node:fs";
import path from "node:path";
import { withCurrentUser } from "../../apps/backend/src/auth/db.js";
import { setScopedCompanyContext } from "../../apps/backend/src/_helpers/scoped-company-context.js";
import { createHistoricalEscrowHold } from "../../apps/backend/src/driver-finance/historical-escrow-backfill.service.js";
import { createDriverCashAdvanceCore } from "../../apps/backend/src/cash-advances/cash-advance-create.js";
import { editDriverAdvancePostingDate } from "../../apps/backend/src/cash-advances/cash-advance-disburse.js";
import { createSettlementDeduction } from "../../apps/backend/src/driver-finance/deductions.service.js";
import { openEscrow } from "../../apps/backend/src/accounting/escrow/service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";

const DRIVER_BY_NAME: Record<string, string> = {
  "JORGE FLORES VALADEZ": "df9c64b6-caa9-40d1-a0a7-4deddddc624e",
  "Leonel Antonio Morales": "5dd518ff-db91-429f-b651-a71b5f0db672",
  "Jorge Luis Infante Corona": "3e138476-06db-4b08-9ebe-527a5d8c591d",
  "Rafael Rogelio Rivero Reynoso": "c864a4bb-a7ff-4373-a5e1-c1590eefe3b7",
  "JOSE ANTONIO VICENTE MARTINEZ": "45fac397-860e-4fe8-ae18-67e12e1959c1",
  "HUGO GAYTAN SARABIA": "3445cf68-4a7f-4d73-89f7-04bf1fd207b4",
  "HUGO GAYTAN": "3445cf68-4a7f-4d73-89f7-04bf1fd207b4",
  "ALFONSO HIDALGO CHAVEZ": "40823a77-d8d4-481c-88cb-1387556aa98e", // USMCA twin (TRANSP copy is dcd683f5)
  "Angel Alfonso Sosa Perez": "52037e93-484a-4659-ab60-cf2a78f4c647",
  "ANGEL ALFONSO SOSA PEREZ": "52037e93-484a-4659-ab60-cf2a78f4c647",
  "ANGEL ALFONSO SOSA": "fba21d80-628b-4228-ae54-336f9cbb73b6",
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

type TruthDeduction = {
  load?: string;
  date?: string;
  description?: string;
  amount?: number;
};

type TruthDriverDoc = {
  settlement_no: string;
  driver: string;
  start_date: string;
  end_date: string;
  deductions?: TruthDeduction[];
};

function cents(n: number) {
  return Math.round(Math.abs(Number(n)) * 100);
}

function classifyAdmin(desc: string): "company_vehicle_fuel" | "wire_fee" | "other" {
  const low = desc.toLowerCase();
  if (/\bgas\b/.test(low)) return "company_vehicle_fuel";
  if (/wire|ach/.test(low)) return "wire_fee";
  return "other";
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const truthPath = path.join(process.cwd(), "data/alwaystrack/settlements-truth-2026-09-13.json");
  const truth = JSON.parse(fs.readFileSync(truthPath, "utf8")) as { driver: TruthDriverDoc[] };

  const docs = truth.driver.filter((d) => {
    if (!d.start_date?.startsWith("2026-08") || !d.end_date?.startsWith("2026-08")) return false;
    if (ONLY && !ONLY.has(String(d.settlement_no))) return false;
    return true;
  });

  const report: string[] = [];
  report.push(`pure-Aug driver docs: ${docs.length}${ONLY ? ` (only ${[...ONLY].join(",")})` : ""}`);

  let createdEscrow = 0;
  let existedEscrow = 0;
  let createdCa = 0;
  let existedCa = 0;
  let createdAdmin = 0;
  let existedAdmin = 0;
  let skipped = 0;
  let refused = 0;
  const bridgedDrivers = new Set<string>();

  await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);

    for (const doc of docs) {
      const driverId = DRIVER_BY_NAME[doc.driver];
      if (!driverId) {
        report.push(`REFUSE doc ${doc.settlement_no}: no driver map for "${doc.driver}"`);
        refused++;
        continue;
      }

      for (const ded of doc.deductions ?? []) {
        const desc = String(ded.description ?? "");
        const low = desc.toLowerCase();
        const loadNumber = String(ded.load ?? "");
        if (!loadNumber) {
          report.push(`SKIP ${doc.settlement_no}: deduction with no load — ${desc}`);
          skipped++;
          continue;
        }

        const loadRes = await c.query<{ id: string }>(
          `SELECT id::text FROM mdata.loads
            WHERE operating_company_id=$1::uuid AND load_number=$2
              AND soft_deleted_at IS NULL AND is_sample_data IS NOT TRUE
            LIMIT 1`,
          [USMCA, loadNumber]
        );
        const loadId = loadRes.rows[0]?.id;
        if (!loadId) {
          report.push(`SKIP ${doc.settlement_no} load ${loadNumber}: not in USMCA`);
          skipped++;
          continue;
        }

        const amountCents = cents(Number(ded.amount ?? 0));
        if (amountCents <= 0) {
          report.push(`SKIP ${doc.settlement_no} ${loadNumber}: amount 0 — ${desc}`);
          skipped++;
          continue;
        }

        // ---- ESCROW ----
        if (low.includes("escrow")) {
          const description = `Driver-Escrow For Claims — settl ${doc.settlement_no} load ${loadNumber}`;
          if (!APPLY) {
            report.push(`DRY ESCROW ${doc.settlement_no}/${loadNumber} $${(amountCents / 100).toFixed(2)}`);
            continue;
          }
          try {
            if (!bridgedDrivers.has(driverId)) {
              const opened = await openEscrow(
                {
                  operating_company_id: USMCA,
                  holder_id: driverId,
                  holder_type: "driver",
                  purpose: "driver_bond",
                },
                { userId: OWNER, role: "Owner" }
              );
              bridgedDrivers.add(driverId);
              report.push(
                `BRIDGE ${opened.created ? "opened" : "exists"} ${doc.driver} ${opened.escrow_account.id}`
              );
            }
            await c.query("SAVEPOINT esc_line");
            try {
              const esc = await createHistoricalEscrowHold(c as never, {
                source: "historical_backfill",
                operating_company_id: USMCA,
                driver_id: driverId,
                load_id: loadId,
                description,
                amount_cents: amountCents,
                actor_user_id: OWNER,
              });
              await c.query("RELEASE SAVEPOINT esc_line");
              if (esc.outcome === "created") createdEscrow++;
              else existedEscrow++;
              report.push(`ESCROW ${esc.outcome} ${doc.settlement_no}/${loadNumber} ${esc.escrow_ledger_id}`);
              await sleep(5);
            } catch (inner) {
              await c.query("ROLLBACK TO SAVEPOINT esc_line");
              throw inner;
            }
          } catch (err) {
            refused++;
            report.push(
              `REFUSE ESCROW ${doc.settlement_no}/${loadNumber}: ${err instanceof Error ? err.message : String(err)}`
            );
          }
          continue;
        }

        // ---- CASH ADVANCE ----
        if (low.includes("cash advance") || low.includes("wire transfer")) {
          const billRes = await c.query<{ id: string; driver_id: string }>(
            `SELECT id::text, driver_id::text FROM driver_finance.driver_bills
              WHERE load_id=$1::uuid AND voided_at IS NULL
              ORDER BY created_at ASC LIMIT 1`,
            [loadId]
          );
          const billId = billRes.rows[0]?.id;
          if (!billId) {
            report.push(`REFUSE CA ${doc.settlement_no}/${loadNumber}: no driver bill`);
            refused++;
            continue;
          }
          // Prefer the bill's own driver_id when it is USMCA-scoped; name-map is fallback.
          let caDriverId = driverId;
          const billDriverId = billRes.rows[0]?.driver_id;
          if (billDriverId) {
            const billDriver = await c.query<{ id: string; oci: string }>(
              `SELECT id::text, operating_company_id::text AS oci FROM mdata.drivers WHERE id=$1::uuid`,
              [billDriverId]
            );
            if (billDriver.rows[0]?.oci === USMCA) {
              caDriverId = billDriver.rows[0].id;
            } else if (driverId) {
              // Bill points at a TRANSP twin — keep USMCA name-map id for the advance.
              report.push(
                `NOTE CA ${doc.settlement_no}/${loadNumber}: bill driver ${billDriverId} is non-USMCA; using USMCA map ${driverId}`
              );
            }
          }

          const dollars = amountCents / 100;
          const existingAdv = await c.query<{ id: string; display_id: string }>(
            `SELECT id::text, display_id FROM driver_finance.driver_advances
              WHERE operating_company_id=$1::uuid AND driver_id=$2::uuid
                AND linked_driver_bill_id=$3::uuid AND voided_at IS NULL
                AND ABS(amount - $4) < 0.005
              LIMIT 1`,
            [USMCA, caDriverId, billId, dollars]
          );
          if (existingAdv.rows[0]) {
            existedCa++;
            report.push(
              `CA already ${existingAdv.rows[0].display_id} ${doc.settlement_no}/${loadNumber}`
            );
            continue;
          }
          if (!APPLY) {
            report.push(`DRY CA ${doc.settlement_no}/${loadNumber} $${dollars.toFixed(2)} → bill ${billId}`);
            continue;
          }
          try {
            await c.query("SAVEPOINT ca_line");
            const created = await createDriverCashAdvanceCore(c as never, OWNER, USMCA, {
              driver_id: caDriverId,
              amount: dollars,
              purpose: "other",
              disbursement_method: "historical_backfill",
              recipient_info: {
                recipient_type: "driver",
                notes: `AlwaysTrack settl ${doc.settlement_no} load ${loadNumber} ${desc}`,
              },
              linked_driver_bill_id: billId,
              load_id: loadId,
              liability_type: "advance",
            });
            if (!(created as { ok?: boolean }).ok) {
              await c.query("ROLLBACK TO SAVEPOINT ca_line");
              report.push(`REFUSE CA ${doc.settlement_no}/${loadNumber}: ${JSON.stringify(created)}`);
              refused++;
              continue;
            }
            await c.query("RELEASE SAVEPOINT ca_line");
            createdCa++;
            const postingDate = ded.date && /^\d{4}-\d{2}-\d{2}/.test(String(ded.date)) ? String(ded.date).slice(0, 10) : null;
            if (postingDate && (created as { advanceId?: string }).advanceId) {
              const stamped = await editDriverAdvancePostingDate(OWNER, "Owner", USMCA, {
                advance_id: (created as { advanceId: string }).advanceId,
                posting_date: postingDate,
              });
              report.push(
                `CA created ${(created as { displayId?: string }).displayId} ${doc.settlement_no}/${loadNumber} posting_date=${postingDate} stamp=${(stamped as { ok?: boolean }).ok}`
              );
            } else {
              report.push(
                `CA created ${(created as { displayId?: string }).displayId} ${doc.settlement_no}/${loadNumber}`
              );
            }
          } catch (err) {
            await c.query("ROLLBACK TO SAVEPOINT ca_line").catch(() => {});
            refused++;
            report.push(
              `REFUSE CA ${doc.settlement_no}/${loadNumber}: ${err instanceof Error ? err.message : String(err)}`
            );
          }
          continue;
        }

        // ---- ADMIN / OTHER DEDUCTIONS (pending until settl mint+close) ----
        if (low.includes("admin")) {
          const sourceType = classifyAdmin(desc);
          const reason = `AlwaysTrack settl ${doc.settlement_no} load ${loadNumber}: ${desc}`;
          const existingDed = await c.query<{ id: string }>(
            `SELECT id::text FROM driver_finance.driver_settlement_deductions
              WHERE operating_company_id=$1::uuid AND driver_id=$2::uuid AND load_id=$3::uuid
                AND voided_at IS NULL AND amount_cents=$4 AND reason=$5
              LIMIT 1`,
            [USMCA, driverId, loadId, amountCents, reason]
          );
          if (existingDed.rows[0]) {
            existedAdmin++;
            report.push(`ADMIN already ${existingDed.rows[0].id} ${doc.settlement_no}/${loadNumber}`);
            continue;
          }
          if (!APPLY) {
            report.push(
              `DRY ADMIN ${doc.settlement_no}/${loadNumber} $${(amountCents / 100).toFixed(2)} type=${sourceType}`
            );
            continue;
          }
          const row = await createSettlementDeduction(c as never, {
            driverId,
            operatingCompanyId: USMCA,
            amountCents,
            reason,
            sourceType,
            loadId,
            createdByUserId: OWNER,
          });
          createdAdmin++;
          report.push(`ADMIN created ${row.id} ${doc.settlement_no}/${loadNumber} ${sourceType}`);
          continue;
        }

        report.push(`SKIP unhandled ${doc.settlement_no}/${loadNumber}: ${desc}`);
        skipped++;
      }
    }
  });

  report.push(
    `SUMMARY escrow +${createdEscrow}/existed ${existedEscrow} | CA +${createdCa}/existed ${existedCa} | admin +${createdAdmin}/existed ${existedAdmin} | skip ${skipped} | refuse ${refused} | apply=${APPLY}`
  );
  for (const line of report) console.log(line);
  if (refused > 0 && APPLY) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
