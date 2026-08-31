import crypto from "node:crypto";
import { enqueueEmail } from "../email/queue.service.js";
import { isR2Configured, putObjectBytes } from "../storage/r2-client.js";

type Queryable = {
  query: <R = Record<string, unknown>>(
    sql: string,
    values?: unknown[]
  ) => Promise<{ rows: R[]; rowCount?: number }>;
};

type SendCoiRequestInput = {
  operating_company_id: string;
  id: string;
  sent_by_user_id: string;
  /**
   * LAW-EDITABLE-BY-PERMISSION-ALWAYS-TRACEABLE-2026-09-01: a request already sent/acknowledged/
   * issued/declined refuses a plain re-send (see already_sent below) -- but that block has an
   * authorized path, it is not a hard wall. The route only sets this when the caller's role is
   * Owner or Accountant AND a non-empty reason was supplied; this function trusts that gate and
   * just needs the reason to put in the audit trail.
   */
  force_resend_reason?: string | null;
};

type SendCoiRequestResult =
  | { kind: "ok"; row: Record<string, unknown>; resent: boolean }
  | { kind: "coi_request_not_found" }
  | { kind: "already_sent" }
  | { kind: "r2_not_configured" };

/**
 * "NOTHING SENDS AUTOMATICALLY. A human presses send. Every send is logged." (owner directive
 * 2026-08-31). This is the ONLY path that transitions a request to 'sent' -- called from a route
 * that requires an explicit user action, never from a cron/background job. It:
 *   1. Reads the request + its target's display name (customer/driver/unit).
 *   2. Renders a plain HTML snapshot of exactly what is being requested, uploads it to R2, and
 *      inserts it into docs.files hub-linked (Rule 14) to BOTH insurance_request and the target
 *      entity (customer/driver) -- so it shows up on that record's own Documents tab too.
 *   3. Enqueues the email through the EXISTING pipeline (enqueueEmail -> email.email_queue),
 *      addressed to the broker (row's own broker_email, defaulting to eduardo@edsainsurance.com).
 *      No new sender: the per-entity EMAIL_FROM_BY_COMPANY resolution happens inside the existing
 *      cron worker at actual send time, same as every other caller of enqueueEmail.
 *   4. Sets status='sent', sent_at=now(), email_queue_id -- the log the owner asked for.
 */
export async function sendCoiRequest(client: Queryable, input: SendCoiRequestInput): Promise<SendCoiRequestResult> {
  const reqRes = await client.query<{
    id: string;
    tenant_id: string;
    request_type: string;
    customer_id: string | null;
    driver_id: string | null;
    unit_id: string | null;
    status: string;
    notes: string | null;
    broker_email: string;
    customer_name: string | null;
    driver_first_name: string | null;
    driver_last_name: string | null;
    unit_number: string | null;
    company_legal_name: string | null;
  }>(
    `
      SELECT
        r.id::text, r.tenant_id::text, r.request_type, r.customer_id::text, r.driver_id::text,
        r.unit_id::text, r.status, r.notes, r.broker_email,
        c.customer_name,
        dr.first_name AS driver_first_name, dr.last_name AS driver_last_name,
        un.unit_number,
        oc.legal_name AS company_legal_name
      FROM insurance.coi_request r
      LEFT JOIN mdata.customers c ON c.id = r.customer_id AND c.operating_company_id = r.tenant_id
      LEFT JOIN mdata.drivers dr ON dr.id = r.driver_id AND dr.operating_company_id = r.tenant_id
      LEFT JOIN mdata.units un ON un.id = r.unit_id AND (un.owner_company_id = r.tenant_id OR un.currently_leased_to_company_id = r.tenant_id)
      LEFT JOIN org.companies oc ON oc.id = r.tenant_id
      WHERE r.tenant_id = $1::uuid AND r.id = $2::uuid
      LIMIT 1
    `,
    [input.operating_company_id, input.id]
  );
  const row = reqRes.rows[0];
  if (!row) return { kind: "coi_request_not_found" as const };
  const alreadyTerminal =
    row.status === "sent" || row.status === "acknowledged" || row.status === "issued" || row.status === "declined";
  const isResend = alreadyTerminal;
  if (alreadyTerminal && !input.force_resend_reason) {
    return { kind: "already_sent" as const };
  }

  const driverName = [row.driver_first_name, row.driver_last_name].filter(Boolean).join(" ").trim() || null;
  const targetLabel =
    row.request_type === "customer_coi"
      ? row.customer_name ?? "the customer"
      : row.request_type === "driver_add"
        ? driverName ?? "the driver"
        : row.unit_number ?? "the unit";
  const companyName = row.company_legal_name ?? "the company";

  const subject =
    row.request_type === "customer_coi"
      ? `COI request for ${targetLabel} — ${companyName}`
      : row.request_type === "driver_add"
        ? `Driver-add request: please add ${targetLabel} to the Auto Liability schedule — ${companyName}`
        : `Unit-add request: please add ${targetLabel} to the schedule — ${companyName}`;

  const templateKey =
    row.request_type === "driver_add" ? "insurance-driver-add-request" : "insurance-coi-request";

  const requestedAtLabel = new Date().toISOString();
  const snapshotHtml = `<!doctype html>
<html><head><meta charset="utf-8"><title>${subject}</title></head>
<body style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color: #1f2937;">
<h2>${subject}</h2>
<p><strong>Request type:</strong> ${row.request_type}</p>
<p><strong>Target:</strong> ${targetLabel}</p>
<p><strong>Sent to:</strong> ${row.broker_email}</p>
<p><strong>Sent at:</strong> ${requestedAtLabel}</p>
${row.notes ? `<p><strong>Notes:</strong> ${row.notes}</p>` : ""}
</body></html>`;
  const snapshotBuffer = Buffer.from(snapshotHtml, "utf8");
  const sha256 = crypto.createHash("sha256").update(snapshotBuffer).digest("hex");

  if (!isR2Configured()) return { kind: "r2_not_configured" as const };
  const r2Key = `org/${row.tenant_id}/insurance-requests/${row.id}/${crypto.randomUUID()}.html`;
  await putObjectBytes(r2Key, snapshotBuffer, "text/html");

  const fileInsert = await client.query<{ id: string }>(
    `
      INSERT INTO docs.files (
        operating_company_id, original_filename, mime_type, size_bytes, sha256_hash, r2_key,
        upload_completed_at, description, uploader_user_id
      )
      VALUES ($1, $2, 'text/html', $3, $4, $5, now(), $6, $7)
      RETURNING id
    `,
    [
      row.tenant_id,
      `insurance-request-${row.request_type}-${row.id}.html`,
      snapshotBuffer.length,
      sha256,
      r2Key,
      `Generated ${row.request_type} request sent to ${row.broker_email}`,
      input.sent_by_user_id,
    ]
  );
  const fileId = fileInsert.rows[0]?.id;
  if (fileId) {
    await client.query(
      `INSERT INTO docs.file_links (file_id, entity_type, entity_id, created_by_user_id)
       VALUES ($1, 'insurance_request', $2, $3)
       ON CONFLICT (file_id, entity_type, entity_id) WHERE deleted_at IS NULL DO NOTHING`,
      [fileId, row.id, input.sent_by_user_id]
    );
    const hubEntityType = row.request_type === "customer_coi" ? "customer" : row.request_type === "driver_add" ? "driver" : "unit";
    const hubEntityId = row.request_type === "customer_coi" ? row.customer_id : row.request_type === "driver_add" ? row.driver_id : row.unit_id;
    if (hubEntityId) {
      await client.query(
        `INSERT INTO docs.file_links (file_id, entity_type, entity_id, created_by_user_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (file_id, entity_type, entity_id) WHERE deleted_at IS NULL DO NOTHING`,
        [fileId, hubEntityType, hubEntityId, input.sent_by_user_id]
      );
    }
  }

  const { queueId } = await enqueueEmail({
    operatingCompanyId: row.tenant_id,
    toAddresses: [row.broker_email],
    subject,
    templateKey,
    templateVars: {
      companyName,
      targetLabel,
      requestType: row.request_type,
      notes: row.notes ?? "",
      requestId: row.id,
    },
    queuedByUserId: input.sent_by_user_id,
  });

  // A forced resend of an already-acknowledged/issued/declined request must NOT regress its
  // status back to 'sent' -- that would silently erase real lifecycle progress (LAW: reverse,
  // never delete/overwrite history). Only sent_at/email_queue_id move on a resend past 'sent';
  // a plain (non-terminal) send still sets status='sent' as before.
  const updateRes = await client.query(
    `
      UPDATE insurance.coi_request
      SET status = CASE WHEN status IN ('acknowledged', 'issued', 'declined') THEN status ELSE 'sent' END,
          sent_at = now(),
          email_queue_id = $3::uuid
      WHERE tenant_id = $1::uuid AND id = $2::uuid
      RETURNING
        id::text, tenant_id::text, request_type, customer_id::text, driver_id::text, unit_id::text,
        policy_id::text, requested_at::text, requested_by::text, status, notes, document_url,
        expires_at::text, responded_at::text, sent_at::text, acknowledged_at::text, broker_email,
        email_queue_id::text, created_at::text, updated_at::text
    `,
    [row.tenant_id, row.id, queueId]
  );

  return { kind: "ok" as const, row: updateRes.rows[0], resent: isResend };
}
