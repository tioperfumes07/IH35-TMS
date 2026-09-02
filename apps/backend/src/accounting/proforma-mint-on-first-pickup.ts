/**
 * GO-19 slice 04 / GO-27 Gate 2.3 — mint the NON-POSTING proforma at first pickup, never at book.
 *
 * Booking a load that is never picked up must not burn an invoice number or carry a revenue
 * projection for work that never happened. Delivery conversion (convertProformaToOfficial) is
 * unchanged and must not be called from here.
 *
 * Failures never 500 the pickup stamp: a savepoint isolates invoice work so stop evidence still
 * commits. load_has_no_rate is countable (ACCT-F289). Missing broker_advance column is countable
 * (WIRE-01). Other errors are swallowed and logged, matching the delivery latch.
 */
import { appendCrudAudit } from "../audit/crud-audit.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { buildInvoiceFromLoad } from "./from-load.js";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export type ProformaMintOnPickupInput = {
  operatingCompanyId: string;
  loadId: string;
  actorUserId: string;
  /** Stop that just received arrival/departure evidence. Must be the first pickup, or mint is skipped. */
  stopId: string;
};

export type ProformaMintOnPickupResult =
  | { outcome: "minted" | "idempotent"; invoice: Record<string, unknown> }
  | { outcome: "skipped"; reason: string };

async function firstPickupStop(
  client: Queryable,
  loadId: string
): Promise<{ id: string; actual_arrival_at: string | null; actual_departure_at: string | null } | null> {
  const res = await client.query<{
    id: string;
    actual_arrival_at: string | null;
    actual_departure_at: string | null;
  }>(
    `
      SELECT id::text AS id,
             actual_arrival_at::text AS actual_arrival_at,
             actual_departure_at::text AS actual_departure_at
        FROM mdata.load_stops
       WHERE load_id = $1::uuid
         AND stop_type = 'pickup'
         AND soft_deleted_at IS NULL
       ORDER BY sequence_number ASC
       LIMIT 1
    `,
    [loadId]
  );
  return res.rows[0] ?? null;
}

export async function mintProformaInvoiceOnFirstPickup(
  client: Queryable,
  input: ProformaMintOnPickupInput
): Promise<ProformaMintOnPickupResult> {
  await client.query("SAVEPOINT pickup_proforma_mint");
  try {
    const first = await firstPickupStop(client, input.loadId);
    if (!first) {
      await client.query("RELEASE SAVEPOINT pickup_proforma_mint");
      return { outcome: "skipped", reason: "no_pickup_stop" };
    }
    if (first.id !== input.stopId) {
      await client.query("RELEASE SAVEPOINT pickup_proforma_mint");
      return { outcome: "skipped", reason: "not_first_pickup" };
    }
    if (!first.actual_arrival_at && !first.actual_departure_at) {
      await client.query("RELEASE SAVEPOINT pickup_proforma_mint");
      return { outcome: "skipped", reason: "pickup_not_completed" };
    }

    const pipelineOn = await isEnabled(client as never, "INVOICE_PROFORMA_PIPELINE_ENABLED", {
      operating_company_id: input.operatingCompanyId,
      user_uuid: input.actorUserId,
    });
    if (!pipelineOn) {
      await client.query("RELEASE SAVEPOINT pickup_proforma_mint");
      return { outcome: "skipped", reason: "pipeline_flag_off" };
    }

    const col = await client.query<{ ok: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'accounting'
            AND table_name = 'invoices'
            AND column_name = 'broker_advance_applied_cents'
        ) AS ok
      `
    );
    if (!Boolean(col.rows[0]?.ok)) {
      await appendCrudAudit(
        client as never,
        input.actorUserId,
        "accounting.invoice.proforma_skipped_missing_column",
        {
          load_id: input.loadId,
          operating_company_id: input.operatingCompanyId,
          flag: "INVOICE_PROFORMA_PIPELINE_ENABLED",
          missing_column: "accounting.invoices.broker_advance_applied_cents",
          migration: "202609100090",
          trigger: "first_pickup",
        },
        "warning",
        "WIRE-01"
      );
      console.error(
        {
          load_id: input.loadId,
          operating_company_id: input.operatingCompanyId,
          missing_column: "accounting.invoices.broker_advance_applied_cents",
        },
        "wire_01_proforma_skipped_missing_column"
      );
      await client.query("RELEASE SAVEPOINT pickup_proforma_mint");
      return { outcome: "skipped", reason: "missing_column" };
    }

    try {
      const built = await buildInvoiceFromLoad(client as never, {
        userId: input.actorUserId,
        operatingCompanyId: input.operatingCompanyId,
        loadId: input.loadId,
        asProforma: true,
      });
      await client.query("RELEASE SAVEPOINT pickup_proforma_mint");
      return {
        outcome: built.idempotent ? "idempotent" : "minted",
        invoice: built.invoice,
      };
    } catch (error) {
      if ((error as { code?: string }).code !== "load_has_no_rate") throw error;
      await appendCrudAudit(
        client as never,
        input.actorUserId,
        "accounting.invoice.proforma_skipped_zero_rate",
        {
          load_id: input.loadId,
          operating_company_id: input.operatingCompanyId,
          flag: "INVOICE_PROFORMA_PIPELINE_ENABLED",
          reason: "load_has_no_rate",
          trigger: "first_pickup",
        },
        "warning",
        "ACCT-F289"
      );
      console.error(
        { load_id: input.loadId, operating_company_id: input.operatingCompanyId },
        "acct_f289_proforma_skipped_zero_rate"
      );
      await client.query("RELEASE SAVEPOINT pickup_proforma_mint");
      return { outcome: "skipped", reason: "load_has_no_rate" };
    }
  } catch (err) {
    try {
      await client.query("ROLLBACK TO SAVEPOINT pickup_proforma_mint");
    } catch {
      /* nested rollback already failed — outer still swallows */
    }
    console.warn({ err, load_id: input.loadId }, "go19_04_proforma_mint_on_pickup_failed");
    return { outcome: "skipped", reason: "mint_failed" };
  }
}
