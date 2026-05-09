import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import XLSX from "xlsx";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser, withLuciaBypass } from "../../auth/db.js";

type BatchContext = {
  id: string;
  operating_company_id: string;
  qbo_realm_id: string;
};

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

export async function generateExcelReport(actorUserId: string, batchId: string) {
  const batch = await loadBatch(batchId);
  if (!batch) throw new Error("batch_not_found");
  const companyCode = companyCodeFromRealmId(batch.qbo_realm_id);
  const workbook = XLSX.utils.book_new();

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
          raw_snapshot->>'MetaData' AS entered_by,
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
      inactiveEntities: inactiveEntities.rows,
    };
  });

  const sheet1 = XLSX.utils.json_to_sheet([
    { section: "Batch", key: "batch_id", value: batch.id },
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
  XLSX.utils.book_append_sheet(workbook, sheet1, "Pre-Migration Snapshot Summary");

  const sheet2 = XLSX.utils.json_to_sheet(
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
  XLSX.utils.book_append_sheet(workbook, sheet2, "Categorization Issues");

  const sheet3 = XLSX.utils.json_to_sheet(
    data.windowRows.map((row) => ({
      Date: row.txn_date,
      Type: row.qbo_txn_type,
      Entered_By: row.entered_by ?? "",
      Vendor: row.vendor_name ?? "",
      Amount_USD: Number(row.total_cents ?? 0) / 100,
      Class: row.class_name ?? "",
      Has_Receipt: Number(row.attachments_count ?? 0) > 0 ? "Yes" : "No",
      Flags: Array.isArray(row.forensic_flags) ? row.forensic_flags.join(", ") : "",
      Review_Notes: "",
    }))
  );
  XLSX.utils.book_append_sheet(workbook, sheet3, "Embezzlement Window Review (2023-2024)");

  const sheet4 = XLSX.utils.json_to_sheet(
    data.pre2023Rows.map((row) => ({
      Date: row.txn_date,
      Type: row.qbo_txn_type,
      Vendor: row.vendor_name ?? "",
      Amount_USD: Number(row.total_cents ?? 0) / 100,
      Has_Receipt: Number(row.attachments_count ?? 0) > 0 ? "Yes" : "No",
      Flags: Array.isArray(row.forensic_flags) ? row.forensic_flags.join(", ") : "",
    }))
  );
  XLSX.utils.book_append_sheet(workbook, sheet4, "Pre-2023 Anomalies");

  const sheet5 = XLSX.utils.json_to_sheet([
    { Note: "Variance sheet placeholder. Year-end comparisons populate as balances are archived." },
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet5, "Bank Account Reconciliation Variances");

  const sheet6 = XLSX.utils.json_to_sheet(
    data.inactiveEntities.map((row) => ({
      Type: row.qbo_entity_type,
      Name: row.name ?? "",
      Last_Active_Date: row.last_active_date,
      Notes: "",
    }))
  );
  XLSX.utils.book_append_sheet(workbook, sheet6, "Inactive Entities Reactivation Candidates");

  const reportBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const date = new Date().toISOString().slice(0, 10);
  const filename = `${companyCode}_FORENSIC_REPORT_${date}.xlsx`;
  const objectKey = `forensic-reports/${companyCode.toLowerCase()}/${batch.id}/${filename}`;

  const { client: r2, bucket } = r2Client();
  await r2.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: reportBuffer,
      ContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
  );

  await withCurrentUser(actorUserId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [batch.operating_company_id]);
    await appendCrudAudit(
      client,
      actorUserId,
      "qbo_archive.report.generated",
      {
        batch_id: batch.id,
        company_code: companyCode,
        r2_object_key: objectKey,
      },
      "info",
      "P5-T6-QBO-FORENSIC"
    );
  });

  return { r2_key: objectKey, filename };
}

