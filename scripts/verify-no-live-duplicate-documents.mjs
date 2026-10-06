#!/usr/bin/env node
// verify-no-live-duplicate-documents.mjs — ROUND 383 (Lead, 2026-10-03).
//
// OWNER, 2026-10-03: "make sure no more duplicates in the app will be created when I create the
// documents, that they post in correct accounts, that accounts balance."
//
// The purge deletes duplicate ROWS. It does not delete the PATH that made them, and the owner
// re-uploads the same data within hours. This guard is the thing that notices if the path is still
// open — on the day of the re-upload, not a month later.
//
// Measured on production 2026-10-03: 11 live duplicate expense groups, 22 rows, EVERY ONE a LOVES
// fuel purchase, none voided. Same vendor, same date, same amount, two documents. And 6160 Parts &
// Supplies carries a 44.28 balance that is exactly two unreversed 22.14 expenses from 2026-08-29
// with the same memo — the same pattern, missed by whoever cleaned up the September ones.
//
// SAME AMOUNT + SAME DAY + SAME VENDOR IS A SIGNAL, NOT A VERDICT. Two real fills can happen. So this
// guard REPORTS and RATCHETS rather than deciding: the count may only go down, and each group is
// resolved by a human against the provider's transaction id (ROUND 367.8). What it refuses is the
// count GROWING, which is the only thing we can say is wrong without looking at the receipts.
//
// READ ONLY. DIRECT endpoint — a 0 from the pooler is MASKED, not empty.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

// --selftest (Devin build order 2026-10-05): live-DB guards cannot be fixture-tested — their inputs
// are rows on Neon. One case MUST pass (live check green, or the canonical no-credential refusal
// when nothing resolves locally) and one MUST fail (dead credential — it must refuse, never green).
if (process.argv.includes("--selftest")) { await selftest_verify_no_live_duplicate_documents(); }
async function selftest_verify_no_live_duplicate_documents() {
  const { runGuard, reportSelftest, statusOf, outputOf, DEAD_DB_ENV } = await import("./lib/guard-selftest.mjs");
  const { fileURLToPath } = await import("node:url");
  const me = fileURLToPath(import.meta.url);
  const real = runGuard(me);
  const noDb = runGuard(me, { env: DEAD_DB_ENV });
  const refused = /DATABASE_URL (?:is )?(?:not set|unset|required)|credential/.test(outputOf(real));
  reportSelftest("verify_no_live_duplicate_documents", [
    { name: "live check green, or canonically refuses with no credential", pass: statusOf(real) === 0 || refused, detail: statusOf(real) === 0 ? undefined : outputOf(real).slice(-300) },
    { name: "refuses on dead credential", pass: statusOf(noDb) !== 0, detail: statusOf(noDb) !== 0 ? undefined : outputOf(noDb).slice(-200) },
  ]);
}


const LABEL = "verify-no-live-duplicate-documents";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = path.join(ROOT, "scripts/verify-no-live-duplicate-documents.baseline.json");

const main = async () => {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  let groups = 0, rows = 0;
  const detail = [];
  try {
    await client.query("BEGIN READ ONLY");
    await client.query(`SET LOCAL app.bypass_rls = 'lucia'`);
    const who = await client.query(`SELECT current_user AS u`);
    if (who.rows[0].u === "ih35_app") {
      console.error(`${LABEL}: FAIL — connected as ih35_app (the POOLER). A 0 here would be masked, not empty.`);
      await client.query("ROLLBACK");
      return 1;
    }
    const r = await client.query(
      `SELECT COALESCE(v.vendor_name, '(no vendor)') AS party,
              x.transaction_date::date AS d,
              x.total_amount_cents AS amt,
              count(*)::int AS n,
              string_agg(x.expense_number, ' | ' ORDER BY x.expense_number) AS ids
         FROM accounting.expenses x
         LEFT JOIN mdata.vendors v ON v.id = x.vendor_uuid
        WHERE x.operating_company_id = $1 AND x.voided_at IS NULL
        GROUP BY 1, 2, 3
       HAVING count(*) > 1
        ORDER BY count(*) DESC, 3 DESC`,
      [USMCA]
    );
    groups = r.rows.length;
    for (const x of r.rows) {
      rows += x.n;
      detail.push(`${x.party} · ${x.d.toISOString().slice(0, 10)} · ${(Number(x.amt) / 100).toFixed(2)} · x${x.n} · ${x.ids}`);
    }
    await client.query("ROLLBACK");
  } finally {
    client.release();
    await pool.end();
  }

  let baseline = null;
  try { baseline = JSON.parse(fs.readFileSync(BASELINE, "utf8")); } catch { /* first run */ }

  console.log(`${LABEL} — ${groups} live duplicate group(s), ${rows} row(s) · USMCA`);
  for (const d of detail) console.log(`  ${d}`);

  if (process.argv.includes("--write-baseline")) {
    fs.writeFileSync(BASELINE, JSON.stringify({ measured_at: new Date().toISOString(), groups, rows, detail }, null, 2) + "\n");
    console.log(`${LABEL}: baseline written at ${groups} group(s) / ${rows} row(s)`);
    return 0;
  }

  if (!baseline) {
    console.log(`${LABEL}: no baseline yet — run with --write-baseline to pin today's count. SHRINK-ONLY from then on.`);
    return 0;
  }

  if (groups > baseline.groups || rows > baseline.rows) {
    console.error(
      `\n${LABEL}: FAIL — live duplicates GREW: ${baseline.groups} -> ${groups} group(s), ${baseline.rows} -> ${rows} row(s).\n` +
        `A duplicate is OFFERED, never silently created (ROUND 367.8): an incoming document matching an existing one on the\n` +
        `provider's transaction id is REFUSED; one matching only on vendor + date + amount is SURFACED for the owner to rule.\n` +
        `If the count grew, that path is open again — and the owner re-uploads every load and expense within hours.\n`
    );
    return 1;
  }

  console.log(
    groups < baseline.groups
      ? `${LABEL}: PASS — shrank from ${baseline.groups} to ${groups} group(s). Run --write-baseline to lock the new floor.`
      : `${LABEL}: PASS — unchanged at ${groups} group(s) / ${rows} row(s). Each group is still owed a verdict against the provider's transaction id.`
  );
  return 0;
};

main().then((c) => process.exit(c)).catch((e) => { console.error(`${LABEL}: FAIL — ${e.message}`); process.exit(1); });
