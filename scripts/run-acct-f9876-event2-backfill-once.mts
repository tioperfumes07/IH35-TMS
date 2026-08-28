/**
 * ACCT-F9876 BACKFILL — revrec Event 2 (bill) never fired for invoices issued before the
 * OWNER DECISION B trigger existed, and for any issued through the bulk writers before
 * GO-0014 event2-silent-on-issued-invoices wired them.
 *
 * Calls the EXACT production Event 2 poster, postLoadRevenueLatch(), once per eligible invoice.
 * NO new GL math. NO second A/R poster. NO hand-written JE.
 *
 * Usage:
 *   DATABASE_URL=<direct, non-pooled> npx tsx scripts/run-acct-f9876-event2-backfill-once.mts
 *   DATABASE_URL=<direct, non-pooled> npx tsx scripts/run-acct-f9876-event2-backfill-once.mts --commit
 *   ... [--include-sample] [--entry-date=today]
 */
import pg from "pg";
import { withCompanyScope } from "../apps/backend/src/accounting/shared.js";
import { postLoadRevenueLatch } from "../apps/backend/src/accounting/revrec-delivery-posting/poster.service.js";
import { resolveRoleAccountOptional } from "../apps/backend/src/accounting/coa-roles/resolver.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR_USER_UUID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

const COMMIT = process.argv.includes("--commit");
const INCLUDE_SAMPLE = process.argv.includes("--include-sample");
const ENTRY_DATE_TODAY = process.argv.includes("--entry-date=today");

const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL || "";
if (!dbUrl) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL required");
if (/-pooler\./.test(dbUrl)) throw new Error("Refusing a pooled connection string.");

type Candidate = {
  invoice_id: string;
  display_id: string;
  status: string;
  is_sample_data: boolean;
  total_cents: number;
  source_load_id: string;
  issued_date: string;
  earn_cents: number | null;
  bill_cents: number | null;
};

async function readArTieOut(client: any): Promise<{ gl: number; sub: number; diff: number } | null> {
  const arAccountId = await resolveRoleAccountOptional(client, USMCA, "ar_control" as never);
  if (!arAccountId) return null;
  const glRes = await client.query(
    `SELECT COALESCE(SUM(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END), 0)::text AS cents
       FROM accounting.journal_entry_postings p
       JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
      WHERE p.operating_company_id = $1::uuid AND p.account_id = $2::uuid
        AND je.status <> 'voided' AND COALESCE(je.is_sample_data, false) = false`,
    [USMCA, arAccountId]
  );
  const subRes = await client.query(
    `SELECT COALESCE(SUM(amount_open_cents), 0)::text AS cents
       FROM accounting.invoices
      WHERE operating_company_id = $1::uuid AND voided_at IS NULL AND status NOT IN ('draft', 'proforma')
        AND COALESCE(is_sample_data, false) = false`,
    [USMCA]
  );
  const gl = Number(glRes.rows[0]?.cents ?? 0);
  const sub = Number(subRes.rows[0]?.cents ?? 0);
  return { gl, sub, diff: gl - sub };
}

async function findCandidates(client: any): Promise<Candidate[]> {
  const res = await client.query(
    `
    SELECT i.id::text            AS invoice_id,
           i.display_id,
           i.status,
           i.is_sample_data,
           i.total_cents,
           i.source_load_id::text AS source_load_id,
           to_char(COALESCE(i.sent_at::date, i.issue_date, i.created_at::date), 'YYYY-MM-DD') AS issued_date,
           (SELECT p.amount_cents FROM accounting.load_revenue_recognition_postings p
             WHERE p.load_id = i.source_load_id AND p.operating_company_id = i.operating_company_id
               AND p.event = 'earn' AND p.is_active LIMIT 1) AS earn_cents,
           (SELECT p.amount_cents FROM accounting.load_revenue_recognition_postings p
             WHERE p.load_id = i.source_load_id AND p.operating_company_id = i.operating_company_id
               AND p.event = 'bill' AND p.is_active LIMIT 1) AS bill_cents
      FROM accounting.invoices i
     WHERE i.operating_company_id = $1::uuid
       AND i.voided_at IS NULL
       AND i.source_load_id IS NOT NULL
       AND i.status IN ('sent', 'partial', 'paid', 'factored')
     ORDER BY i.created_at
    `,
    [USMCA]
  );
  return res.rows.map((r: any) => ({
    ...r,
    total_cents: Number(r.total_cents),
    earn_cents: r.earn_cents === null ? null : Number(r.earn_cents),
    bill_cents: r.bill_cents === null ? null : Number(r.bill_cents),
  }));
}

const usd = (cents: number) =>
  `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function main() {
  const pool = new pg.Pool({ connectionString: dbUrl, max: 2 });
  try {
    const all = await withCompanyScope(ACTOR_USER_UUID, USMCA, (c: any) => findCandidates(c));

    const missing = all.filter((c) => c.bill_cents === null);
    const realMissing = missing.filter((c) => !c.is_sample_data);
    const sampleMissing = missing.filter((c) => c.is_sample_data);
    const targets = INCLUDE_SAMPLE ? missing : realMissing;

    console.log(`\nACCT-F9876 Event 2 backfill — USMCA — ${COMMIT ? "COMMIT" : "DRY RUN"}`);
    console.log(`  issued invoices with a source load : ${all.length}`);
    console.log(`  already have Event 2 (bill)        : ${all.length - missing.length}`);
    console.log(
      `  MISSING Event 2 — real            : ${realMissing.length}  ${usd(realMissing.reduce((s, c) => s + c.total_cents, 0))}`
    );
    console.log(
      `  MISSING Event 2 — sample          : ${sampleMissing.length}  ${usd(sampleMissing.reduce((s, c) => s + c.total_cents, 0))}${INCLUDE_SAMPLE ? "  (INCLUDED)" : "  (not run — pass --include-sample)"}`
    );

    const before = await withCompanyScope(ACTOR_USER_UUID, USMCA, (c: any) => readArTieOut(c));
    if (!before) {
      console.log("\n  ar_control role is not bound for USMCA — the detector skips this leg and so does this script.\n");
      return;
    }
    console.log(`\n  BEFORE (detector basis)  GL A/R ${usd(before.gl)}   subledger ${usd(before.sub)}   diff ${usd(before.diff)}`);

    if (targets.length === 0) {
      console.log("\nNothing to do.\n");
      return;
    }

    console.log("");
    const verdicts: { display_id: string; reason: string; je?: string }[] = [];
    for (const c of targets) {
      const entryDate = ENTRY_DATE_TODAY ? new Date().toISOString().slice(0, 10) : c.issued_date;
      const label = `${c.display_id.padEnd(28)} ${c.status.padEnd(9)} ${usd(c.total_cents).padStart(12)}  earn=${c.earn_cents === null ? "MISSING" : usd(c.earn_cents)}  entry_date=${entryDate}`;
      if (!COMMIT) {
        const wouldBlock = c.earn_cents === null ? "  >> WOULD REFUSE: earn_missing_for_bill" : "  >> would post DR 1100 / CR 1150";
        console.log(`  ${label}${wouldBlock}`);
        continue;
      }
      const res = await postLoadRevenueLatch({
        operating_company_id: USMCA,
        load_id: c.source_load_id,
        target_status: "completed_docs_received",
        entry_date_iso: entryDate,
        actor_user_id: ACTOR_USER_UUID,
      });
      const verdict = res.posted ? `POSTED je=${res.journal_entry_id}` : `refused: ${res.reason}`;
      verdicts.push({ display_id: c.display_id, reason: res.posted ? "posted" : String(res.reason), je: res.journal_entry_id });
      console.log(`  ${label}  >> ${verdict}`);
    }

    if (COMMIT) {
      const after = await withCompanyScope(ACTOR_USER_UUID, USMCA, (c: any) => readArTieOut(c));
      console.log(`\n  AFTER  (detector basis)  GL A/R ${usd(after!.gl)}   subledger ${usd(after!.sub)}   diff ${usd(after!.diff)}`);
      if (after!.diff === 0) console.log("  A/R control now TIES. The next cron tick should auto-resolve the finding.");
      else console.log(`  A/R control still off by ${usd(after!.diff)} — do NOT call this done; investigate the refusals above.`);
      const posted = verdicts.filter((v) => v.reason === "posted").length;
      console.log(`\n  posted ${posted} / ${verdicts.length}`);
      const refused = verdicts.filter((v) => v.reason !== "posted");
      if (refused.length) {
        console.log("  REFUSED (each is a real gate doing its job — investigate, do not force):");
        for (const r of refused) console.log(`    ${r.display_id}: ${r.reason}`);
      }
      console.log(
        "\n  NEXT: the ledger.integrity_cron tick (top of the hour, :20) re-evaluates\n" +
          "  subledger_tie_out_diff for USMCA ar_control. Do NOT declare this fixed from this\n" +
          "  script's output — declare it when _system.reconciliation_findings says so.\n"
      );
    } else {
      console.log("\n  DRY RUN — nothing written. Re-run with --commit to apply.\n");
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
