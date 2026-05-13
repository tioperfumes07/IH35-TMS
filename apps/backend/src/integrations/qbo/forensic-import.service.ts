import crypto from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser, withLuciaBypass } from "../../auth/db.js";
import {
  qboCompanyContext,
  qboDownloadAttachment,
  qboGetEntityById,
  qboPaginateEntity,
  type QboApiContext,
} from "./qbo-client.js";
import { getQboConnectionStatus } from "./qbo-oauth.service.js";
import { auditBatchEvent, auditForensicImportError } from "./forensic-audit.service.js";
import {
  appendForensicProgressError,
  clearForensicProgress,
  updateForensicProgress,
} from "./forensic-progress.store.js";
import { withHeartbeat } from "./forensic-batch-heartbeat.js";

type ImportCounts = {
  entitiesImported: number;
  transactionsImported: number;
  attachmentsImported: number;
  errorsCount: number;
};

type QboEntity = Record<string, unknown>;
type QboTransaction = Record<string, unknown>;

const ENTITY_TYPES = ["Account", "Customer", "Vendor", "Item", "Class"] as const;
const TXN_TYPES = [
  "Bill",
  "Invoice",
  "Payment",
  "JournalEntry",
  "Transfer",
  "Deposit",
  "Expense",
  "Check",
  "CreditCardCharge",
  "BillPayment",
  "VendorCredit",
  "CreditMemo",
  "RefundReceipt",
  "SalesReceipt",
] as const;

const BUSINESS_START_HOUR = 8;
const BUSINESS_END_HOUR = 18;

type BatchRow = {
  id: string;
  operating_company_id: string;
  qbo_realm_id: string;
  status: string;
};

type DbClientLike = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

function getTxDate(txn: QboTransaction) {
  const meta = txn.MetaData as Record<string, unknown> | undefined;
  const txDate = String((txn.TxnDate as string | undefined) ?? (meta?.CreateTime as string | undefined) ?? "").slice(0, 10);
  return txDate || "1970-01-01";
}

function getTxId(txn: QboTransaction) {
  return String(txn.Id ?? "");
}

function amountCents(txn: QboTransaction) {
  const raw = Number(txn.TotalAmt ?? txn.Amount ?? 0);
  return Number.isFinite(raw) ? Math.round(raw * 100) : null;
}

function getCreateTime(txn: QboTransaction) {
  const meta = txn.MetaData as Record<string, unknown> | undefined;
  const createTime = String((meta?.CreateTime as string | undefined) ?? "");
  return createTime || null;
}

function hourInChicago(isoTimestamp: string | null) {
  if (!isoTimestamp) return null;
  const dt = new Date(isoTimestamp);
  if (Number.isNaN(dt.getTime())) return null;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour12: false,
    hour: "2-digit",
  });
  return Number.parseInt(formatter.format(dt), 10);
}

function addFlag(flags: Set<string>, flag: string) {
  flags.add(flag);
}

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

async function appendSystemAudit(actorUserId: string, eventClass: string, payload: Record<string, unknown>, severity: "info" | "warning" = "info") {
  await withCurrentUser(actorUserId, async (client) => {
    await appendCrudAudit(client, actorUserId, eventClass, payload, severity, "P5-T6-QBO-FORENSIC");
  });
}

function logForensicHeap(batchId: string, entityType: string, pageStart: number, pageSize: number) {
  console.log("[FORENSIC_HEAP]", {
    batchId,
    entityType,
    pageStart,
    pageSize,
    heapUsedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
  });
}

async function loadBatch(batchId: string, operatingCompanyId?: string | null) {
  return withLuciaBypass(async (client) => {
    if (operatingCompanyId) {
      await client.query(`SELECT set_config('app.operating_company_id', $1, false)`, [operatingCompanyId]);
    }
    const res = await client.query<BatchRow>(
      `
        SELECT id, operating_company_id, qbo_realm_id, status
        FROM qbo_archive.import_batches
        WHERE id = $1::uuid
          AND ($2::uuid IS NULL OR operating_company_id = $2::uuid)
        LIMIT 1
      `,
      [batchId, operatingCompanyId ?? null]
    );
    return res.rows[0] ?? null;
  });
}

export async function startImportBatch(actorUserId: string, operatingCompanyId: string, sinceDate = "2015-01-01") {
  const auth = await getQboConnectionStatus(operatingCompanyId);
  if (!auth.connected || !auth.realm_id) {
    throw new Error("QBO not authorized for this company. Please authorize via /admin/forensic-review.");
  }
  const createdBatch = await withCurrentUser(actorUserId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, false)`, [operatingCompanyId]);
    const res = await client.query<{ id: string; operating_company_id: string; status: string; started_at: string }>(
      `
        INSERT INTO qbo_archive.import_batches (
          operating_company_id,
          qbo_realm_id,
          started_at,
          last_heartbeat_at,
          status,
          created_at,
          updated_at
        )
        VALUES ($1,$2,now(),now(),'in_progress',now(),now())
        RETURNING id, operating_company_id, status, started_at
      `,
      [operatingCompanyId, auth.realm_id]
    );

    console.info("[FORENSIC_BATCH_INSERT]", {
      step: "batch_create_db_insert",
      operatingCompanyId,
      rowCount: res.rowCount ?? 0,
      hasReturnedRow: res.rows.length > 0,
      batchId: res.rows[0]?.id ?? null,
    });

    if (!res.rows.length) {
      throw new Error(
        `BATCH_CREATE_FAILED: 0 rows returned for operating_company_id=${operatingCompanyId}. Check RLS app.operating_company_id context.`
      );
    }
    return res.rows[0];
  });

  const batchId = createdBatch.id;
  await appendSystemAudit(actorUserId, "qbo_archive.import_started", {
    batch_id: batchId,
    operating_company_id: operatingCompanyId,
    qbo_realm_id: auth.realm_id,
    since_date: sinceDate,
  });
  return { batchId };
}

export async function detectAnomalies(
  actorUserId: string,
  params: {
    batchId: string;
    operatingCompanyId: string;
    transactionSnapshotId: string;
    transactionType: string;
    transactionDate: string;
    totalCents: number | null;
    vendorName: string | null;
    createdAt: string | null;
    attachmentsCount: number;
  },
  dbClient?: DbClientLike
) {
  const flags = new Set<string>();
  const out: Array<{ anomaly_type: string; severity: "review" | "suspicious" | "critical" }> = [];

  const createdHour = hourInChicago(params.createdAt);
  if (createdHour !== null && (createdHour < BUSINESS_START_HOUR || createdHour > BUSINESS_END_HOUR)) {
    addFlag(flags, "after_hours_entry");
    out.push({ anomaly_type: "after_hours_entry", severity: "suspicious" });
  }

  if (params.transactionDate >= "2021-01-01" && params.attachmentsCount === 0) {
    addFlag(flags, "missing_receipt");
    out.push({ anomaly_type: "missing_receipt", severity: "review" });
  }

  if (params.totalCents !== null && Math.abs(params.totalCents) % 10_000 === 0) {
    addFlag(flags, "round_number_duplicate");
    out.push({ anomaly_type: "round_number_duplicate", severity: "review" });
  }

  if (params.vendorName) {
    const countDuplicateWindow = async (client: DbClientLike) => {
      const res = await client.query<{ count: number }>(
        `
          SELECT COUNT(*)::int AS count
          FROM qbo_archive.transactions_snapshot
          WHERE operating_company_id = $1
            AND snapshot_batch_id = $2
            AND raw_snapshot->>'VendorRef' IS NOT NULL
            AND raw_snapshot->'VendorRef'->>'name' = $3
            AND txn_date BETWEEN ($4::date - INTERVAL '7 day')::date AND ($4::date + INTERVAL '7 day')::date
            AND total_cents = $5
        `,
        [params.operatingCompanyId, params.batchId, params.vendorName, params.transactionDate, params.totalCents ?? 0]
      );
      return Number(res.rows[0]?.count ?? 0);
    };
    const windowCheck = dbClient
      ? await countDuplicateWindow(dbClient)
      : await withLuciaBypass(async (client) => countDuplicateWindow(client));
    if (windowCheck > 1) {
      addFlag(flags, "round_number_duplicate");
      out.push({ anomaly_type: "round_number_duplicate", severity: "suspicious" });
    }
  }

  if (params.totalCents !== null && Math.abs(params.totalCents) > 1_000_000_00) {
    addFlag(flags, "unusual_amount_for_vendor");
    out.push({ anomaly_type: "unusual_amount_for_vendor", severity: "critical" });
  }

  if (out.length > 0) {
    const insertAnomalies = async (client: DbClientLike) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [params.operatingCompanyId]);
      for (const anomaly of out) {
        await client.query(
          `
            INSERT INTO qbo_archive.forensic_anomalies (
              operating_company_id,
              txn_snapshot_id,
              anomaly_type,
              severity,
              review_status,
              snapshot_batch_id,
              created_at
            )
            VALUES ($1,$2,$3,$4,'pending',$5,now())
          `,
          [params.operatingCompanyId, params.transactionSnapshotId, anomaly.anomaly_type, anomaly.severity, params.batchId]
        );
      }
    };
    if (dbClient) {
      await insertAnomalies(dbClient);
    } else {
      await withCurrentUser(actorUserId, async (client) => insertAnomalies(client));
    }
  }

  return Array.from(flags);
}

export async function importEntities(actorUserId: string, batchId: string, qboContext: QboApiContext) {
  let imported = 0;
  let errors = 0;
  await auditBatchEvent(batchId, qboContext.operatingCompanyId, "entities_phase_started");
  updateForensicProgress(batchId, {
    current_phase: "entities",
    current_entity_type: null,
    current_page: null,
    current_total_pages: null,
  });
  await withCurrentUser(actorUserId, async (client) => {
    for (const entityType of ENTITY_TYPES) {
      let pageStart = 1;
      const startedAt = Date.now();
      let importedBefore = imported;
      await auditBatchEvent(batchId, qboContext.operatingCompanyId, "entity_type_started", { entity_type: entityType });
      updateForensicProgress(batchId, {
        current_phase: "entities",
        current_entity_type: entityType,
        current_page: Math.ceil(pageStart / 100),
      });
      try {
        await withHeartbeat(batchId, { phase: `entities:${entityType}` }, async () => {
          for await (const page of qboPaginateEntity<QboEntity>(qboContext, entityType)) {
          await auditBatchEvent(batchId, qboContext.operatingCompanyId, "page_fetched", {
            entity_type: entityType,
            page_number: Math.ceil(pageStart / 100),
            records_processed: page.length,
          });
          await client.query("BEGIN");
          try {
            await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [qboContext.operatingCompanyId]);
            for (const row of page) {
              const entityId = String(row.Id ?? "");
              if (!entityId) continue;
              const active = row.Active === undefined ? true : Boolean(row.Active);
              const insert = await client.query(
                `
                  INSERT INTO qbo_archive.entities_snapshot (
                    operating_company_id,
                    qbo_realm_id,
                    qbo_entity_type,
                    qbo_entity_id,
                    qbo_active_at_snapshot,
                    raw_snapshot,
                    snapshot_taken_at,
                    snapshot_batch_id,
                    created_at
                  )
                  VALUES ($1,$2,$3,$4,$5,$6::jsonb,now(),$7,now())
                  ON CONFLICT (qbo_realm_id, qbo_entity_type, qbo_entity_id, snapshot_batch_id) DO NOTHING
                `,
                [qboContext.operatingCompanyId, qboContext.realmId, entityType, entityId, active, JSON.stringify(row), batchId]
              );
              imported += insert.rowCount ?? 0;
            }
            await client.query(
              `
                UPDATE qbo_archive.import_batches
                SET entities_imported = $2,
                    errors_count = $3,
                    last_heartbeat_at = now(),
                    updated_at = now()
                WHERE id = $1
              `,
              [batchId, imported, errors]
            );
            await client.query("COMMIT");
          } catch (error) {
            await client.query("ROLLBACK");
            errors += 1;
            appendForensicProgressError(batchId, `Entity ${entityType} page failed: ${String((error as Error)?.message ?? error)}`);
            console.error("[FORENSIC_IMPORT]", {
              step: "entity_page_process_failed",
              batchId,
              operatingCompanyId: qboContext.operatingCompanyId,
              entityType,
              pageStart,
              pageSize: page.length,
              error: String((error as Error)?.message ?? error),
            });
            await auditForensicImportError(batchId, qboContext.operatingCompanyId, error, {
              phase: "entities",
              step: "entity_page_process_failed",
              entity_type: entityType,
            });
            await client.query(
              `
                UPDATE qbo_archive.import_batches
                SET errors_count = $2,
                    last_heartbeat_at = now(),
                    updated_at = now()
                WHERE id = $1
              `,
              [batchId, errors]
            );
          } finally {
            logForensicHeap(batchId, entityType, pageStart, page.length);
            pageStart += page.length;
            updateForensicProgress(batchId, {
              current_phase: "entities",
              current_entity_type: entityType,
              current_page: Math.ceil(pageStart / 100),
            });
          }
        }
        });
      } catch (error) {
        errors += 1;
        appendForensicProgressError(batchId, `Entity ${entityType} query failed: ${String((error as Error)?.message ?? error)}`);
        console.error("[FORENSIC_IMPORT]", {
          step: "entity_type_query_failed",
          batchId,
          operatingCompanyId: qboContext.operatingCompanyId,
          entityType,
          error: String((error as Error)?.message ?? error),
        });
        await auditForensicImportError(batchId, qboContext.operatingCompanyId, error, {
          phase: "entities",
          step: "entity_type_query_failed",
          entity_type: entityType,
        });
        await client.query(
          `
            UPDATE qbo_archive.import_batches
            SET errors_count = $2,
                last_heartbeat_at = now(),
                updated_at = now()
            WHERE id = $1
          `,
          [batchId, errors]
        );
      }
      await auditBatchEvent(batchId, qboContext.operatingCompanyId, "entity_type_completed", {
        entity_type: entityType,
        records_processed: imported - importedBefore,
        duration_ms: Date.now() - startedAt,
      });
      importedBefore = imported;
    }
    await client.query(
      `
        UPDATE qbo_archive.import_batches
        SET entities_imported = $2,
            errors_count = $3,
            last_heartbeat_at = now(),
            updated_at = now()
        WHERE id = $1
      `,
      [batchId, imported, errors]
    );
  });
  await auditBatchEvent(batchId, qboContext.operatingCompanyId, "entities_phase_completed", {
    records_processed: imported,
  });
  return { entitiesImported: imported, errors };
}

export async function importTransactions(actorUserId: string, batchId: string, qboContext: QboApiContext, sinceDate = "2015-01-01") {
  let imported = 0;
  let errors = 0;
  const insertedSnapshotIds: string[] = [];
  await auditBatchEvent(batchId, qboContext.operatingCompanyId, "transactions_phase_started");
  updateForensicProgress(batchId, {
    current_phase: "transactions",
    current_entity_type: null,
    current_page: null,
    current_total_pages: null,
  });
  await withCurrentUser(actorUserId, async (client) => {
    for (const txnType of TXN_TYPES) {
      const where = `TxnDate >= '${sinceDate}'`;
      let pageStart = 1;
      const startedAt = Date.now();
      const importedBefore = imported;
      await auditBatchEvent(batchId, qboContext.operatingCompanyId, "txn_type_started", { entity_type: txnType });
      updateForensicProgress(batchId, {
        current_phase: "transactions",
        current_entity_type: txnType,
        current_page: Math.ceil(pageStart / 100),
      });
      try {
        await withHeartbeat(batchId, { phase: `transactions:${txnType}` }, async () => {
          for await (const page of qboPaginateEntity<QboTransaction>(qboContext, txnType, where)) {
          await auditBatchEvent(batchId, qboContext.operatingCompanyId, "page_fetched", {
            entity_type: txnType,
            page_number: Math.ceil(pageStart / 100),
            records_processed: page.length,
          });
          await client.query("BEGIN");
          try {
            await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [qboContext.operatingCompanyId]);
            for (const row of page) {
              const txnId = getTxId(row);
              if (!txnId) continue;
              const txnDate = getTxDate(row);
              const totalCents = amountCents(row);
              const insertRes = await client.query<{ id: string }>(
                `
                  INSERT INTO qbo_archive.transactions_snapshot (
                    operating_company_id,
                    qbo_realm_id,
                    qbo_txn_type,
                    qbo_txn_id,
                    txn_date,
                    total_cents,
                    raw_snapshot,
                    snapshot_taken_at,
                    snapshot_batch_id,
                    created_at
                  )
                  VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,now(),$8,now())
                  ON CONFLICT (qbo_realm_id, qbo_txn_type, qbo_txn_id, snapshot_batch_id) DO NOTHING
                  RETURNING id
                `,
                [qboContext.operatingCompanyId, qboContext.realmId, txnType, txnId, txnDate, totalCents, JSON.stringify(row), batchId]
              );
              console.info("[FORENSIC_TXN_INSERT]", {
                step: "txn_insert",
                operatingCompanyId: qboContext.operatingCompanyId,
                batchId,
                txnType,
                txnId,
                rowCount: insertRes.rowCount ?? 0,
                hasReturnedRow: (insertRes.rows?.length ?? 0) > 0,
              });
              if ((insertRes.rowCount ?? 0) === 0) {
                // ON CONFLICT DO NOTHING: no-op is expected for duplicates on re-runs.
                continue;
              }
              const snapshotId = insertRes.rows[0]?.id;
              if (!snapshotId) {
                throw new Error(`txn_insert_missing_snapshot_id:${txnType}/${txnId}`);
              }
              insertedSnapshotIds.push(snapshotId);
              const vendorName = ((row.VendorRef as { name?: string } | undefined)?.name ?? null) || null;
              try {
                await detectAnomalies(
                  actorUserId,
                  {
                    batchId,
                    operatingCompanyId: qboContext.operatingCompanyId,
                    transactionSnapshotId: snapshotId,
                    transactionType: txnType,
                    transactionDate: txnDate,
                    totalCents,
                    vendorName,
                    createdAt: getCreateTime(row),
                    attachmentsCount: 0,
                  },
                  client
                );
              } catch (error) {
                errors += 1;
                console.error("[FORENSIC_IMPORT]", {
                  step: "transaction_anomaly_detection_failed",
                  batchId,
                  operatingCompanyId: qboContext.operatingCompanyId,
                  txnType,
                  txnId,
                  error: String((error as Error)?.message ?? error),
                });
                await auditForensicImportError(batchId, qboContext.operatingCompanyId, error, {
                  phase: "transactions",
                  step: "transaction_anomaly_detection_failed",
                  entity_type: txnType,
                  last_qbo_entity_id: txnId,
                });
              }
              imported += 1;
            }
            await client.query(
              `
                UPDATE qbo_archive.import_batches
                SET transactions_imported = $2,
                    errors_count = $3,
                    last_heartbeat_at = now(),
                    updated_at = now()
                WHERE id = $1
              `,
              [batchId, imported, errors]
            );
            await client.query("COMMIT");
          } catch (error) {
            await client.query("ROLLBACK");
            errors += 1;
            appendForensicProgressError(batchId, `Transaction ${txnType} page failed: ${String((error as Error)?.message ?? error)}`);
            console.error("[FORENSIC_IMPORT]", {
              step: "transaction_page_process_failed",
              batchId,
              operatingCompanyId: qboContext.operatingCompanyId,
              txnType,
              pageStart,
              pageSize: page.length,
              error: String((error as Error)?.message ?? error),
            });
            await auditForensicImportError(batchId, qboContext.operatingCompanyId, error, {
              phase: "transactions",
              step: "transaction_page_process_failed",
              entity_type: txnType,
            });
            await client.query(
              `
                UPDATE qbo_archive.import_batches
                SET errors_count = $2,
                    last_heartbeat_at = now(),
                    updated_at = now()
                WHERE id = $1
              `,
              [batchId, errors]
            );
          } finally {
            logForensicHeap(batchId, txnType, pageStart, page.length);
            pageStart += page.length;
            updateForensicProgress(batchId, {
              current_phase: "transactions",
              current_entity_type: txnType,
              current_page: Math.ceil(pageStart / 100),
            });
          }
        }
        });
      } catch (error) {
        errors += 1;
        appendForensicProgressError(batchId, `Transaction ${txnType} query failed: ${String((error as Error)?.message ?? error)}`);
        console.error("[FORENSIC_IMPORT]", {
          step: "transaction_type_query_failed",
          batchId,
          operatingCompanyId: qboContext.operatingCompanyId,
          txnType,
          error: String((error as Error)?.message ?? error),
        });
        await auditForensicImportError(batchId, qboContext.operatingCompanyId, error, {
          phase: "transactions",
          step: "transaction_type_query_failed",
          entity_type: txnType,
        });
        await client.query(
          `
            UPDATE qbo_archive.import_batches
            SET errors_count = $2,
                last_heartbeat_at = now(),
                updated_at = now()
            WHERE id = $1
          `,
          [batchId, errors]
        );
      }
      await auditBatchEvent(batchId, qboContext.operatingCompanyId, "txn_type_completed", {
        entity_type: txnType,
        records_processed: imported - importedBefore,
        duration_ms: Date.now() - startedAt,
      });
    }
    await client.query(
      `
        UPDATE qbo_archive.import_batches
        SET transactions_imported = $2,
            errors_count = $3,
            last_heartbeat_at = now(),
            updated_at = now()
        WHERE id = $1
      `,
      [batchId, imported, errors]
    );
  });
  await auditBatchEvent(batchId, qboContext.operatingCompanyId, "transactions_phase_completed", {
    records_processed: imported,
  });
  return { transactionsImported: imported, insertedSnapshotIds, errors };
}

export async function importAttachments(actorUserId: string, batchId: string, qboContext: QboApiContext, sinceDate = "2021-01-01") {
  const { client: r2, bucket } = r2Client();
  let imported = 0;
  let errors = 0;
  await auditBatchEvent(batchId, qboContext.operatingCompanyId, "attachments_phase_started");
  updateForensicProgress(batchId, {
    current_phase: "attachments",
    current_entity_type: "Attachable",
    current_page: null,
    current_total_pages: null,
  });
  await withCurrentUser(actorUserId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [qboContext.operatingCompanyId]);
    const txRows = await client.query<{
      id: string;
      qbo_txn_id: string;
      qbo_txn_type: string;
      txn_date: string;
      raw_snapshot: Record<string, unknown>;
    }>(
      `
        SELECT id, qbo_txn_id, qbo_txn_type, txn_date::text, raw_snapshot
        FROM qbo_archive.transactions_snapshot
        WHERE snapshot_batch_id = $1
          AND operating_company_id = $2
          AND txn_date >= $3
      `,
      [batchId, qboContext.operatingCompanyId, sinceDate]
    );

    await withHeartbeat(batchId, { phase: "attachments:transactions" }, async () => {
      for (const tx of txRows.rows) {
      const whereClause = `TxnDate >= '${sinceDate}' AND AttachableRef.EntityRef.value = '${tx.qbo_txn_id}'`;
      let pageStart = 1;
      try {
        for await (const page of qboPaginateEntity<Record<string, unknown>>(qboContext, "Attachable", whereClause)) {
          await auditBatchEvent(batchId, qboContext.operatingCompanyId, "page_fetched", {
            entity_type: "Attachable",
            page_number: Math.ceil(pageStart / 100),
            records_processed: page.length,
          });
          await client.query("BEGIN");
          try {
            await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [qboContext.operatingCompanyId]);
            for (const attachment of page) {
              const attachmentId = String(attachment.Id ?? "");
              const fileName = String(attachment.FileName ?? `${attachmentId}.bin`);
              const mimeType = String(attachment.ContentType ?? "application/octet-stream");
              const downloadUri = String(attachment.TempDownloadUri ?? attachment.DownloadUri ?? "");
              if (!attachmentId || !downloadUri) continue;

              try {
                const file = await qboDownloadAttachment(qboContext, downloadUri);
                const checksum = crypto.createHash("sha256").update(file.data).digest("hex");
                const objectKey = `qbo-archive/${qboContext.operatingCompanyId}/${batchId}/${tx.qbo_txn_id}/${fileName}`;
                await r2.send(
                  new PutObjectCommand({
                    Bucket: bucket,
                    Key: objectKey,
                    Body: file.data,
                    ContentType: file.contentType ?? mimeType,
                  })
                );

                const insertRes = await client.query(
                  `
                    INSERT INTO qbo_archive.attachments_snapshot (
                      operating_company_id,
                      txn_snapshot_id,
                      qbo_attachment_id,
                      original_filename,
                      mime_type,
                      size_bytes,
                      r2_object_key,
                      checksum_sha256,
                      uploaded_at_qbo,
                      snapshot_taken_at,
                      snapshot_batch_id,
                      created_at
                    )
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),$10,now())
                    ON CONFLICT DO NOTHING
                  `,
                  [
                    qboContext.operatingCompanyId,
                    tx.id,
                    attachmentId,
                    fileName,
                    mimeType,
                    file.data.byteLength,
                    objectKey,
                    checksum,
                    null,
                    batchId,
                  ]
                );
                console.info("[FORENSIC_ATTACH_INSERT]", {
                  step: "attachment_insert",
                  operatingCompanyId: qboContext.operatingCompanyId,
                  batchId,
                  txnId: tx.qbo_txn_id,
                  attachmentId,
                  rowCount: insertRes.rowCount ?? 0,
                });
                if ((insertRes.rowCount ?? 0) === 0) {
                  // ON CONFLICT DO NOTHING: no-op only on duplicate attachment row.
                  continue;
                }
                imported += 1;
                await auditBatchEvent(batchId, qboContext.operatingCompanyId, "attachment_downloaded", {
                  entity_type: "Attachable",
                  records_processed: 1,
                  metadata: { txn_id: tx.qbo_txn_id, attachment_id: attachmentId },
                });
              } catch (error) {
                errors += 1;
                appendForensicProgressError(batchId, `Attachment ${attachmentId} failed: ${String((error as Error)?.message ?? error)}`);
                console.error("[FORENSIC_IMPORT]", {
                  step: "attachment_import_failed",
                  batchId,
                  operatingCompanyId: qboContext.operatingCompanyId,
                  txnId: tx.qbo_txn_id,
                  attachmentId,
                  error: String((error as Error)?.message ?? error),
                });
                await auditForensicImportError(batchId, qboContext.operatingCompanyId, error, {
                  phase: "attachments",
                  step: "attachment_import_failed",
                  entity_type: "Attachable",
                  last_qbo_entity_id: attachmentId || tx.qbo_txn_id,
                });
              }
            }
            await client.query(
              `
                UPDATE qbo_archive.import_batches
                SET attachments_imported = $2,
                    errors_count = $3,
                    last_heartbeat_at = now(),
                    updated_at = now()
                WHERE id = $1
              `,
              [batchId, imported, errors]
            );
            await client.query("COMMIT");
          } catch (error) {
            await client.query("ROLLBACK");
            errors += 1;
            appendForensicProgressError(batchId, `Attachment page failed for txn ${tx.qbo_txn_id}: ${String((error as Error)?.message ?? error)}`);
            console.error("[FORENSIC_IMPORT]", {
              step: "attachment_page_process_failed",
              batchId,
              operatingCompanyId: qboContext.operatingCompanyId,
              txnId: tx.qbo_txn_id,
              pageStart,
              pageSize: page.length,
              error: String((error as Error)?.message ?? error),
            });
            await auditForensicImportError(batchId, qboContext.operatingCompanyId, error, {
              phase: "attachments",
              step: "attachment_page_process_failed",
              entity_type: "Attachable",
              last_qbo_entity_id: tx.qbo_txn_id,
            });
            await client.query(
              `
                UPDATE qbo_archive.import_batches
                SET errors_count = $2,
                    last_heartbeat_at = now(),
                    updated_at = now()
                WHERE id = $1
              `,
              [batchId, errors]
            );
          } finally {
            logForensicHeap(batchId, "Attachable", pageStart, page.length);
            pageStart += page.length;
            updateForensicProgress(batchId, {
              current_phase: "attachments",
              current_entity_type: "Attachable",
              current_page: Math.ceil(pageStart / 100),
            });
          }
        }
      } catch (error) {
        errors += 1;
        appendForensicProgressError(batchId, `Attachment query failed for txn ${tx.qbo_txn_id}: ${String((error as Error)?.message ?? error)}`);
        console.error("[FORENSIC_IMPORT]", {
          step: "attachment_query_failed",
          batchId,
          operatingCompanyId: qboContext.operatingCompanyId,
          txnId: tx.qbo_txn_id,
          error: String((error as Error)?.message ?? error),
        });
        await auditForensicImportError(batchId, qboContext.operatingCompanyId, error, {
          phase: "attachments",
          step: "attachment_query_failed",
          entity_type: "Attachable",
          last_qbo_entity_id: tx.qbo_txn_id,
        });
        await client.query(
          `
            UPDATE qbo_archive.import_batches
            SET errors_count = $2,
                last_heartbeat_at = now(),
                updated_at = now()
            WHERE id = $1
          `,
          [batchId, errors]
        );
      }

      // transactions_snapshot is append-only by design; keep attachment counts in attachments_snapshot.
    }
    });

    await client.query(
      `
        UPDATE qbo_archive.import_batches
        SET attachments_imported = $2,
            errors_count = $3,
            last_heartbeat_at = now(),
            updated_at = now()
        WHERE id = $1
      `,
      [batchId, imported, errors]
    );
  });
  await auditBatchEvent(batchId, qboContext.operatingCompanyId, "attachments_phase_completed", {
    records_processed: imported,
  });
  return { attachmentsImported: imported, errors };
}

export async function completeImportBatch(actorUserId: string, batchId: string, extraCounts: Partial<ImportCounts> = {}) {
  const batch = await loadBatch(batchId);
  if (!batch) throw new Error("batch_not_found");
  const status = (extraCounts.errorsCount ?? 0) > 0 ? "partial" : "completed";

  await withCurrentUser(actorUserId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [batch.operating_company_id]);
    await client.query(
      `
        UPDATE qbo_archive.import_batches
        SET
          completed_at = now(),
          last_heartbeat_at = now(),
          status = $2,
          entities_imported = COALESCE($3, entities_imported),
          transactions_imported = COALESCE($4, transactions_imported),
          attachments_imported = COALESCE($5, attachments_imported),
          errors_count = COALESCE($6, errors_count),
          last_heartbeat_at = now(),
          updated_at = now()
        WHERE id = $1
      `,
      [
        batchId,
        status,
        extraCounts.entitiesImported ?? null,
        extraCounts.transactionsImported ?? null,
        extraCounts.attachmentsImported ?? null,
        extraCounts.errorsCount ?? null,
      ]
    );
  });

  await appendSystemAudit(actorUserId, "qbo_archive.import_completed", {
    batch_id: batchId,
    status,
    ...extraCounts,
  });
  return { status };
}

export async function runForensicImport(
  actorUserId: string,
  params: { batchId: string; operatingCompanyId?: string; sinceDate?: string; attachmentsSinceDate?: string }
) {
  const batch = await loadBatch(params.batchId, params.operatingCompanyId ?? null);
  if (!batch) throw new Error("batch_not_found");
  const sinceDate = params.sinceDate ?? "2015-01-01";
  const attachmentsSinceDate = params.attachmentsSinceDate ?? "2021-01-01";

  let errorsCount = 0;
  let entityCount = 0;
  let transactionCount = 0;
  let attachmentCount = 0;
  let finalStatus: "in_progress" | "completed" | "partial" | "failed" = "in_progress";
  let lastErrorMessage: string | null = null;

  const auth = await getQboConnectionStatus(batch.operating_company_id);
  if (!auth.connected || !auth.realm_id) {
    await auditBatchEvent(batch.id, batch.operating_company_id, "preflight_qbo_check_failed", {
      error_message: "QBO not authorized for this company",
    });
    throw new Error("QBO not authorized for this company. Please authorize via /admin/forensic-review.");
  }
  await auditBatchEvent(batch.id, batch.operating_company_id, "preflight_qbo_check_passed");

  const qboContext = await qboCompanyContext(batch.operating_company_id);
  qboContext.onRetry = async ({ status, attempt, delay_ms, url }) => {
    await auditBatchEvent(batch.id, batch.operating_company_id, "qbo_retry", {
      status,
      attempt,
      delay_ms,
      url,
    });
  };

  try {
    await auditBatchEvent(batch.id, batch.operating_company_id, "batch_started");
    const entities = await importEntities(actorUserId, batch.id, qboContext);
    entityCount = entities.entitiesImported;
    errorsCount += entities.errors;
    if (entities.errors > 0) {
      await appendSystemAudit(
        actorUserId,
        "qbo_archive.import_failed",
        { batch_id: batch.id, step: "entities", errors: entities.errors },
        "warning"
      );
    }
    const tx = await importTransactions(actorUserId, batch.id, qboContext, sinceDate);
    transactionCount = tx.transactionsImported;
    errorsCount += tx.errors;
    if (tx.errors > 0) {
      await appendSystemAudit(
        actorUserId,
        "qbo_archive.import_failed",
        { batch_id: batch.id, step: "transactions", errors: tx.errors },
        "warning"
      );
    }
    const attachments = await importAttachments(actorUserId, batch.id, qboContext, attachmentsSinceDate);
    attachmentCount = attachments.attachmentsImported;
    errorsCount += attachments.errors;
    if (attachments.errors > 0) {
      await appendSystemAudit(
        actorUserId,
        "qbo_archive.import_failed",
        { batch_id: batch.id, step: "attachments", errors: attachments.errors },
        "warning"
      );
    }
  } catch (error) {
    errorsCount += 1;
    lastErrorMessage = String((error as Error)?.message ?? error);
    appendForensicProgressError(batch.id, lastErrorMessage);
    await auditForensicImportError(batch.id, batch.operating_company_id, error, {
      phase: "runner",
      step: "runForensicImport_fatal",
    });
    await appendSystemAudit(
      actorUserId,
      "qbo_archive.import_failed",
      { batch_id: batch.id, error: lastErrorMessage },
      "warning"
    );
    await auditBatchEvent(batch.id, batch.operating_company_id, "error_encountered", {
      error_message: lastErrorMessage,
    });
    finalStatus = errorsCount > 0 ? "partial" : "failed";
  } finally {
    if (finalStatus === "in_progress") {
      finalStatus = errorsCount > 0 ? "partial" : "completed";
    }

    await withCurrentUser(actorUserId, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [batch.operating_company_id]);
      await client.query(
        `
          UPDATE qbo_archive.import_batches
          SET status = $1,
              completed_at = now(),
              entities_imported = $2,
              transactions_imported = $3,
              attachments_imported = $4,
              errors_count = $5,
              last_error_message = COALESCE($6, last_error_message),
              last_heartbeat_at = now(),
              updated_at = now()
          WHERE id = $7
            AND status = 'in_progress'
        `,
        [finalStatus, entityCount, transactionCount, attachmentCount, errorsCount, lastErrorMessage, batch.id]
      );
    });
    await auditBatchEvent(
      batch.id,
      batch.operating_company_id,
      finalStatus === "completed" || finalStatus === "partial" ? "batch_completed" : "batch_failed",
      {
        records_processed: entityCount + transactionCount + attachmentCount,
        error_message: lastErrorMessage,
        final_status: finalStatus,
      }
    );
    clearForensicProgress(batch.id);
  }
  return { status: finalStatus };
}

const forensicImportInFlight = new Map<string, Promise<{ status: string }>>();

/**
 * One import per batchId per Node process (avoids API start + cron stacking).
 * Concurrent callers await the same promise.
 */
export function runForensicImportDeduped(
  actorUserId: string,
  params: { batchId: string; operatingCompanyId?: string; sinceDate?: string; attachmentsSinceDate?: string }
): Promise<{ status: string }> {
  let pending = forensicImportInFlight.get(params.batchId);
  if (!pending) {
    pending = runForensicImport(actorUserId, params).finally(() => {
      forensicImportInFlight.delete(params.batchId);
    });
    forensicImportInFlight.set(params.batchId, pending);
  }
  return pending;
}
