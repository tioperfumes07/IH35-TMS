// LEAD 443.197 1a (17:45Z GO): "a re-stamp runner for the in-scope loads that lack factoring_company_vendor_id but carry a LIVE
// Faro factoring advance: stamp the vendor FROM that advance's evidence, through an audited writer … refuse loads whose
// customer's factor disagrees with the advance's vendor (list them)."
//
// Every load the required-live-load-guard scopes (verify-one-load-create-path.mjs: USMCA, live, non-sample, linked through a
// live invoice to a live Faro advance on a CLOSED purchase day) was booked before resolveFactoringVendorId fell back to the
// customer's factor, so FACTORING_VENDOR reads 0/56. This stamps each through the ONE narrow linkage writer —
// stampLoadFactoringVendorFromAdvance (apps/backend/src/dispatch/load-factoring-vendor-stamp.service.ts): the vendor comes
// from the load's own live advance(s) (exactly one factor, an ACTIVE vendor of the SAME company), never overwrites, refuses a
// customer whose factor disagrees, audit 'dispatch.load.factoring_vendor_stamped' per load. Linkage only: nothing re-prices,
// re-bills or posts. A customer with NO factor (13546 13554 13557 13559 13570 today) is stamped from the advance evidence.
//
// SELECTION BY EVIDENCE (the load-number list below is a cross-check only): the guard's own scope + factoring_company_vendor_id
// IS NULL.
// READ-BACK: the guard's FACTORING_VENDOR count for the in-scope set = 0 missing; one audit row per stamped load; money md5
// (driver bills, A/P bills + lines, invoices, factoring advances, these loads' postings, the loads' money columns) unchanged;
// trial balance unchanged and 0. No JE: nothing here posts.
//
//   default: DRY RUN in one transaction, ROLLED BACK · --fork-commit (assertNotProduction) ·
//   --apply --auth LEAD-ORDER-443.197 (assertIsIntendedProduction; the selection must equal the 56-load cross-check list and
//   no load may be refused).
//   --company <uuid>: local rehearsal only (a localhost DATABASE_URL, never with --apply / --fork-commit).
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";
import {
  FACTORING_VENDOR_STAMP_EVENT,
  stampLoadFactoringVendorFromAdvance,
} from "../../apps/backend/src/dispatch/load-factoring-vendor-stamp.service.ts";

const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const REASON =
  "Lead 443.197: load booked before the customer-factor fallback — factoring vendor stamped from the load's own live Faro advance";
// Cross-check only (prod read-only 2026-10-17, CC-3): the 56 loads the evidence selects today.
const CROSS_CHECK = [
  "13508", "13510", "13511", "13512", "13513", "13514", "13516", "13518", "13519", "13520", "13521", "13523", "13524", "13526",
  "13528", "13529", "13532", "13534", "13535", "13536", "13537", "13538", "13542", "13543", "13544", "13545", "13546", "13547",
  "13548", "13549", "13550", "13551", "13552", "13554", "13557", "13558", "13559", "13560", "13561", "13562", "13563", "13564",
  "13565", "13566", "13567", "13568", "13569", "13570", "13571", "13573", "13574", "13575", "13576", "13577", "13578", "13579",
];
// Customers with no factor on file (Lead named them) — stamped from the advance evidence, reported separately.
const CUSTOMER_NO_FACTOR = ["13546", "13554", "13557", "13559", "13570"];

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] ?? "" : null; };
const APPLY = process.argv.includes("--apply");
const FORK = process.argv.includes("--fork-commit");
const COMPANY_OVERRIDE = arg("--company");
if (APPLY && arg("--auth") !== "LEAD-ORDER-443.197") throw new Error("--apply requires --auth LEAD-ORDER-443.197");
// verify-owner-authorization: Lead GO 443.197 17:45Z (required-live-load-guard items 1a + 1b).
if (COMPANY_OVERRIDE && (APPLY || FORK)) throw new Error("--company is a local rehearsal flag only");
if (COMPANY_OVERRIDE && !/@(localhost|127\.0\.0\.1)[:/]|^postgres(ql)?:\/\/\/|^postgres(ql)?:\/\/[^@]*$/.test(process.env.DATABASE_URL ?? ""))
  throw new Error("--company needs a localhost DATABASE_URL");
const CO = COMPANY_OVERRIDE ?? "5c854333-6ea5-4faa-af31-67cb272fef80"; // USMCA

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const closedDays: string[] = (() => {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/feed/closed_purchase_days.json"), "utf8"));
  return Array.isArray(j.closed_purchase_days) ? j.closed_purchase_days.map(String) : [];
})();
if (!closedDays.length) throw new Error("REFUSE: no closed Faro purchase day — the guard's scope is empty");

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
if (APPLY) await assertIsIntendedProduction(db, { label: "443.197 stamp factoring vendor" });
else if (FORK) await assertNotProduction(db, { label: "443.197 stamp factoring vendor (fork)" });

const q = async <T = any>(sql: string, v: unknown[] = []) => (await db.query(sql, v)).rows as T[];
const md5 = (x: unknown) => createHash("md5").update(JSON.stringify(x)).digest("hex");

// The guard's scope, verbatim (verify-one-load-create-path.mjs measureLoadOutcomes).
const SCOPE = `
    l.operating_company_id = $1::uuid
    AND l.is_sample_data IS NOT TRUE
    AND l.voided_at IS NULL
    AND EXISTS (
      SELECT 1
        FROM accounting.invoices i
        JOIN accounting.factoring_advances fa ON fa.id = i.factoring_advance_id
       WHERE i.source_load_id = l.id
         AND i.voided_at IS NULL
         AND fa.voided_at IS NULL
         AND fa.faro_purchase_date = ANY($2::date[])
    )`;
const SELECT_SQL = `SELECT l.id::text, l.load_number FROM mdata.loads l WHERE ${SCOPE} AND l.factoring_company_vendor_id IS NULL ORDER BY l.load_number`;
const guardCounts = async () => (await q<{ total: number; with_vendor: number }>(
  `SELECT count(*)::int total, count(*) FILTER (WHERE l.factoring_company_vendor_id IS NOT NULL)::int with_vendor
     FROM mdata.loads l WHERE ${SCOPE}`, [CO, closedDays]))[0];

const rows = (sql: string, v: unknown[]) => q(sql, v).then((r) => r.map((x: any) => x.j));
const moneyHash = async (ids: string[]) => ({
  driver_bills: md5(await rows(`SELECT to_jsonb(b) j FROM driver_finance.driver_bills b WHERE b.load_id = ANY($1::uuid[]) ORDER BY b.id`, [ids])),
  ap_bills: md5(await rows(`SELECT to_jsonb(b) j FROM accounting.bills b
      WHERE b.load_id = ANY($1::uuid[]) OR b.id IN (SELECT bl.bill_id FROM accounting.bill_lines bl WHERE bl.load_id = ANY($1::uuid[])) ORDER BY b.id`, [ids])),
  ap_bill_lines: md5(await rows(`SELECT to_jsonb(bl) j FROM accounting.bill_lines bl WHERE bl.load_id = ANY($1::uuid[]) ORDER BY bl.id`, [ids])),
  invoices: md5(await rows(`SELECT to_jsonb(i) j FROM accounting.invoices i WHERE i.source_load_id = ANY($1::uuid[]) ORDER BY i.id`, [ids])),
  advances: md5(await rows(`SELECT to_jsonb(fa) j FROM accounting.factoring_advances fa
      WHERE fa.id IN (SELECT i.factoring_advance_id FROM accounting.invoices i WHERE i.source_load_id = ANY($1::uuid[])) ORDER BY fa.id`, [ids])),
  postings: md5(await rows(`SELECT to_jsonb(p) j FROM accounting.journal_entry_postings p
      WHERE p.operating_company_id = $2::uuid AND p.load_id = ANY($1::uuid[]) ORDER BY p.id`, [ids, CO])),
  load_money: md5(await rows(`SELECT to_jsonb(l) - 'factoring_company_vendor_id' - 'updated_at' j FROM mdata.loads l WHERE l.id = ANY($1::uuid[]) ORDER BY l.id`, [ids])),
});
const tb = async () => (await q<{ net: string }>(
  `SELECT COALESCE(sum(CASE WHEN debit_or_credit = 'debit' THEN amount_cents ELSE -amount_cents END), 0)::text net
     FROM accounting.journal_entry_postings WHERE operating_company_id = $1::uuid`, [CO]))[0].net;
const auditCount = async (ids: string[]) => Number((await q<{ n: string }>(
  `SELECT count(*)::text n FROM audit.audit_events WHERE event_class = $2 AND payload->>'load_id' = ANY($1::text[])`,
  [ids, FACTORING_VENDOR_STAMP_EVENT]))[0].n);

let ok = false;
try {
  await db.query("BEGIN");
  await db.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await db.query("SELECT set_config('app.operating_company_id',$1,true)", [CO]);
  await db.query("SELECT set_config('app.current_user_id',$1,true)", [OWNER]);
  const mode = APPLY ? "APPLY (prod)" : FORK ? "FORK COMMIT" : "DRY RUN (rolled back)";

  const g0 = await guardCounts();
  const sel = await q<{ id: string; load_number: string }>(SELECT_SQL, [CO, closedDays]);
  const ids = sel.map((r) => r.id);
  const nums = sel.map((r) => r.load_number);
  const notInList = nums.filter((n) => !CROSS_CHECK.includes(n));
  const listNotSel = CROSS_CHECK.filter((n) => !nums.includes(n));
  console.log(`${mode} · guard scope ${g0.total} loads, ${g0.with_vendor} with a factoring vendor · selected by evidence ${sel.length} · ` +
    `cross-check list ${CROSS_CHECK.length}: selected-not-listed ${notInList.length} [${notInList.join(" ")}] · listed-not-selected ${listNotSel.length} [${listNotSel.join(" ")}]`);
  if (!sel.length) throw new Error("REFUSE: the evidence selects no load");
  if ((APPLY || FORK) && (notInList.length || listNotSel.length)) throw new Error("REFUSE: the evidence selection differs from the 56-load cross-check — re-measure before writing");

  const tb0 = await tb();
  const h0 = await moneyHash(ids);
  const audit0 = await auditCount(ids);

  // Stamp each through the one narrow linkage writer.
  const stamped: string[] = [];
  const refused: Array<{ load: string; reason: string; advance_vendor: string | null; customer_factor: string | null }> = [];
  const noFactor: string[] = [];
  const vendors = new Set<string>();
  for (const r of sel) {
    const res = await stampLoadFactoringVendorFromAdvance(db as never, { operatingCompanyId: CO, loadId: r.id, actorUserId: OWNER, reason: REASON });
    if (res.status === "stamped") {
      stamped.push(r.load_number);
      vendors.add(String(res.vendor_id));
      if (!res.customer_factor_vendor_id) noFactor.push(r.load_number);
    } else {
      refused.push({ load: r.load_number, reason: String(res.reason), advance_vendor: res.vendor_id, customer_factor: res.customer_factor_vendor_id });
    }
  }
  console.log(`stamped ${stamped.length} (distinct factor vendors ${vendors.size}) · customer has no factor (stamped from advance evidence) ${noFactor.length} [${noFactor.join(" ")}]`);
  const noFactorDiff = CUSTOMER_NO_FACTOR.filter((n) => !noFactor.includes(n)).concat(noFactor.filter((n) => !CUSTOMER_NO_FACTOR.includes(n)));
  if (noFactorDiff.length) console.log(`  NOTE: no-factor set differs from the Lead's 5: [${noFactorDiff.join(" ")}]`);
  console.log(`refused ${refused.length}${refused.length ? ":" : ""}`);
  for (const x of refused) console.log(`  ${x.load}: ${x.reason}${x.customer_factor ? " (customer factor ≠ advance factor)" : ""}`);
  if ((APPLY || FORK) && refused.length) throw new Error("REFUSE: a selected load was refused by the writer — the Lead rules on the list above before any write");

  // Read-back.
  const stampedIds = sel.filter((r) => stamped.includes(r.load_number)).map((r) => r.id);
  const g1 = await guardCounts();
  const again = (await q(SELECT_SQL, [CO, closedDays])).length;
  const audit1 = await auditCount(ids);
  const h1 = await moneyHash(ids);
  const tb1 = await tb();
  const wrong = Number((await q<{ n: string }>(`SELECT count(*)::text n FROM mdata.loads l WHERE l.id = ANY($1::uuid[])
      AND NOT EXISTS (SELECT 1 FROM accounting.invoices i JOIN accounting.factoring_advances fa ON fa.id = i.factoring_advance_id
                       WHERE i.source_load_id = l.id AND i.voided_at IS NULL AND fa.voided_at IS NULL
                         AND fa.factoring_company_vendor_id = l.factoring_company_vendor_id)`, [stampedIds]))[0].n);
  console.log(`read-back: guard FACTORING_VENDOR ${g1.with_vendor}/${g1.total} (${g1.total - g1.with_vendor} missing) · evidence re-select ${again} · ` +
    `stamped vendor ≠ its advance's factor ${wrong} · audit rows +${audit1 - audit0} of ${stamped.length}`);
  console.log(`money md5 before ${JSON.stringify(h0)}\n          after  ${JSON.stringify(h1)}\ntrial balance before ${tb0} after ${tb1}`);
  if (again !== refused.length) throw new Error("NOT VERIFIED: an unrefused selected load still has no factoring vendor");
  if (!refused.length && g1.total - g1.with_vendor !== 0) throw new Error("NOT VERIFIED: guard FACTORING_VENDOR still missing loads");
  if (wrong !== 0) throw new Error("NOT VERIFIED: a stamped vendor is not its own advance's factor");
  if (audit1 - audit0 !== stamped.length) throw new Error("NOT VERIFIED: not one audit row per stamped load");
  if (JSON.stringify(h0) !== JSON.stringify(h1)) throw new Error("NOT VERIFIED: bills / invoices / advances / postings / load money changed");
  if (tb0 !== tb1 || Number(tb1) !== 0) throw new Error("NOT VERIFIED: trial balance moved or not 0");

  if (APPLY || FORK) {
    await db.query("COMMIT");
    console.log(`COMMITTED · ${stamped.length} factoring vendors stamped`);
  } else {
    await db.query("ROLLBACK");
    console.log("DRY RUN — ROLLED BACK. Pass --fork-commit (fork) or --apply --auth LEAD-ORDER-443.197.");
  }
  ok = true;
} catch (e) {
  await db.query("ROLLBACK").catch(() => {});
  console.error(e);
} finally {
  await db.end();
  setTimeout(() => process.exit(ok ? 0 : 1), 2000);
}
