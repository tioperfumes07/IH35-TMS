/**
 * ACCT-TIEOUT-01 repair — NOT RUN (owner 2026-10-01: "we do not feed any data now"). Kept ready for the day the owner says feed.
 * Measured on prod 2026-10-01 (lucia): A/R GL 34,560,912c vs open invoices 36,640,912c; the 2,080,000c gap is exactly
 * USMCA invoices 13616/13618/13620/13621/13622 (570,000 + 370,000 + 430,000 + 490,000 + 220,000): created 2026-09-28 11:26Z
 * in one direct batch (created_by NULL, no audit row), ZERO invoice_lines, flipped to status='sent' 17:36:58Z (sent_at NULL),
 * never through sendDraftInvoice -> postInvoiceGlIfEnabled, so no DR A/R / CR revenue JE exists (poster refuses them:
 * INVOICE_LINE_REVENUE_UNRESOLVED). Dry run (default) rolls back; --apply commits with one audit row.
 * What it does per invoice: (1) adds the one linehaul line the send path would have written (same shape as sibling 13617:
 * line_type/revenue_code 'linehaul', the entity's single "Freight / Line-haul Income" account, total = header total = load
 * rate_total_cents, source_load_id) only when the invoice has zero live lines and total = load rate; (2) posts through the SAME
 * poster the send path uses (postInvoiceGlIfEnabled: flag-gated, latch-aware, idempotent); (3) stamps sent_at from updated_at.
 * Dry run measured 2026-10-01: 5 lines added, 5 posted, A/R GL 34,560,912c -> 36,640,912c = open invoices (tie-out 0).
 */
import pg from "pg";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
// ROUND 133 P0: a production financial write needs an OPEN owner authorization on main. Owner 2026-10-01: "we do not feed any
// data now" — no AUTH is issued for this script, so --apply is refused until one exists in docs/bus/OWNER-AUTHORIZATIONS.md.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
if (process.argv.includes("--apply")) {
  const REQUIRED_AUTH_ID = process.env.OWNER_AUTH_ID;
  if (!REQUIRED_AUTH_ID) { console.error("ROUND 133 P0: OWNER_AUTH_ID env var is required; refusing a production financial write without an OPEN authorization on main."); process.exit(1); }
  try { execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), REQUIRED_AUTH_ID], { stdio: "inherit" }); }
  catch { console.error(`ROUND 133 P0: ${REQUIRED_AUTH_ID} rejected -- see docs/bus/OWNER-AUTHORIZATIONS.md.`); process.exit(1); }
}
import { assertIsIntendedProduction } from "../lib/assert-not-production.mjs";
import { postInvoiceGlIfEnabled } from "../../apps/backend/src/accounting/invoice-gl.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const SYSTEM_ACTOR = "00000000-0000-4000-8000-000000000001";
const APPLY = process.argv.includes("--apply");

async function arGl(client: pg.PoolClient) {
  const r = await client.query<{ ar_gl: string; ar_open: string }>(
    `SELECT (SELECT coalesce(sum(CASE WHEN p.debit_or_credit='debit' THEN p.amount_cents ELSE -p.amount_cents END),0) FROM accounting.journal_entry_postings p
               JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
              WHERE je.operating_company_id = $1::uuid AND je.status = 'posted'
                AND p.account_id = (SELECT account_id FROM accounting.chart_of_accounts_roles WHERE operating_company_id = $1::uuid AND role = 'ar_control' AND is_active LIMIT 1))::text AS ar_gl,
            (SELECT coalesce(sum(amount_open_cents),0) FROM accounting.invoices WHERE operating_company_id = $1::uuid AND voided_at IS NULL AND status IN ('sent','partial'))::text AS ar_open`, [USMCA]);
  return r.rows[0];
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    if (APPLY) await assertIsIntendedProduction(client, { label: "lead-post-unposted-sent-invoices" });
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE neondb_owner"); // NEONDB-OWNER-OK: ops script, owner-directed, posts through the canonical poster
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    await client.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
    const arBefore = await arGl(client);
    const targets = await client.query<{ id: string; display_id: string; total_cents: string; updated_at: string }>(
      `SELECT i.id::text, i.display_id, i.total_cents::text, i.updated_at::text FROM accounting.invoices i
        WHERE i.operating_company_id = $1::uuid AND i.voided_at IS NULL AND i.status IN ('sent','partial') AND i.total_cents > 0
          AND NOT EXISTS (SELECT 1 FROM accounting.journal_entry_postings p JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
                           WHERE p.source_transaction_type = 'invoice' AND p.source_transaction_id = i.id::text AND je.status = 'posted')
        ORDER BY i.display_id`, [USMCA]);
    console.log("TARGETS", targets.rows);
    const outcomes: Array<Record<string, unknown>> = [];
    for (const t of targets.rows) {
      const added = await client.query(
        `INSERT INTO accounting.invoice_lines (id, operating_company_id, invoice_id, source_load_id, line_type, description, quantity, unit_amount_cents, line_total_cents, display_order, revenue_code, account_id)
         SELECT gen_random_uuid(), i.operating_company_id, i.id, i.source_load_id, 'linehaul', 'Linehaul · Load ' || l.load_number, 1, i.total_cents, i.total_cents, 0, 'linehaul',
                (SELECT il.account_id FROM accounting.invoice_lines il JOIN accounting.invoices s ON s.id = il.invoice_id
                  WHERE s.operating_company_id = i.operating_company_id AND il.line_type = 'linehaul' AND il.soft_deleted_at IS NULL AND il.account_id IS NOT NULL
                  GROUP BY il.account_id ORDER BY count(*) DESC LIMIT 1)
           FROM accounting.invoices i JOIN mdata.loads l ON l.id = i.source_load_id
          WHERE i.id = $1::uuid AND i.total_cents > 0 AND i.total_cents = l.rate_total_cents
            AND NOT EXISTS (SELECT 1 FROM accounting.invoice_lines x WHERE x.invoice_id = i.id AND x.soft_deleted_at IS NULL)
         RETURNING id::text, line_total_cents::text, account_id::text`, [t.id]);
      const r = await postInvoiceGlIfEnabled(client as never, USMCA, t.id, { userId: SYSTEM_ACTOR });
      const je = r.posted ? await client.query<{ id: string; n: string }>(
        `SELECT je.id::text, count(p.*)::text AS n FROM accounting.journal_entries je JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid = je.id
          WHERE p.source_transaction_type = 'invoice' AND p.source_transaction_id = $1 GROUP BY je.id`, [t.id]) : null;
      if (r.posted) await client.query(`UPDATE accounting.invoices SET sent_at = coalesce(sent_at, updated_at) WHERE id = $1::uuid`, [t.id]);
      outcomes.push({ display_id: t.display_id, total_cents: t.total_cents, line_added: added.rows[0] ?? null, posted: r.posted, reason: (r as { reason?: string }).reason ?? null, code: (r as { code?: string }).code ?? null, message: (r as { message?: string }).message ?? null, je: je?.rows ?? null });
    }
    console.log("OUTCOMES", JSON.stringify(outcomes, null, 1));
    const arAfter = await arGl(client);
    console.log("A/R GL before/after", arBefore, arAfter);
    if (APPLY) {
      await client.query(
        `INSERT INTO audit.audit_events (uuid, created_at, event_class, severity, payload, actor_user_uuid, source)
         VALUES (gen_random_uuid(), now(), 'accounting.invoice.gl_post.backfilled_by_lead_ops', 'warning', $1::jsonb, $2::uuid, 'LEAD-2026-10-01-POST-UNPOSTED-SENT-INVOICES')`,
        [JSON.stringify({ outcomes, ar_before: arBefore, ar_after: arAfter, reason: "ACCT-TIEOUT-01: five sent invoices never passed the send path and carried no line / A/R JE; line added as the send path writes it; posted through postInvoiceGlIfEnabled" }), SYSTEM_ACTOR]);
      await client.query("COMMIT"); console.log("COMMITTED");
    } else { await client.query("ROLLBACK"); console.log("DRY RUN — rolled back"); }
  } finally { client.release(); await pool.end(); }
}
main().catch((err) => { console.error(err); process.exit(1); });
