// LEAD 443.157 (owner 11:34 CT, verbatim: "the invoices in our app should include the invoice number we have in Faro plus
// the load number … DO NOT DEVIATE AND DO NOT DRIFT"): every Faro-purchased invoice (Faro rows 99–152 the owner pasted) =
// "<Faro Inv>-<Load>", customer = Faro debtor, amount = Faro Purchase. Engine: voidAndReissueLoadInvoice (option 3 — the voided
// row keeps its record as "-V<n>", the number is freed and reissued) for an invoice that differs in number, customer or
// amount; buildInvoiceFromLoad + sendDraftInvoice for a Faro load with no invoice; non-Faro invoices whose number collides
// with a Faro number move to explicit numbers ≥ 153. Owner-purchased invoices (live factoring purchase) are listed, never
// touched. Delivery-latch Event 2 re-fired after commit for every touched load and A/R verified = invoice total.
// CUSTOMER RULE: a debtor that is the same party under an abbreviation (SAME_PARTY_TOKENS) keeps the existing customer; a debtor
// that names a different party (Shram, Bennett, FLS Transport, Westgate Logistics, GLT Transportation Group, RLS Distribution,
// Gampac Express) is found by exact name or created (same insert + audit + spine event as POST /customers; no QBO push —
// USMCA QBO out of scope). Unmapped Faro rows (no PO hit, no ruling) are LISTED, not guessed.
//   default DRY RUN (rolled back) · --fork-commit · --apply --auth AUTH-NNN (prod)
import { execFileSync } from "node:child_process";
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";
import { voidAndReissueLoadInvoice } from "../../apps/backend/src/accounting/invoice-number-release.service.ts";
import { buildInvoiceFromLoad } from "../../apps/backend/src/accounting/from-load.ts";
import { convertProformaToOfficial } from "../../apps/backend/src/accounting/proforma-convert.service.ts";
import { sendDraftInvoice } from "../../apps/backend/src/accounting/invoice-send.service.ts";
import { updateDispatchLoad } from "../../apps/backend/src/dispatch/update-load.service.ts";
import { postLoadRevenueLatch } from "../../apps/backend/src/accounting/revrec-delivery-posting/poster.service.ts";
import { companyBusinessDate } from "../../apps/backend/src/lib/company-business-date.ts";
import { appendCrudAudit } from "../../apps/backend/src/audit/crud-audit.ts";
import { emitMasterDataCreatedSpineEvent } from "../../apps/backend/src/mdata/master-data-spine-emit.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const APPLY = process.argv.includes("--apply");
const FORK = process.argv.includes("--fork-commit");
let auth = "";
if (APPLY) {
  const i = process.argv.indexOf("--auth");
  auth = i > 0 ? process.argv[i + 1] ?? "" : "";
  // Lead 443.157 carries the owner's order (owner law: merge-on-safe, "no AUTH numbers needed"); --auth OWNER-ORDER-443.157 records
  // it; any AUTH-NNN still goes through verify-owner-authorization.
  if (auth === "OWNER-ORDER-443.157") console.log("authority: owner order relayed by Lead 443.157 (2026-10-16)");
  else if (!/^AUTH-\d+$/.test(auth)) throw new Error("--apply requires --auth AUTH-NNN | OWNER-ORDER-443.157");
  else execFileSync("node", ["scripts/verify-owner-authorization.mjs", auth], { stdio: "inherit" });
}
const FARO_ROWS = [
  { d: "09/25", debtor: "S E Mares Forwarding Service LLC", n: "102", po: "SEM66542", cents: 490000 },
  { d: "09/25", debtor: "Refrigerx Transportation LLC", n: "100", po: "10136752", cents: 570000 },
  { d: "09/25", debtor: "Shram Logistics Solutions", n: "99", po: "2245258", cents: 240000 },
  { d: "09/25", debtor: "LOGIMAX TRANSPORT INC", n: "103", po: "LGMX142", cents: 625000 },
  { d: "09/25", debtor: "FLS Transport Inc.", n: "104", po: "5804613", cents: 340000 },
  { d: "09/25", debtor: "Bennett International Logistics, LLC", n: "101", po: "1777319", cents: 430000 },
  { d: "09/28", debtor: "S E Mares Forwarding Service LLC", n: "112", po: "SMX14683", cents: 490000 },
  { d: "09/28", debtor: "Refrigerx Transportation LLC", n: "113", po: "10138802", cents: 570000 },
  { d: "09/28", debtor: "ACE DORAN LLC", n: "110", po: "1776502", cents: 430000 },
  { d: "09/28", debtor: "RITE WAY LOGISTICS INC", n: "109", po: "3949540", cents: 400000 },
  { d: "09/28", debtor: "ARMSTRONG TRANSPORT GROUP INC", n: "107", po: "4690712-1", cents: 487500 },
  { d: "09/28", debtor: "WESTGATE LOGISTICS LLC", n: "111", po: "2648846", cents: 520000 },
  { d: "09/28", debtor: "GLT Transportation Group", n: "106", po: "SHP7437063", cents: 320000 },
  { d: "09/28", debtor: "WESTGATE LOGISTICS LLC", n: "105", po: "2648812", cents: 520000 },
  { d: "09/28", debtor: "CENTRAL FREIGHT MANAGEMENT, LLC", n: "108", po: "1332528", cents: 320000 },
  { d: "09/29", debtor: "WESTGATE LOGISTICS LLC", n: "116", po: "2648813", cents: 520000 },
  { d: "09/30", debtor: "Refrigerx Transportation LLC", n: "115", po: "1013949", cents: 320000 },
  { d: "09/30", debtor: "DEL-CAN LOGISTICS, LLC.", n: "117", po: "39242", cents: 112000 },
  { d: "09/30", debtor: "Refrigerx Transportation LLC", n: "118", po: "1013541-2", cents: 390000 },
  { d: "10/01", debtor: "S E Mares Forwarding Service LLC", n: "120", po: "SEM66551", cents: 490000 },
  { d: "10/01", debtor: "Refrigerx Transportation LLC", n: "119", po: "1014030", cents: 390000 },
  { d: "10/02", debtor: "ARMSTRONG TRANSPORT GROUP INC", n: "123", po: "4709343-1", cents: 400000 },
  { d: "10/02", debtor: "ACE DORAN LLC", n: "121", po: "1787509", cents: 520000 },
  { d: "10/02", debtor: "Refrigerx Transportation LLC", n: "122", po: "10113822-2", cents: 390000 },
  { d: "10/02", debtor: "AB GLOBAL LOGISTICS INC", n: "124", po: "61903", cents: 350000 },
  { d: "10/05", debtor: "TRIDENT TRANSPORT LLC", n: "127", po: "1154080", cents: 410000 },
  { d: "10/05", debtor: "ARMSTRONG TRANSPORT GROUP INC", n: "125", po: "4713831-1", cents: 425000 },
  { d: "10/05", debtor: "ARMSTRONG TRANSPORT GROUP INC", n: "129", po: "4694862-1", cents: 500000 },
  { d: "10/05", debtor: "Refrigerx Transportation LLC", n: "133", po: "1014018-2", cents: 570000 },
  { d: "10/05", debtor: "S E Mares Forwarding Service LLC", n: "134", po: "SEM66563", cents: 490000 },
  { d: "10/05", debtor: "SIMPLE LOGISTICS LLC", n: "132", po: "smplm4879", cents: 400000 },
  { d: "10/05", debtor: "Refrigerx Transportation LLC", n: "130", po: "1014077", cents: 320000 },
  { d: "10/06", debtor: "DEL-CAN LOGISTICS, LLC.", n: "126", po: "39347", cents: 400000 },
  { d: "10/06", debtor: "AB GLOBAL LOGISTICS INC", n: "128", po: "61902", cents: 500000 },
  { d: "10/07", debtor: "Refrigerx Transportation LLC", n: "131", po: "1014113", cents: 320000 },
  { d: "10/07", debtor: "Refrigerx Transportation LLC", n: "135", po: "1014166", cents: 320000 },
  { d: "10/08", debtor: "JEAR LOGISTICS", n: "137", po: "1183326", cents: 330000 },
  { d: "10/08", debtor: "ARMSTRONG TRANSPORT GROUP INC", n: "136", po: "4712553", cents: 400000 },
  { d: "10/09", debtor: "ACE DORAN LLC", n: "138", po: "1808393", cents: 445000 },
  { d: "10/09", debtor: "Refrigerx Transportation LLC", n: "140", po: "1014073-2", cents: 570000 },
  { d: "10/09", debtor: "NEW ERA LOGISTICS INC.", n: "141", po: "68084", cents: 530000 },
  { d: "10/09", debtor: "Gampac Express Inc", n: "142", po: "31460-01334", cents: 500000 },
  { d: "10/09", debtor: "Refrigerx Transportation LLC", n: "139", po: "1013873-2", cents: 620000 },
  { d: "10/09", debtor: "NEW ERA LOGISTICS INC.", n: "143", po: "68085", cents: 530000 },
  { d: "10/13", debtor: "RITE WAY LOGISTICS INC", n: "146", po: "3971210", cents: 440000 },
  { d: "10/13", debtor: "RLS DISTRIBUTION INC", n: "145", po: "1245672", cents: 560000 },
  { d: "10/13", debtor: "NEW ERA LOGISTICS INC.", n: "147", po: "66123", cents: 530000 },
  { d: "10/13", debtor: "ACE DORAN LLC", n: "144", po: "1816414", cents: 520000 },
  { d: "10/13", debtor: "TROPIC BROKERS, INC.", n: "150", po: "260297", cents: 490000 },
  { d: "10/13", debtor: "ACE DORAN LLC", n: "149", po: "1816416", cents: 520000 },
  { d: "10/13", debtor: "STEP BY STEP LOGISTICS LLC", n: "148", po: "11589", cents: 480000 },
  { d: "10/15", debtor: "Gampac Express Inc", n: "152", po: "31408-59454", cents: 230000 },
];

// PO did not hit a load: owner reconciliation (QBO-FARO-Allways) + Lead rulings 443.151 / 443.157.
const LOAD_RULINGS: Record<string, string> = {
  "99": "13609", "100": "13616", "102": "13621", "112": "13638",
  "132": "13655", "136": "13659", "143": "13667", "147": "13672", "126": "13648", "150": "13669", "146": "13671",
};
const SAME_PARTY_TOKENS = ["refrigerx", "semares", "semares", "acedoran", "riteway", "armstrong", "centralfreight", "delcan", "abglobal", "trident", "jear", "newera", "tropic", "logimax", "simplelogistics", "stepbystep"];
const DISTINCT_DEBTORS = new Set(["shramlogisticssolutions", "bennettinternationallogisticsllc", "flstransportinc", "westgatelogisticsllc", "glttransportationgroup", "rlsdistributioninc", "gampacexpressinc"]);
const norm = (s: string) => String(s ?? "").toLowerCase().replace(/^s e mares/, "semares").replace(/[^a-z0-9]/g, "");
const token = (s: string) => SAME_PARTY_TOKENS.find((t) => norm(s).startsWith(t)) ?? null;

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
if (APPLY) await assertIsIntendedProduction(db, { label: "443.157 invoice = Faro" });
else if (FORK) await assertNotProduction(db, { label: "443.157 invoice = Faro (fork)" });
const one = async (sql: string, p: unknown[]) => (await db.query(sql, p)).rows[0] as Record<string, any> | undefined;
const table: string[] = [];
const touched: Array<{ load: string; loadId: string; total: number }> = [];
await db.query("BEGIN");
try {
  await db.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await db.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
  await db.query("SELECT set_config('app.current_user_id',$1,true)", [OWNER]);
  const tb = async () => (await one(`SELECT COALESCE(sum(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END),0)::text net FROM accounting.journal_entry_postings WHERE operating_company_id=$1::uuid`, [USMCA]))!.net;
  const tb0 = await tb();
  const customers = (await db.query(`SELECT id::text, customer_name FROM mdata.customers WHERE operating_company_id=$1::uuid AND deactivated_at IS NULL`, [USMCA])).rows as Array<{ id: string; customer_name: string }>;
  const created = new Map<string, string>();
  const customerFor = async (debtor: string, current: { id: string; name: string } | null): Promise<{ id: string; name: string; note: string }> => {
    const nd = norm(debtor);
    if (!DISTINCT_DEBTORS.has(nd)) {
      const t = token(debtor);
      if (current && t && token(current.name) === t) return { id: current.id, name: current.name, note: "same party" };
      const exact = customers.find((c) => norm(c.customer_name) === nd);
      if (exact) return { id: exact.id, name: exact.customer_name, note: "existing (exact)" };
      const byToken = t ? customers.filter((c) => token(c.customer_name) === t) : [];
      if (byToken.length === 1) return { id: byToken[0].id, name: byToken[0].customer_name, note: "existing (same party)" };
      if (byToken.length > 1) {
        // Same party under two spellings: use the one that already carries this party's live invoices (never create a third).
        const counts = await Promise.all(byToken.map(async (c) => Number((await one(`SELECT count(*)::int n FROM accounting.invoices WHERE customer_id=$1::uuid AND voided_at IS NULL`, [c.id]))!.n)));
        const best = counts.indexOf(Math.max(...counts));
        if (counts.filter((n) => n === counts[best]).length > 1) throw new Error(`customer ambiguous for ${debtor}: ${byToken.map((c) => c.customer_name).join(" | ")}`);
        return { id: byToken[best].id, name: byToken[best].customer_name, note: `existing (same party; ${counts[best]} live invoices)` };
      }
    }
    const exact = customers.find((c) => norm(c.customer_name) === nd);
    if (exact) return { id: exact.id, name: exact.customer_name, note: current?.id === exact.id ? "same" : "existing (exact)" };
    if (created.has(nd)) return { id: created.get(nd)!, name: debtor, note: "created" };
    const c = (await one(`INSERT INTO mdata.customers (customer_name, customer_type, status, operating_company_id, created_by_user_id, updated_by_user_id)
       VALUES ($1, 'broker', 'active', $2::uuid, $3::uuid, $3::uuid) RETURNING id::text`, [debtor, USMCA, OWNER]))!;
    await appendCrudAudit(db as never, OWNER, "mdata.customers.created", { resource_id: c.id, resource_type: "mdata.customers", id: c.id, name: debtor, reason: "Lead 443.157 — Faro debtor" }, "info", "BT-1-CUSTOMER-FULL-PROFILE");
    await emitMasterDataCreatedSpineEvent(db as never, { operating_company_id: USMCA, actor_user_id: OWNER, subject_type: "customer", subject_id: c.id, payload: { customer_code: null, name: debtor } } as never);
    created.set(nd, c.id);
    customers.push({ id: c.id, customer_name: debtor });
    return { id: c.id, name: debtor, note: "created" };
  };
  const loadFor = async (r: { n: string; po: string }) => {
    if (LOAD_RULINGS[r.n]) return LOAD_RULINGS[r.n];
    const hits = (await db.query(`SELECT load_number FROM mdata.loads WHERE operating_company_id=$1::uuid AND voided_at IS NULL AND (
        ltrim(regexp_replace(lower(customer_wo_number),'[^a-z0-9]','','g'),'0') = ltrim(regexp_replace(lower($2),'[^a-z0-9]','','g'),'0')
        OR ltrim(regexp_replace(lower(customer_po_number),'[^a-z0-9]','','g'),'0') = ltrim(regexp_replace(lower($2),'[^a-z0-9]','','g'),'0'))`, [USMCA, r.po])).rows;
    return hits.length === 1 ? String(hits[0].load_number) : null;
  };
  const faroLoad = new Map<string, string>();
  for (const r of FARO_ROWS) { const l = await loadFor(r); if (l) faroLoad.set(l, r.n); }
  const faroNumbers = new Set(FARO_ROWS.map((r) => r.n).concat(["151"]));

  // 1. Non-Faro invoices whose number collides with a Faro number → explicit numbers ≥ 153.
  const maxPrefix = Number((await one(`SELECT COALESCE(max(split_part(display_id,'-',1)::int),0) m FROM accounting.invoices WHERE operating_company_id=$1::uuid AND display_id ~ '^[0-9]{1,6}-[0-9]+$'`, [USMCA]))!.m);
  let nextFree = Math.max(152, maxPrefix) + 1;
  const live = (await db.query(`SELECT i.id::text, i.display_id, i.total_cents::int total, l.load_number, l.id::text load_id, c.customer_name FROM accounting.invoices i JOIN mdata.loads l ON l.id=i.source_load_id LEFT JOIN mdata.customers c ON c.id=i.customer_id WHERE i.operating_company_id=$1::uuid AND i.voided_at IS NULL AND i.display_id ~ '^[0-9]{1,6}-[0-9]+$'`, [USMCA])).rows as Array<Record<string, any>>;
  for (const inv of live) {
    const prefix = inv.display_id.split("-")[0];
    if (faroLoad.has(inv.load_number) || !faroNumbers.has(prefix)) continue;
    const purchased = await one(`SELECT 1 FROM accounting.factoring_purchase_lines pl JOIN accounting.factoring_purchases p ON p.id=pl.purchase_id WHERE pl.invoice_id=$1::uuid AND pl.voided_at IS NULL AND p.voided_at IS NULL`, [inv.id]);
    if (purchased) { table.push(`| — | ${inv.load_number} | ${inv.display_id} → (untouched) | ${inv.customer_name} | ${(inv.total / 100).toFixed(2)} | OWNER-PURCHASED, collides with Faro ${prefix} — listed |`); continue; }
    const to = String(nextFree++);
    await db.query("SAVEPOINT one");
    try {
      const out = await voidAndReissueLoadInvoice(db as never, { operatingCompanyId: USMCA, invoiceId: inv.id, actorUserId: OWNER, actorRole: "Owner", reason: "Lead 443.157: non-Faro invoice number collided with a Faro number", reissueNumber: to, sendMode: "historical_backfill" });
      await db.query("RELEASE SAVEPOINT one");
      touched.push({ load: inv.load_number, loadId: out.load_id, total: out.after_total_cents });
      table.push(`| — | ${inv.load_number} | ${inv.display_id} → ${out.new_display_id} | ${inv.customer_name} | ${(inv.total / 100).toFixed(2)} | non-Faro, freed Faro # ${prefix} |`);
    } catch (e) {
      await db.query("ROLLBACK TO SAVEPOINT one");
      table.push(`| — | ${inv.load_number} | ${inv.display_id} → HELD | ${inv.customer_name} | ${(inv.total / 100).toFixed(2)} | ${(e as Error).message.slice(0, 140)} |`);
    }
  }

  // 2. Every Faro row.
  for (const r of FARO_ROWS) {
    const loadNo = await loadFor(r);
    if (!loadNo) { table.push(`| ${r.n} | UNMAPPED | — | ${r.debtor} | ${(r.cents / 100).toFixed(2)} | PO ${r.po} hits no single load and no ruling — LISTED, not guessed |`); continue; }
    const l = (await one(`SELECT l.id::text, l.status::text, l.rate_total_cents::int rate, l.customer_id::text cid, c.customer_name FROM mdata.loads l LEFT JOIN mdata.customers c ON c.id=l.customer_id WHERE l.operating_company_id=$1::uuid AND l.load_number=$2 AND l.voided_at IS NULL`, [USMCA, loadNo]))!;
    const inv = await one(`SELECT i.id::text, i.display_id, i.status::text, i.total_cents::int total, i.customer_id::text cid, c.customer_name FROM accounting.invoices i LEFT JOIN mdata.customers c ON c.id=i.customer_id WHERE i.source_load_id=$1::uuid AND i.voided_at IS NULL AND i.status <> 'proforma'`, [l.id]);
    const wantNo = `${r.n}-${loadNo}`;
    await db.query("SAVEPOINT one");
    try {
      const cur = inv ? { id: inv.cid, name: inv.customer_name } : { id: l.cid, name: l.customer_name };
      const cust = await customerFor(r.debtor, cur);
      if (inv) {
        const purchased = await one(`SELECT p.display_id FROM accounting.factoring_purchase_lines pl JOIN accounting.factoring_purchases p ON p.id=pl.purchase_id WHERE pl.invoice_id=$1::uuid AND pl.voided_at IS NULL AND p.voided_at IS NULL`, [inv.id]);
        const same = inv.display_id === wantNo && inv.total === r.cents && inv.cid === cust.id;
        if (same) { await db.query("RELEASE SAVEPOINT one"); table.push(`| ${r.n} | ${loadNo} | ${inv.display_id} (ok) | ${inv.customer_name} | ${(inv.total / 100).toFixed(2)} | matches Faro |`); continue; }
        if (purchased) { await db.query("RELEASE SAVEPOINT one"); table.push(`| ${r.n} | ${loadNo} | ${inv.display_id} (untouched) | ${inv.customer_name} → want ${cust.name} | ${(inv.total / 100).toFixed(2)} → want ${(r.cents / 100).toFixed(2)} | OWNER-PURCHASED (${purchased.display_id}) — listed |`); continue; }
        const out = await voidAndReissueLoadInvoice(db as never, {
          operatingCompanyId: USMCA, invoiceId: inv.id, actorUserId: OWNER, actorRole: "Owner", reason: `Lead 443.157: invoice = Faro ${r.n} (${r.debtor}, ${(r.cents / 100).toFixed(2)})`,
          reissueNumber: r.n, newTotalCents: r.cents, newCustomerId: cust.id !== inv.cid ? cust.id : undefined, sendMode: "historical_backfill",
        });
        await db.query("RELEASE SAVEPOINT one");
        touched.push({ load: loadNo, loadId: out.load_id, total: out.after_total_cents });
        table.push(`| ${r.n} | ${loadNo} | ${inv.display_id} → ${out.new_display_id} | ${inv.customer_name} → ${cust.name} (${cust.note}) | ${(inv.total / 100).toFixed(2)} → ${(out.after_total_cents / 100).toFixed(2)} | reissued (old → ${out.released_display_id}) |`);
      } else {
        if (cust.id !== l.cid) await updateDispatchLoad(db as never, { loadId: l.id, operatingCompanyId: USMCA, requestingUserUuid: OWNER, requestingUserRole: "Owner", override_reason: `Lead 443.157: customer = Faro debtor ${r.debtor}`, fields: { customer_id: cust.id } } as never);
        const b = await buildInvoiceFromLoad(db as never, { operatingCompanyId: USMCA, loadId: l.id, requestedDisplayId: r.n } as never);
        if (l.rate !== r.cents) await updateDispatchLoad(db as never, { loadId: l.id, operatingCompanyId: USMCA, requestingUserUuid: OWNER, requestingUserRole: "Owner", override_reason: `Lead 443.157: amount = Faro ${(r.cents / 100).toFixed(2)}`, fields: {}, charges: [{ code: "linehaul", description: "Line haul", amount_cents: r.cents }] } as never);
        if (String(b.invoice.status) === "proforma") await convertProformaToOfficial(db as never, { operatingCompanyId: USMCA, loadId: l.id, userId: OWNER });
        const sent = await sendDraftInvoice(db as never, { invoiceId: String(b.invoice.id), operatingCompanyId: USMCA, userId: OWNER, mode: "historical_backfill" });
        if (!(sent as { ok: boolean }).ok) throw new Error(`send refused: ${JSON.stringify(sent).slice(0, 160)}`);
        const fresh = (await one(`SELECT display_id, total_cents::int total FROM accounting.invoices WHERE id=$1::uuid`, [String(b.invoice.id)]))!;
        if (fresh.display_id !== wantNo || fresh.total !== r.cents) throw new Error(`minted ${fresh.display_id} ${fresh.total}, want ${wantNo} ${r.cents}`);
        await db.query("RELEASE SAVEPOINT one");
        touched.push({ load: loadNo, loadId: l.id, total: r.cents });
        table.push(`| ${r.n} | ${loadNo} | none → ${fresh.display_id} | ${l.customer_name} → ${cust.name} (${cust.note}) | — → ${(r.cents / 100).toFixed(2)} | minted + issued |`);
      }
    } catch (e) {
      await db.query("ROLLBACK TO SAVEPOINT one");
      table.push(`| ${r.n} | ${loadNo} | ${inv?.display_id ?? "none"} → HELD | ${inv?.customer_name ?? l.customer_name} | ${((inv?.total ?? l.rate) / 100).toFixed(2)} | ${(e as Error).message.slice(0, 150)} |`);
    }
  }
  const tb1 = await tb();
  console.log("| Faro Inv | load | number before → after | customer before → after | amount before → after | note |\n|---|---|---|---|---|---|");
  for (const t of table) console.log(t);
  console.log(`customers created: ${[...created.keys()].length} · invoices touched: ${touched.length} · trial balance ${tb0} -> ${tb1}`);
  if (Number(tb1) !== 0) throw new Error("REFUSE: trial balance off zero");
  await db.query(APPLY || FORK ? "COMMIT" : "ROLLBACK");
  console.log(APPLY || FORK ? "COMMITTED" : "DRY RUN — rolled back");
  if (APPLY || FORK) {
    // Delivery-latch Event 2 after commit (in-app this is enqueueAfterCommit), then A/R on each touched load = its total.
    let bad = 0;
    for (const t of touched) {
      const r = await postLoadRevenueLatch({ operating_company_id: USMCA, load_id: t.loadId, target_status: "completed_docs_received", entry_date_iso: companyBusinessDate(), actor_user_id: OWNER } as never);
      await db.query("BEGIN"); await db.query("SELECT set_config('app.bypass_rls','lucia',true)");
      const ar = Number((await one(`SELECT COALESCE(sum(CASE WHEN p.debit_or_credit='debit' THEN p.amount_cents ELSE -p.amount_cents END),0)::int ar FROM accounting.journal_entry_postings p JOIN catalogs.accounts a ON a.id=p.account_id WHERE p.load_id=$1::uuid AND a.account_number='1100'`, [t.loadId]))!.ar);
      await db.query("ROLLBACK");
      if (ar !== t.total) bad += 1;
      console.log(`  ${t.load}: latch ${String((r as { reason?: string; event?: string }).reason ?? (r as { event?: string }).event)} · A/R ${(ar / 100).toFixed(2)} ${ar === t.total ? "= total" : `≠ total ${(t.total / 100).toFixed(2)}`}`);
    }
    console.log(`A/R check: ${touched.length - bad} of ${touched.length} loads A/R = invoice total`);
  }
} catch (e) {
  await db.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await db.end();
  setTimeout(() => process.exit(0), 3000);
}
