import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createHash, randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser, withLuciaBypass } from "../../auth/db.js";
import { addObjectWorksheet, writeWorkbookBuffer } from "../../lib/exceljs-workbook.js";

const FORENSIC_XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type BatchContext = {
  id: string;
  operating_company_id: string;
  qbo_realm_id: string;
};

type ForensicRow = Record<string, unknown>;

export type ForensicWorkbookData = {
  entitySummary: ForensicRow[];
  transactionSummary: ForensicRow[];
  categorizationIssues: ForensicRow[];
  windowRows: ForensicRow[];
  pre2023Rows: ForensicRow[];
  reconciliationVariances: ForensicRow[];
  inactiveEntities: ForensicRow[];
};

export class ForensicReportDomainError extends Error {
  constructor(
    public readonly code: "reconciliation_variance_data_unavailable",
    message: string
  ) {
    super(message);
    this.name = "ForensicReportDomainError";
  }
}

// SheetJS rejected the former >31-character names before upload/audit, making this
// report path unreachable. These stable semantic names satisfy Excel's hard limit.
export const FORENSIC_WORKSHEET_NAMES = [
  "Pre-Migration Summary",
  "Categorization Issues",
  "Embezzlement Review 2023-24",
  "Pre-2023 Anomalies",
  "Bank Reconciliation Variances",
  "Inactive Entity Candidates",
] as const;

function r2Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 credentials not configured");
  }
  const bucket = process.env.R2_BUCKET_EVIDENCE || process.env.R2_BUCKET || "ih35-tms-evidence";
  return {
    bucket,
    client: new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
}

async function loadBatch(batchId: string) {
  return withLuciaBypass(async (client) => {
    const res = await client.query<BatchContext>(
      `SELECT id, operating_company_id, qbo_realm_id FROM qbo_archive.import_batches WHERE id = $1 LIMIT 1`,
      [batchId]
    );
    return res.rows[0] ?? null;
  });
}

function companyCodeFromRealmId(realmId: string) {
  if ((process.env.QBO_REALM_ID_TRK ?? "").trim() === realmId) return "TRK";
  if ((process.env.QBO_REALM_ID_TRANSP ?? "").trim() === realmId) return "TRANSP";
  return "COMPANY";
}

export async function buildForensicWorkbookBuffer(input: {
  batchId: string;
  companyCode: string;
  data: ForensicWorkbookData;
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const { batchId, companyCode, data } = input;
  if (data.reconciliationVariances.length === 0) {
    throw new ForensicReportDomainError(
      "reconciliation_variance_data_unavailable",
      "Canonical reconciliation variance data is unavailable; forensic workbook generation stopped before upload"
    );
  }

  addObjectWorksheet(workbook, FORENSIC_WORKSHEET_NAMES[0], [
    { section: "Batch", key: "batch_id", value: batchId },
    { section: "Batch", key: "company", value: companyCode },
    ...data.entitySummary.map((row) => ({
      section: "Entities",
      key: `${row.qbo_entity_type} (${row.qbo_active_at_snapshot ? "active" : "inactive"})`,
      value: row.count,
    })),
    ...data.transactionSummary.map((row) => ({
      section: "Transactions",
      key: `${row.year} ${row.qbo_txn_type}`,
      value: `${row.count} rows / ${(Number(row.total_cents) / 100).toFixed(2)} USD`,
    })),
  ]);

  addObjectWorksheet(
    workbook,
    FORENSIC_WORKSHEET_NAMES[1],
    data.categorizationIssues.map((row) => ({
      Date: row.txn_date,
      Type: row.qbo_txn_type,
      Vendor: row.vendor_name ?? "",
      Amount_USD: Number(row.total_cents ?? 0) / 100,
      QBO_Class: row.class_name ?? "",
      Anomaly_Tags: Array.isArray(row.forensic_flags) ? row.forensic_flags.join(", ") : "",
      QBO_Link: `https://qbo.intuit.com/app/txn?txnId=${row.qbo_txn_id}`,
    }))
  );

  addObjectWorksheet(
    workbook,
    FORENSIC_WORKSHEET_NAMES[2],
    data.windowRows.map((row) => ({
      Date: row.txn_date,
      Type: row.qbo_txn_type,
      QBO_Created_At: row.qbo_created_at ?? "",
      QBO_Updated_At: row.qbo_updated_at ?? "",
      Vendor: row.vendor_name ?? "",
      Amount_USD: Number(row.total_cents ?? 0) / 100,
      Class: row.class_name ?? "",
      Has_Receipt: Number(row.attachments_count ?? 0) > 0 ? "Yes" : "No",
      Flags: Array.isArray(row.forensic_flags) ? row.forensic_flags.join(", ") : "",
      Review_Notes: "",
    }))
  );

  addObjectWorksheet(
    workbook,
    FORENSIC_WORKSHEET_NAMES[3],
    data.pre2023Rows.map((row) => ({
      Date: row.txn_date,
      Type: row.qbo_txn_type,
      Vendor: row.vendor_name ?? "",
      Amount_USD: Number(row.total_cents ?? 0) / 100,
      Has_Receipt: Number(row.attachments_count ?? 0) > 0 ? "Yes" : "No",
      Flags: Array.isArray(row.forensic_flags) ? row.forensic_flags.join(", ") : "",
    }))
  );

  addObjectWorksheet(
    workbook,
    FORENSIC_WORKSHEET_NAMES[4],
    data.reconciliationVariances.map((row) => ({
      Run_ID: row.run_id,
      Run_Type: row.run_type,
      Window_Start: row.window_start,
      Window_End: row.window_end,
      Exception_ID: row.exception_id,
      Exception_Class: row.exception_class,
      Field: row.field,
      TMS_Value: row.tms_value,
      QBO_Value: row.qbo_value,
      Severity: row.severity,
      Status: row.status,
      Source_Ref: row.source_ref,
      QBO_Ref: row.qbo_ref,
      Created_At: row.created_at,
      Resolved_At: row.resolved_at,
      Resolution_Note: row.resolution_note,
    }))
  );

  addObjectWorksheet(
    workbook,
    FORENSIC_WORKSHEET_NAMES[5],
    data.inactiveEntities.map((row) => ({
      Type: row.qbo_entity_type,
      Name: row.name ?? "",
      Last_Active_Date: row.last_active_date,
      Notes: "",
    }))
  );

  return writeWorkbookBuffer(workbook);
}

export async function generateExcelReport(actorUserId: string, batchId: string) {
  const batch = await loadBatch(batchId);
  if (!batch) throw new Error("batch_not_found");
  const companyCode = companyCodeFromRealmId(batch.qbo_realm_id);

  const data = await withCurrentUser(actorUserId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [batch.operating_company_id]);

    const entitySummary = await client.query(
      `
        SELECT qbo_entity_type, qbo_active_at_snapshot, COUNT(*)::int AS count
        FROM qbo_archive.entities_snapshot
        WHERE snapshot_batch_id = $1
        GROUP BY qbo_entity_type, qbo_active_at_snapshot
        ORDER BY qbo_entity_type, qbo_active_at_snapshot DESC
      `,
      [batchId]
    );

    const transactionSummary = await client.query(
      `
        SELECT qbo_txn_type, EXTRACT(YEAR FROM txn_date)::int AS year, COUNT(*)::int AS count, COALESCE(SUM(total_cents),0)::bigint AS total_cents
        FROM qbo_archive.transactions_snapshot
        WHERE snapshot_batch_id = $1
        GROUP BY qbo_txn_type, EXTRACT(YEAR FROM txn_date)
        ORDER BY year, qbo_txn_type
      `,
      [batchId]
    );

    const categorizationIssues = await client.query(
      `
        SELECT
          txn_date::text AS txn_date,
          qbo_txn_type,
          raw_snapshot->'VendorRef'->>'name' AS vendor_name,
          total_cents,
          raw_snapshot->'ClassRef'->>'name' AS class_name,
          forensic_flags,
          qbo_txn_id
        FROM qbo_archive.transactions_snapshot
        WHERE snapshot_batch_id = $1
          AND (embezzlement_window = true OR array_length(forensic_flags, 1) > 0)
        ORDER BY txn_date DESC
      `,
      [batchId]
    );

    const windowRows = await client.query(
      `
        SELECT
          txn_date::text AS txn_date,
          qbo_txn_type,
          raw_snapshot->'MetaData'->>'CreateTime' AS qbo_created_at,
          raw_snapshot->'MetaData'->>'LastUpdatedTime' AS qbo_updated_at,
          raw_snapshot->'VendorRef'->>'name' AS vendor_name,
          total_cents,
          raw_snapshot->'ClassRef'->>'name' AS class_name,
          attachments_count,
          forensic_flags
        FROM qbo_archive.transactions_snapshot
        WHERE snapshot_batch_id = $1
          AND embezzlement_window = true
        ORDER BY array_length(forensic_flags, 1) DESC NULLS LAST, txn_date DESC
      `,
      [batchId]
    );

    const reconciliationVariances = await client.query(
      `
        SELECT
          e.run_id::text,
          r.run_type,
          r.window_start::text,
          r.window_end::text,
          e.id::text AS exception_id,
          e.exception_class,
          e.field,
          e.tms_value,
          e.qbo_value,
          e.severity,
          e.status,
          e.source_ref,
          e.qbo_ref,
          e.created_at::text,
          e.resolved_at::text,
          e.resolution_note
        FROM accounting.recon_exceptions e
        JOIN accounting.recon_runs r
          ON r.id = e.run_id
         AND r.operating_company_id = e.operating_company_id
        WHERE e.operating_company_id = $1::uuid
          AND e.is_active = true
          AND e.voided_at IS NULL
          AND r.is_active = true
          AND r.voided_at IS NULL
          AND r.run_type IN (
            'am_bank_count',
            'pm_categorization_diff',
            'on_demand_bank_count',
            'on_demand_categorization_diff'
          )
        ORDER BY e.created_at DESC, e.id DESC
      `,
      [batch.operating_company_id]
    );

    const pre2023Rows = await client.query(
      `
        SELECT
          txn_date::text AS txn_date,
          qbo_txn_type,
          raw_snapshot->'VendorRef'->>'name' AS vendor_name,
          total_cents,
          attachments_count,
          forensic_flags
        FROM qbo_archive.transactions_snapshot
        WHERE snapshot_batch_id = $1
          AND txn_date < DATE '2023-01-01'
          AND array_length(forensic_flags, 1) > 0
        ORDER BY txn_date DESC
      `,
      [batchId]
    );

    const inactiveEntities = await client.query(
      `
        SELECT qbo_entity_type, raw_snapshot->>'Name' AS name, snapshot_taken_at::date AS last_active_date
        FROM qbo_archive.entities_snapshot
        WHERE snapshot_batch_id = $1
          AND qbo_active_at_snapshot = false
        ORDER BY qbo_entity_type, name
      `,
      [batchId]
    );

    return {
      entitySummary: entitySummary.rows,
      transactionSummary: transactionSummary.rows,
      categorizationIssues: categorizationIssues.rows,
      windowRows: windowRows.rows,
      pre2023Rows: pre2023Rows.rows,
      reconciliationVariances: reconciliationVariances.rows,
      inactiveEntities: inactiveEntities.rows,
    };
  });

  const reportBuffer = await buildForensicWorkbookBuffer({
    batchId: batch.id,
    companyCode,
    data,
  });
  const date = new Date().toISOString().slice(0, 10);
  const filename = `${companyCode}_FORENSIC_REPORT_${date}.xlsx`;
  const sha256 = createHash("sha256").update(reportBuffer).digest("hex");
  const generationId = randomUUID();
  const objectKey =
    `forensic-reports/${companyCode.toLowerCase()}/${batch.id}/${date}/` +
    `${generationId}/${sha256}/${filename}`;

  const { client: r2, bucket } = r2Client();
  const uploadResult = await r2.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: reportBuffer,
      ContentType: FORENSIC_XLSX_CONTENT_TYPE,
    })
  );

  await withCurrentUser(actorUserId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [batch.operating_company_id]);
    const auditPayload: Record<string, unknown> = {
      batch_id: batch.id,
      company_code: companyCode,
      r2_object_key: objectKey,
      sha256,
      byte_length: reportBuffer.byteLength,
      content_type: FORENSIC_XLSX_CONTENT_TYPE,
    };
    if (uploadResult.ETag) auditPayload.r2_etag = uploadResult.ETag;
    if (uploadResult.VersionId) auditPayload.r2_version_id = uploadResult.VersionId;
    await appendCrudAudit(
      client,
      actorUserId,
      "qbo_archive.report.generated",
      auditPayload,
      "info",
      "P5-T6-QBO-FORENSIC"
    );
  });

  return {
    r2_key: objectKey,
    filename,
    sha256,
    byte_length: reportBuffer.byteLength,
    content_type: FORENSIC_XLSX_CONTENT_TYPE,
  };
}

