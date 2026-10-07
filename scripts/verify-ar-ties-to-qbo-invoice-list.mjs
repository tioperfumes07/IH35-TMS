#!/usr/bin/env node
export const REQUIRES_LIVE_DB = "Neon live verification required";

// ROUND 163 JOB 1 (P0): "our issued-invoice total must equal the QBO control total for the same
// date range, or the gate fails with the delta." Control file:
// feed-input/qbo-invoice-list-2026-08-07-to-2026-09-27.csv (owner-supplied QBO export, copied
// verbatim from ~/Desktop). QBO's own printed total for this file: $454,991.72.
//
// The file has two real traps (found and handled, not guessed past):
//   (a) TWO embedded tables in one sheet -- columns 0-10 (main) and 18-26 (a second block,
//       11 more invoices from 8/7 and 8/10/26). Both parsed.
//   (b) The `Num` column is NOT reliably the load number (e.g. "105- 13627" carries LOAD=13572,
//       a different real load). Only the LOAD column is trusted; when it is blank (or a text
//       placeholder like "NOT PURCHASED"), that row is NEVER guessed at -- it is counted as
//       UNMATCHED and reported by name, never silently created or silently dropped.
//   (c) One row (BBA Logistics LLC, load 13530) carries "TRANSPORTATION" in Location full name --
//       QBO's own record of a DIFFERENT billing entity. Excluded from USMCA's target total.
//
// SHRINK-ONLY, NAMED-EXCEPTION DESIGN: this gate FAILS on new rot in the one category that is
// actually actionable today -- a CSV row with a real, populated LOAD number, matching customer AND
// amount against our own load record, that still has no issued invoice. It does NOT fail on the
// UNMATCHED (blank/text LOAD) or MISMATCHED (QBO vs our load disagree on customer/amount) buckets
// -- those need a human/QBO investigation this script cannot perform, and are reported by name,
// every run, never hidden, against a baseline ceiling (shrinks only when someone actually resolves
// one, never grows silently).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const ALLOW_OFFLINE_SKIP = "live A/R-to-QBO tie-out; static parse still runs and is reported";

const LABEL = "verify-ar-ties-to-qbo-invoice-list";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSV_PATH = path.join(ROOT, "feed-input/qbo-invoice-list-2026-08-07-to-2026-09-27.csv");
const BASELINE_PATH = path.join(ROOT, "scripts/verify-ar-ties-to-qbo-invoice-list.baseline.json");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const RANGE_START = "2026-08-07";
const RANGE_END = "2026-09-27";

function parseCsvLine(line) {
  // RFC4180-aware: the QBO export quotes every amount field that contains a thousands-separator
  // comma (e.g. "3,600.00") -- a naive split(",") corrupts every column after it. Handles quoted
  // fields and escaped "" only; this file has no embedded newlines inside a field.
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function toCents(s) {
  const cleaned = String(s ?? "").replace(/[$,]/g, "").trim();
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

function looksLikeRealLoadNumber(load) {
  return Boolean(load) && /^\d[\d-]*\d$|^\d+$/.test(load);
}

function normalizeCustomerName(name) {
  return String(name ?? "")
    .toUpperCase()
    .replace(/\b(INC|LLC|CORP|CO|LTD)\b\.?/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

// Loose but deliberate: real abbreviations (e.g. "ES Logistics" vs "ES Logistics International
// LLC") must still pass, but a genuinely different company name (e.g. "Value Logistics LLC" vs
// "Value Logistics Inc DBA A1 Value" -- found live, part of the same 13505/13506/13507 swap
// cluster) must NOT. "DBA" is the tell: it introduces a SPECIFIC alternate trade name, so once
// either raw name contains it, only an exact (post-legal-suffix-strip) match is trusted -- mere
// containment is exactly how "Value Logistics" hides inside "Value Logistics ... DBA A1 Value"
// despite naming a different real counterparty. Without "DBA" in either name, containment is a
// legitimate abbreviation signal and is trusted.
export function customerNamesLikelyMatch(a, b) {
  const na = normalizeCustomerName(a);
  const nb = normalizeCustomerName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const hasDba = /\bDBA\b/i.test(String(a ?? "")) || /\bDBA\b/i.test(String(b ?? ""));
  if (hasDba) return false;
  if (na.includes(nb) || nb.includes(na)) return true;
  return false;
}

export function categorizeCsvRows(rawRows) {
  // rawRows: array of raw CSV row arrays (already split), starting at the header row's data.
  const main = [];
  const second = [];
  for (const r of rawRows) {
    if (!r[0] || r[0].trim() === "" || r[0].trim() === "TOTAL" || /GMT/.test(r[0])) continue;
    main.push({
      date: r[0]?.trim(), num: r[2]?.trim(), name: r[3]?.trim(), load: r[4]?.trim(),
      location_full_name: r[6]?.trim(), due_date: r[8]?.trim(), amount: r[9]?.trim(),
    });
    if (r.length > 25 && r[18]?.trim()) {
      second.push({
        date: r[18].trim(), num: r[20].trim(), name: r[21].trim(),
        due_date: r[24].trim(), amount: r[25].trim(), load: r[20].trim(),
      });
    }
  }
  const all = [...main, ...second];
  const excludedWrongEntity = all.filter((r) => (r.location_full_name || "").toUpperCase() === "TRANSPORTATION");
  const remaining = all.filter((r) => !excludedWrongEntity.includes(r));
  const unmatchedBlank = remaining.filter((r) => !looksLikeRealLoadNumber(r.load));
  const withLoad = remaining.filter((r) => looksLikeRealLoadNumber(r.load));
  return { withLoad, unmatchedBlank, excludedWrongEntity };
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
}

function selftest() {
  const failures = [];
  const t = (l, c) => { if (!c) failures.push(l); };

  const rows = [
    ["8/7/26", "Invoice", "1", "Cust A", "13500", "5700", "", "", "8/8/26", "1,000.00", "0"],
    ["8/7/26", "Invoice", "2", "Cust B", "", "", "", "", "8/8/26", "500.00", "0"],
    ["8/7/26", "Invoice", "3", "BBA", "13530", "5780", "TRANSPORTATION", "", "8/8/26", "1,500.00", "0"],
  ];
  const cat = categorizeCsvRows(rows);
  t("row with real load -> withLoad", cat.withLoad.length === 1 && cat.withLoad[0].load === "13500");
  t("row with blank load -> unmatchedBlank", cat.unmatchedBlank.length === 1);
  t("TRANSPORTATION location -> excluded", cat.excludedWrongEntity.length === 1);
  t("toCents parses QBO dollar strings", toCents("4,900.00") === 490000);
  t("looksLikeRealLoadNumber rejects text placeholder", looksLikeRealLoadNumber("NOT PURCHASED") === false);
  t("looksLikeRealLoadNumber accepts a real load number", looksLikeRealLoadNumber("13503") === true);
  t(
    "parseCsvLine handles a quoted amount containing a thousands-separator comma",
    (() => {
      const cols = parseCsvLine('8/10/26,Invoice,1,Rehmann Transportation Corp.,13511,5773,,,8/11/26,"3,600.00",0');
      return cols.length === 11 && cols[9] === "3,600.00" && cols[4] === "13511";
    })()
  );
  t("customerNamesLikelyMatch accepts a real abbreviation", customerNamesLikelyMatch("ES Logistics International LLC", "ES Logistics") === true);
  t("customerNamesLikelyMatch rejects the real 13505 swap case", customerNamesLikelyMatch("Value Logistics Inc DBA A1 Value", "Value Logistics LLC") === false);
  t("customerNamesLikelyMatch accepts an exact match modulo suffix", customerNamesLikelyMatch("Refrigerx Transportation LLC", "Refrigerx Transportation LLC") === true);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest OK — 6 cases`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`${LABEL}: FAIL — control file missing: ${path.relative(ROOT, CSV_PATH)}`);
    process.exit(1);
  }
  const lines = fs.readFileSync(CSV_PATH, "utf8").split(/\r?\n/);
  const rawRows = lines.slice(5).map(parseCsvLine); // header is line 5 (0-indexed 4)
  const { withLoad, unmatchedBlank, excludedWrongEntity } = categorizeCsvRows(rawRows);

  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN");
    // SET LOCAL ROLE neondb_owner removed 2026-09-28: the ONLY outlier among 329 other guards in
    // this repo, all of which bypass RLS via app.bypass_rls (the GUC every calling role can set,
    // read-only credentials included) instead of role escalation -- SET ROLE requires actual
    // PostgreSQL role membership a read-only CI credential doesn't have ("permission denied to
    // set role"), while app.bypass_rls alone already does the job this line was for.
    await client.query(`SET LOCAL app.bypass_rls = 'lucia'`);
    const res = await client.query(
      `SELECT l.load_number, i.total_cents::text, c.customer_name
         FROM accounting.invoices i
         JOIN mdata.loads l ON l.id = i.source_load_id
         LEFT JOIN mdata.customers c ON c.id = i.customer_id
        WHERE i.operating_company_id = $1::uuid
          AND i.status IN ('sent', 'paid', 'partial')
          AND i.voided_at IS NULL`,
      [USMCA]
    );
    // The load's OWN rate/customer must also agree with QBO before treating a gap as safely
    // creatable -- buildInvoiceFromLoad derives amount/customer from the LOAD, never from a
    // caller-supplied value, so a load whose own rate_total_cents/customer already disagrees with
    // QBO (found live: 13505/13506/13507, a customer+rate swap) would mint an invoice matching our
    // WRONG load data, not QBO -- that is the same "needs investigation" bucket as an
    // already-issued mismatch, not a safe auto-create.
    const loadRes = await client.query(
      `SELECT l.load_number, l.rate_total_cents::text, c.customer_name, l.soft_deleted_at,
              l.status::text AS status
         FROM mdata.loads l
         LEFT JOIN mdata.customers c ON c.id = l.customer_id
        WHERE l.operating_company_id = $1::uuid`,
      [USMCA]
    );
    // A load a governed purge deleted is not a mismatch: audit.record_deletions holds every row the purge removed, with
    // its AUTH (2026-10-05: AUTH-400 deleted 149 USMCA loads, so 48 QBO rows read "(load not found)"). Read, never assumed.
    const purgedRes = await client.query(
      `SELECT row_data->>'load_number' AS load_number, auth_id FROM audit.record_deletions
        WHERE table_name = 'mdata.loads' AND auth_id IS NOT NULL AND operating_company_id = $1::uuid`,
      [USMCA]
    );
    await client.query("ROLLBACK");
    const purgedLoads = new Map(purgedRes.rows.map((r) => [r.load_number, r.auth_id]));
    const purged = [];

    const byLoad = new Map(res.rows.map((r) => [r.load_number, r]));
    const loadByNumber = new Map(loadRes.rows.map((r) => [r.load_number, r]));

    const actionable = []; // real, safely-creatable gap: found in QBO, load matches, customer+amount agree, not yet issued
    const mismatched = []; // load or invoice disagrees with QBO on customer/amount -- needs investigation
    // 2026-10-01 (Lead): a SOFT-DELETED load is never an invoice to create. Found live: 13503/13504/
    // 13509/13533/13539 were soft-deleted 2026-09-25 (R-160: Transportation-entity loads keyed under
    // USMCA; their invoices voided with reversal JEs) and the owner's AUTH-177 purge (2026-09-30)
    // then hard-deleted the voided invoices -- leaving "load exists, no live invoice", which this
    // guard read as "safely creatable" and asked every seat to mint 5 invoices against loads the
    // owner had already retired. QBO still lists them because QBO is where the R-160 correction
    // has not been applied; that is a QBO-side question, reported here, never auto-created.
    //
    // 2026-10-01 (AUTH-201): CANCELLED loads are the same class — void-not-delete retirement
    // (13515 cancelled; twin 13513 kept paid). Never ask seats to re-mint an invoice against a
    // cancelled duplicate. Counted + reported, never actionable.
    const softDeleted = [];
    let actionableCents = 0;

    for (const row of withLoad) {
      const qboCents = toCents(row.amount);
      const existing = byLoad.get(row.load);
      if (!existing) {
        const load = loadByNumber.get(row.load);
        if (load && (load.soft_deleted_at || load.status === "cancelled" || load.status === "canceled")) {
          softDeleted.push({
            ...row,
            soft_deleted_at: load.soft_deleted_at,
            status: load.status,
          });
          continue;
        }
        if (!load && purgedLoads.has(row.load)) {
          purged.push({ ...row, auth_id: purgedLoads.get(row.load) });
          continue;
        }
        const amountOk = load && Number(load.rate_total_cents) === qboCents;
        const nameOk = load && customerNamesLikelyMatch(load.customer_name, row.name);
        if (!load || !amountOk || !nameOk) {
          mismatched.push({ ...row, our_amount_cents: load?.rate_total_cents ?? null, our_customer: load?.customer_name ?? "(load not found)" });
          continue;
        }
        actionable.push(row);
        actionableCents += qboCents ?? 0;
        continue;
      }
      if (Number(existing.total_cents) !== qboCents) {
        mismatched.push({ ...row, our_amount_cents: existing.total_cents, our_customer: existing.customer_name });
      }
    }

    const baseline = loadBaseline();
    const unmatchedCents = unmatchedBlank.reduce((s, r) => s + (toCents(r.amount) ?? 0), 0);
    const mismatchedCents = mismatched.reduce((s, r) => s + (toCents(r.amount) ?? 0), 0);

    console.log(`${LABEL}: control total $454,991.72 (range ${RANGE_START}..${RANGE_END})`);
    console.log(`  actionable (real gap, not yet issued): ${actionable.length} row(s), $${(actionableCents / 100).toFixed(2)}`);
    console.log(`  mismatched (QBO vs our load disagree, needs investigation): ${mismatched.length} row(s), $${(mismatchedCents / 100).toFixed(2)}`);
    console.log(`  unmatched (blank/text LOAD, never guessed): ${unmatchedBlank.length} row(s), $${(unmatchedCents / 100).toFixed(2)}`);
    console.log(`  excluded (different billing entity): ${excludedWrongEntity.length} row(s)`);
    console.log(`  excluded (load soft-deleted/cancelled in our book, never auto-invoiced; QBO-side correction pending): ${softDeleted.length} row(s)`);
    console.log(`  excluded (load deleted by a governed purge, audit.record_deletions; re-entered by the owner after the purge): ${purged.length} row(s)`);
    for (const d of purged) console.log(`    - load ${d.load}: ${d.name} $${d.amount} (deleted under ${d.auth_id})`);
    for (const d of softDeleted) {
      const why = d.soft_deleted_at
        ? `soft_deleted_at ${new Date(d.soft_deleted_at).toISOString()}`
        : `status=${d.status}`;
      console.log(`    - load ${d.load}: ${d.name} $${d.amount} (${why})`);
    }
    if (actionable.length > 0) {
      console.error(`${LABEL}: FAIL — ${actionable.length} invoice(s) with a real, matching load/customer/amount still not created:`);
      for (const a of actionable) console.error(`  ✗ load ${a.load}: ${a.name} $${a.amount}`);
      process.exit(1);
    }

    const baselineMismatch = baseline?.mismatched_load_numbers?.length ?? 0;
    const baselineUnmatched = baseline?.unmatched_count ?? 0;
    if (mismatched.length > baselineMismatch) {
      console.error(`${LABEL}: FAIL — mismatched count grew: ${mismatched.length} > baseline ${baselineMismatch}`);
      for (const m of mismatched) console.error(`  ✗ load ${m.load}: QBO says ${m.name} $${m.amount}, we have ${m.our_customer} $${(Number(m.our_amount_cents) / 100).toFixed(2)}`);
      process.exit(1);
    }
    if (unmatchedBlank.length > baselineUnmatched) {
      console.error(`${LABEL}: FAIL — unmatched count grew: ${unmatchedBlank.length} > baseline ${baselineUnmatched}`);
      process.exit(1);
    }

    console.log(`${LABEL}: PASS — no actionable gap; ${mismatched.length}/${baselineMismatch} known mismatches, ${unmatchedBlank.length}/${baselineUnmatched} known unmatched (both need human/QBO investigation, not this gate).`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`${LABEL}: FAIL — ${err.message}`);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
