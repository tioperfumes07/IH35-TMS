/**
 * ROUND 285.4.10 — after a BOL (ROUND 321: or a POD) is saved+linked to a load, retry auto-invoice → Faro submit.
 * Swallow-and-log: never 500 a document upload because invoicing hiccuped.
 */
import { withCompanyScope } from "../accounting/shared.js";
import { autoInvoiceOnBol, BILLING_EVIDENCE_DOC_CODES } from "../accounting/auto-invoice-on-bol.service.js";
import { autoSubmitDeliveredLoadToFactor } from "../factoring/auto-submit-on-delivery.service.js";
import { isDeliveryEvidenceStatus } from "../dispatch/delivery-evidence-status.js";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

/**
 * If this file is a completed BOL linked to a delivery-evidence load, mint/send the invoice and
 * auto-submit to factoring. Safe to call from upload-complete and link create.
 */
export async function maybeFireAutoInvoiceAfterBolSaved(input: {
  client: Queryable;
  fileId: string;
  actorUserId: string;
}): Promise<void> {
  try {
    const meta = await input.client.query<{
      operating_company_id: string;
      category_code: string | null;
      upload_completed_at: string | null;
      load_id: string;
      load_status: string;
    }>(
      `
        SELECT
          df.operating_company_id::text,
          dfc.code AS category_code,
          df.upload_completed_at::text,
          l.id::text AS load_id,
          l.status::text AS load_status
        FROM docs.files df
        LEFT JOIN catalogs.file_categories dfc ON dfc.id = df.category_id
        JOIN docs.file_links dfl
          ON dfl.file_id = df.id
          AND dfl.entity_type = 'load'
          AND dfl.deleted_at IS NULL
        JOIN mdata.loads l ON l.id = dfl.entity_id AND l.operating_company_id = df.operating_company_id
        WHERE df.id = $1::uuid
          AND df.deleted_at IS NULL
        LIMIT 1
      `,
      [input.fileId]
    );
    const row = meta.rows[0];
    if (!row) return;
    // ROUND 321 item 6: a signed BOL OR a signed POD releases the invoice (one shared list).
    if (!(BILLING_EVIDENCE_DOC_CODES as readonly string[]).includes(row.category_code ?? "")) return;
    if (!row.upload_completed_at) return;
    if (!isDeliveryEvidenceStatus(row.load_status)) return;

    const oci = row.operating_company_id;
    const loadId = row.load_id;

    // Fresh company-scoped connection: invoice send + factoring must not share the docs txn.
    void withCompanyScope(input.actorUserId, oci, async (scoped) => {
      const invoiced = await autoInvoiceOnBol(scoped as never, {
        operatingCompanyId: oci,
        loadId,
        userId: input.actorUserId,
        bypassPipelineFlag: true,
      });
      if (!invoiced.ok) {
        console.warn(
          { load_id: loadId, reason: invoiced.reason, detail: invoiced.detail },
          "auto_invoice_after_bol_upload_skipped"
        );
        return;
      }
      await autoSubmitDeliveredLoadToFactor({
        operatingCompanyId: oci,
        loadId,
        actorUserId: input.actorUserId,
      });
    }).catch((err) => {
      console.warn({ err, load_id: loadId, file_id: input.fileId }, "auto_invoice_after_bol_upload_failed");
    });
  } catch (err) {
    console.warn({ err, file_id: input.fileId }, "maybe_fire_auto_invoice_after_bol_failed");
  }
}
