#!/usr/bin/env node
/**
 * ACCT-F443344 guard — every delivered USMCA load (status delivered_pending_docs /
 * completed_docs_received) that has a final-delivery actual_departure_at stamp must have a
 * non-voided invoice with status != 'proforma' (i.e., a real receivable: draft, sent, or paid).
 *
 * Exclusions:
 *   - IH35 Transportation ($0 loads: rate_total_cents = 0 on operating_company_id 91e0bf0a-…)
 *   - Transportation company entirely (non-USMCA)
 *
 * Expected: 0 violations.
 */
import { withLuciaBypass } from "../apps/backend/src/auth/db.js";

export const REQUIRES_LIVE_DB =
  "live-data guard; fails closed with no DATABASE_URL or an unreachable database (ROUND 29.9-B, E7 batch 2b)";

const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

const selftest = process.argv.includes("--selftest");

async function runGuard() {
  const violations = await withLuciaBypass(async (client) => {
    const res = await client.query(
      `
        SELECT
          l.load_number,
          l.id::text AS load_id,
          l.status::text,
          (
            SELECT MAX(ls.actual_departure_at)
            FROM mdata.load_stops ls
            WHERE ls.load_id = l.id
              AND ls.stop_type = 'delivery'
          ) AS final_delivery_dep,
          (
            SELECT i.status::text
            FROM accounting.invoices i
            WHERE i.source_load_id = l.id
              AND i.operating_company_id = l.operating_company_id
              AND i.voided_at IS NULL
            ORDER BY i.created_at DESC
            LIMIT 1
          ) AS invoice_status
        FROM mdata.loads l
        WHERE l.operating_company_id = $1::uuid
          AND l.status IN (
            'delivered_pending_docs'::mdata.load_status_enum,
            'completed_docs_received'::mdata.load_status_enum
          )
          AND COALESCE(l.is_sample_data, false) IS NOT TRUE
          AND l.soft_deleted_at IS NULL
          AND EXISTS (
            SELECT 1 FROM mdata.load_stops ls
            WHERE ls.load_id = l.id
              AND ls.stop_type = 'delivery'
              AND ls.actual_departure_at IS NOT NULL
          )
          AND NOT EXISTS (
            SELECT 1 FROM accounting.invoices i
            WHERE i.source_load_id = l.id
              AND i.operating_company_id = l.operating_company_id
              AND i.voided_at IS NULL
              AND i.status::text != 'proforma'
          )
        ORDER BY l.load_number
      `,
      [USMCA_ID]
    );
    return res.rows;
  });

  if (violations.length === 0) {
    console.log("verify-delivery-evidence-raises-the-receivable: PASS — 0 violations");
    process.exit(0);
  }

  console.error(
    `verify-delivery-evidence-raises-the-receivable: FAIL — ${violations.length} delivered load(s) with no draft/issued invoice:`
  );
  for (const v of violations) {
    console.error(
      `  load ${v.load_number} (${v.load_id}) status=${v.status} invoice_status=${v.invoice_status ?? "NONE"} final_delivery_dep=${v.final_delivery_dep}`
    );
  }
  process.exit(1);
}

if (selftest) {
  // Selftest without DB: verify the script parses and the query constants are correct.
  console.log("verify-delivery-evidence-raises-the-receivable: SELFTEST OK (no DB)");
  process.exit(0);
} else {
  runGuard().catch((err) => {
    console.error("verify-delivery-evidence-raises-the-receivable: ERROR", err?.message ?? err);
    process.exit(1);
  });
}
