import { randomUUID } from "node:crypto";
import { withLuciaBypass } from "../auth/db.js";

type Integration = "qbo" | "samsara";
type MirrorCategory = "refdata_static" | "transactional" | "identity_mapping";

type FindingSeverity = "critical" | "important" | "cleanup";
type FindingType =
  | "count_drift"
  | "value_drift"
  | "identity_mismatch"
  | "remote_unavailable"
  | "webhook_projection_gap"
  | "schema_contract_gap"
  | "sync_metadata_stale";

type FindingInput = {
  operatingCompanyId: string;
  integration: "qbo" | "samsara" | "plaid" | "fmcsa";
  mirrorCategory: string;
  findingType: FindingType;
  severity: FindingSeverity;
  runId: string | null;
  resourceScope: Record<string, unknown>;
  localValue: Record<string, unknown>;
  remoteValue?: Record<string, unknown> | null;
  driftAbs?: number | null;
  driftPct?: number | null;
  thresholdSnapshot: Record<string, unknown>;
};

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

const QBO_REFDATA_MIRRORS = [
  { table: "mdata.qbo_accounts", remoteEntityType: "qbo_accounts", threshold: 0 },
  { table: "mdata.qbo_classes", remoteEntityType: "qbo_classes", threshold: 0 },
  { table: "mdata.qbo_items", remoteEntityType: "qbo_items", threshold: 0 },
  { table: "mdata.qbo_customers", remoteEntityType: "qbo_customers", threshold: 1 },
  { table: "mdata.qbo_vendors", remoteEntityType: "qbo_vendors", threshold: 1 },
] as const;

const QBO_TRANSACTIONAL_MIRRORS = [
  { table: "accounting.invoices", remoteEntityType: "qbo_invoices" },
  { table: "accounting.bills", remoteEntityType: "qbo_bills" },
  { table: "accounting.payments", remoteEntityType: "qbo_payments" },
] as const;

export const DS5_REQUIRED_COLUMNS: Array<{
  tableSchema: string;
  tableName: string;
  requiredColumns: string[];
  staleColumn: string;
  staleHours: number;
}> = [
  {
    tableSchema: "mdata",
    tableName: "qbo_accounts",
    requiredColumns: ["qbo_id", "qbo_sync_token", "qbo_updated_at", "raw_payload", "last_seen_at", "created_at", "updated_at"],
    staleColumn: "last_seen_at",
    staleHours: 24,
  },
  {
    tableSchema: "mdata",
    tableName: "qbo_classes",
    requiredColumns: ["qbo_id", "qbo_sync_token", "qbo_updated_at", "raw_payload", "last_seen_at", "created_at", "updated_at"],
    staleColumn: "last_seen_at",
    staleHours: 24,
  },
  {
    tableSchema: "mdata",
    tableName: "qbo_items",
    requiredColumns: ["qbo_id", "qbo_sync_token", "qbo_updated_at", "raw_payload", "last_seen_at", "created_at", "updated_at"],
    staleColumn: "last_seen_at",
    staleHours: 24,
  },
  {
    tableSchema: "mdata",
    tableName: "qbo_customers",
    requiredColumns: ["qbo_id", "qbo_sync_token", "qbo_updated_at", "raw_payload", "last_seen_at", "created_at", "updated_at"],
    staleColumn: "last_seen_at",
    staleHours: 24,
  },
  {
    tableSchema: "mdata",
    tableName: "qbo_vendors",
    requiredColumns: ["qbo_id", "qbo_sync_token", "qbo_updated_at", "raw_payload", "last_seen_at", "created_at", "updated_at"],
    staleColumn: "last_seen_at",
    staleHours: 24,
  },
  {
    tableSchema: "integrations",
    tableName: "samsara_drivers",
    requiredColumns: ["samsara_driver_id", "raw_payload", "last_seen_at", "created_at", "updated_at"],
    staleColumn: "last_seen_at",
    staleHours: 24,
  },
  {
    tableSchema: "integrations",
    tableName: "samsara_vehicles",
    requiredColumns: ["samsara_vehicle_id", "raw_payload", "last_seen_at", "created_at", "updated_at"],
    staleColumn: "last_seen_at",
    staleHours: 24,
  },
];

export function calculateDriftPct(localCount: number, remoteCount: number): number {
  const denominator = Math.max(localCount, remoteCount, 1);
  return Math.abs(localCount - remoteCount) / denominator;
}

export function transactionalDriftSeverity(localCount: number, remoteCount: number): FindingSeverity | null {
  const abs = Math.abs(localCount - remoteCount);
  const pct = calculateDriftPct(localCount, remoteCount);
  if (abs <= 10 && pct <= 0.01) return null;
  if (abs > 20 && pct > 0.02) return "critical";
  return "important";
}

async function appendAuditEvent(
  client: DbClient,
  eventClass: string,
  severity: "info" | "warning" | "critical",
  payload: Record<string, unknown>
) {
  await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
    eventClass,
    severity,
    JSON.stringify(payload),
    "DS-REMEDIATE-4",
  ]);
}

async function persistFinding(client: DbClient, input: FindingInput) {
  const existing = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM _system.reconciliation_findings
      WHERE operating_company_id = $1::uuid
        AND integration = $2
        AND mirror_category = $3
        AND finding_type = $4
        AND status = 'open'
        AND resource_scope = $5::jsonb
      ORDER BY detected_at DESC
      LIMIT 1
    `,
    [input.operatingCompanyId, input.integration, input.mirrorCategory, input.findingType, JSON.stringify(input.resourceScope)]
  );

  if (existing.rows[0]?.id) {
    await client.query(
      `
        UPDATE _system.reconciliation_findings
        SET
          severity = $2,
          last_seen_at = now(),
          local_value = $3::jsonb,
          remote_value = $4::jsonb,
          drift_metric_abs = $5,
          drift_metric_pct = $6,
          threshold_snapshot = $7::jsonb,
          updated_at = now()
        WHERE id = $1::uuid
      `,
      [
        existing.rows[0].id,
        input.severity,
        JSON.stringify(input.localValue),
        JSON.stringify(input.remoteValue ?? null),
        input.driftAbs ?? null,
        input.driftPct ?? null,
        JSON.stringify(input.thresholdSnapshot),
      ]
    );
    return;
  }

  await client.query(
    `
      INSERT INTO _system.reconciliation_findings (
        operating_company_id,
        integration,
        mirror_category,
        finding_type,
        severity,
        status,
        detected_at,
        reconciliation_run_id,
        resource_scope,
        local_value,
        remote_value,
        drift_metric_abs,
        drift_metric_pct,
        threshold_snapshot,
        first_seen_at,
        last_seen_at
      )
      VALUES (
        $1::uuid,
        $2,
        $3,
        $4,
        $5,
        'open',
        now(),
        $6::uuid,
        $7::jsonb,
        $8::jsonb,
        $9::jsonb,
        $10,
        $11,
        $12::jsonb,
        now(),
        now()
      )
    `,
    [
      input.operatingCompanyId,
      input.integration,
      input.mirrorCategory,
      input.findingType,
      input.severity,
      input.runId,
      JSON.stringify(input.resourceScope),
      JSON.stringify(input.localValue),
      JSON.stringify(input.remoteValue ?? null),
      input.driftAbs ?? null,
      input.driftPct ?? null,
      JSON.stringify(input.thresholdSnapshot),
    ]
  );
}

async function getMaxTimestamp(
  client: DbClient,
  tableSchema: string,
  tableName: string,
  timestampColumn: string,
  operatingCompanyId: string
): Promise<Date | null> {
  const q = await client.query<{ max_value: string | null }>(
    `
      SELECT MAX(${timestampColumn})::text AS max_value
      FROM ${tableSchema}.${tableName}
      WHERE operating_company_id = $1::uuid
    `,
    [operatingCompanyId]
  );
  const raw = q.rows[0]?.max_value;
  return raw ? new Date(raw) : null;
}

async function checkDs5Contract(
  client: DbClient,
  operatingCompanyId: string,
  runId: string
) {
  for (const item of DS5_REQUIRED_COLUMNS) {
    const columnsRes = await client.query<{ column_name: string }>(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = $2
      `,
      [item.tableSchema, item.tableName]
    );
    const existing = new Set(columnsRes.rows.map((row) => row.column_name));

    for (const required of item.requiredColumns) {
      if (existing.has(required)) continue;
      await persistFinding(client, {
        operatingCompanyId,
        integration: item.tableSchema === "integrations" ? "samsara" : "qbo",
        mirrorCategory: item.tableSchema === "integrations" ? "telematics_numeric" : "refdata_static",
        findingType: "schema_contract_gap",
        severity: "important",
        runId,
        resourceScope: { table: `${item.tableSchema}.${item.tableName}`, missing_column: required },
        localValue: { missing_column: required },
        remoteValue: null,
        thresholdSnapshot: { required_columns: item.requiredColumns },
      });
    }

    if (!existing.has(item.staleColumn)) continue;
    const maxSeenAt = await getMaxTimestamp(client, item.tableSchema, item.tableName, item.staleColumn, operatingCompanyId);
    if (!maxSeenAt) continue;
    const staleMs = Date.now() - maxSeenAt.getTime();
    const thresholdMs = item.staleHours * 60 * 60 * 1000;
    if (staleMs <= thresholdMs) continue;

    await persistFinding(client, {
      operatingCompanyId,
      integration: item.tableSchema === "integrations" ? "samsara" : "qbo",
      mirrorCategory: item.tableSchema === "integrations" ? "telematics_numeric" : "refdata_static",
      findingType: "sync_metadata_stale",
      severity: "important",
      runId,
      resourceScope: { table: `${item.tableSchema}.${item.tableName}`, column: item.staleColumn },
      localValue: { last_seen_at: maxSeenAt.toISOString() },
      remoteValue: null,
      driftAbs: staleMs / (60 * 60 * 1000),
      thresholdSnapshot: { stale_hours: item.staleHours },
    });
  }
}

export async function runDs5ContractCheckForCompany(client: DbClient, operatingCompanyId: string, runId: string): Promise<void> {
  await checkDs5Contract(client, operatingCompanyId, runId);
}

async function reconcileQboRefdataForCompany(
  client: DbClient,
  operatingCompanyId: string,
  runId: string
) {
  for (const mirror of QBO_REFDATA_MIRRORS) {
    const localRes = await client.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM ${mirror.table} WHERE operating_company_id = $1::uuid`,
      [operatingCompanyId]
    );
    const localCount = Number(localRes.rows[0]?.cnt ?? 0);

    const remoteRes = await client.query<{ remote_count: number | null }>(
      `
        SELECT remote_count
        FROM accounting.qbo_remote_counts
        WHERE operating_company_id = $1::uuid
          AND entity_type = $2
        ORDER BY collected_at DESC
        LIMIT 1
      `,
      [operatingCompanyId, mirror.remoteEntityType]
    );
    const remoteCount = remoteRes.rows[0]?.remote_count ?? null;
    if (remoteCount == null) {
      await persistFinding(client, {
        operatingCompanyId,
        integration: "qbo",
        mirrorCategory: "refdata_static",
        findingType: "remote_unavailable",
        severity: "cleanup",
        runId,
        resourceScope: { table: mirror.table, entity_type: mirror.remoteEntityType },
        localValue: { local_count: localCount },
        remoteValue: null,
        thresholdSnapshot: { threshold_abs: mirror.threshold },
      });
      continue;
    }

    const abs = Math.abs(localCount - remoteCount);
    if (abs <= mirror.threshold) continue;
    await persistFinding(client, {
      operatingCompanyId,
      integration: "qbo",
      mirrorCategory: "refdata_static",
      findingType: "count_drift",
      severity: "important",
      runId,
      resourceScope: { table: mirror.table, entity_type: mirror.remoteEntityType },
      localValue: { local_count: localCount },
      remoteValue: { remote_count: remoteCount },
      driftAbs: abs,
      driftPct: calculateDriftPct(localCount, remoteCount),
      thresholdSnapshot: { threshold_abs: mirror.threshold },
    });
  }
}

async function reconcileQboTransactionalForCompany(
  client: DbClient,
  operatingCompanyId: string,
  runId: string
) {
  for (const mirror of QBO_TRANSACTIONAL_MIRRORS) {
    const localRes = await client.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM ${mirror.table} WHERE operating_company_id = $1::uuid`,
      [operatingCompanyId]
    );
    const localCount = Number(localRes.rows[0]?.cnt ?? 0);

    const remoteRes = await client.query<{ remote_count: number | null }>(
      `
        SELECT remote_count
        FROM accounting.qbo_remote_counts
        WHERE operating_company_id = $1::uuid
          AND entity_type = $2
        ORDER BY collected_at DESC
        LIMIT 1
      `,
      [operatingCompanyId, mirror.remoteEntityType]
    );
    const remoteCount = remoteRes.rows[0]?.remote_count ?? null;
    if (remoteCount == null) {
      await persistFinding(client, {
        operatingCompanyId,
        integration: "qbo",
        mirrorCategory: "transactional",
        findingType: "remote_unavailable",
        severity: "cleanup",
        runId,
        resourceScope: { table: mirror.table, entity_type: mirror.remoteEntityType },
        localValue: { local_count: localCount },
        remoteValue: null,
        thresholdSnapshot: { abs_threshold: 10, pct_threshold: 0.01 },
      });
      continue;
    }

    const severity = transactionalDriftSeverity(localCount, remoteCount);
    if (!severity) continue;
    await persistFinding(client, {
      operatingCompanyId,
      integration: "qbo",
      mirrorCategory: "transactional",
      findingType: "count_drift",
      severity,
      runId,
      resourceScope: { table: mirror.table, entity_type: mirror.remoteEntityType },
      localValue: { local_count: localCount },
      remoteValue: { remote_count: remoteCount },
      driftAbs: Math.abs(localCount - remoteCount),
      driftPct: calculateDriftPct(localCount, remoteCount),
      thresholdSnapshot: { abs_threshold: 10, pct_threshold: 0.01, critical_abs: 20, critical_pct: 0.02 },
    });
  }
}

async function reconcileSamsaraStaticForCompany(
  client: DbClient,
  operatingCompanyId: string,
  runId: string
) {
  for (const table of ["integrations.samsara_drivers", "integrations.samsara_vehicles"]) {
    const localRes = await client.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM ${table} WHERE operating_company_id = $1::uuid`,
      [operatingCompanyId]
    );
    const localCount = Number(localRes.rows[0]?.cnt ?? 0);
    await persistFinding(client, {
      operatingCompanyId,
      integration: "samsara",
      mirrorCategory: "telematics_numeric",
      findingType: "remote_unavailable",
      severity: "cleanup",
      runId,
      resourceScope: { table, reason: "samsara_count_helper_not_shipped" },
      localValue: { local_count: localCount },
      remoteValue: null,
      thresholdSnapshot: { policy: "emit_until_samsara_remote_counter_exists" },
    });
  }
}

async function reconcileCap15IdentityForCompany(
  client: DbClient,
  operatingCompanyId: string,
  runId: string
) {
  const mismatches = await client.query<{
    driver_id: string;
    samsara_driver_id: string | null;
    qbo_vendor_id: string | null;
    samsara_row_present: boolean;
    vendor_row_present: boolean;
  }>(
    `
      SELECT
        d.id::text AS driver_id,
        d.samsara_driver_id,
        d.qbo_vendor_id,
        (sd.id IS NOT NULL) AS samsara_row_present,
        (v.id IS NOT NULL) AS vendor_row_present
      FROM mdata.drivers d
      LEFT JOIN integrations.samsara_drivers sd
        ON sd.operating_company_id = d.operating_company_id
       AND sd.samsara_driver_id = d.samsara_driver_id
      LEFT JOIN mdata.vendors v
        ON v.operating_company_id = d.operating_company_id
       AND v.qbo_vendor_id = d.qbo_vendor_id
      WHERE d.operating_company_id = $1::uuid
        AND (
          (d.samsara_driver_id IS NOT NULL OR d.qbo_vendor_id IS NOT NULL)
          AND (
            d.samsara_driver_id IS NULL
            OR d.qbo_vendor_id IS NULL
            OR sd.id IS NULL
            OR v.id IS NULL
          )
        )
    `,
    [operatingCompanyId]
  );

  for (const row of mismatches.rows) {
    await persistFinding(client, {
      operatingCompanyId,
      integration: "samsara",
      mirrorCategory: "identity_mapping",
      findingType: "identity_mismatch",
      severity: "critical",
      runId,
      resourceScope: { driver_id: row.driver_id },
      localValue: {
        samsara_driver_id: row.samsara_driver_id,
        qbo_vendor_id: row.qbo_vendor_id,
      },
      remoteValue: {
        samsara_row_present: row.samsara_row_present,
        vendor_row_present: row.vendor_row_present,
      },
      thresholdSnapshot: { tolerance: 0, policy: "cap15_zero_tolerance" },
    });
  }
}

async function updateStateOnSuccess(
  client: DbClient,
  operatingCompanyId: string,
  integration: Integration,
  mirrorCategory: MirrorCategory
) {
  await client.query(
    `
      INSERT INTO _system.reconciliation_state (
        operating_company_id,
        integration,
        mirror_category,
        consecutive_failure_count,
        last_successful_tick_at,
        last_run_status,
        last_error_message,
        updated_at
      )
      VALUES ($1::uuid, $2, $3, 0, now(), 'ok', NULL, now())
      ON CONFLICT (operating_company_id, integration, mirror_category)
      DO UPDATE SET
        consecutive_failure_count = 0,
        last_successful_tick_at = now(),
        last_outage_recovered_at = CASE
          WHEN _system.reconciliation_state.last_run_status = 'failed' THEN now()
          ELSE _system.reconciliation_state.last_outage_recovered_at
        END,
        last_run_status = 'ok',
        last_error_message = NULL,
        updated_at = now()
    `,
    [operatingCompanyId, integration, mirrorCategory]
  );
}

async function updateStateOnFailure(
  client: DbClient,
  operatingCompanyId: string,
  integration: Integration,
  mirrorCategory: MirrorCategory,
  errorMessage: string
): Promise<number> {
  const existing = await client.query<{ consecutive_failure_count: number }>(
    `
      SELECT consecutive_failure_count
      FROM _system.reconciliation_state
      WHERE operating_company_id = $1::uuid
        AND integration = $2
        AND mirror_category = $3
    `,
    [operatingCompanyId, integration, mirrorCategory]
  );
  const next = Number(existing.rows[0]?.consecutive_failure_count ?? 0) + 1;
  await client.query(
    `
      INSERT INTO _system.reconciliation_state (
        operating_company_id,
        integration,
        mirror_category,
        consecutive_failure_count,
        last_outage_started_at,
        last_run_status,
        last_error_message,
        updated_at
      )
      VALUES ($1::uuid, $2, $3, $4, now(), 'failed', $5, now())
      ON CONFLICT (operating_company_id, integration, mirror_category)
      DO UPDATE SET
        consecutive_failure_count = $4,
        last_outage_started_at = COALESCE(_system.reconciliation_state.last_outage_started_at, now()),
        last_run_status = 'failed',
        last_error_message = $5,
        updated_at = now()
    `,
    [operatingCompanyId, integration, mirrorCategory, next, errorMessage.slice(0, 400)]
  );
  return next;
}

async function listCompaniesForCategory(
  client: DbClient,
  integration: Integration,
  mirrorCategory: MirrorCategory
): Promise<string[]> {
  if (integration === "qbo") {
    const rows = await client.query<{ operating_company_id: string }>(
      `
        SELECT DISTINCT operating_company_id::text AS operating_company_id
        FROM integrations.qbo_connections
        WHERE revoked_at IS NULL
      `
    );
    return rows.rows.map((r) => r.operating_company_id).filter(Boolean);
  }

  if (mirrorCategory === "identity_mapping") {
    const rows = await client.query<{ operating_company_id: string }>(
      `
        SELECT DISTINCT operating_company_id::text AS operating_company_id
        FROM mdata.drivers
        WHERE samsara_driver_id IS NOT NULL OR qbo_vendor_id IS NOT NULL
      `
    );
    return rows.rows.map((r) => r.operating_company_id).filter(Boolean);
  }

  const rows = await client.query<{ operating_company_id: string }>(
    `
      SELECT DISTINCT operating_company_id::text AS operating_company_id
      FROM integrations.samsara_config
      WHERE is_enabled = true
    `
  );
  return rows.rows.map((r) => r.operating_company_id).filter(Boolean);
}

async function runCategoryForCompany(
  client: DbClient,
  operatingCompanyId: string,
  integration: Integration,
  mirrorCategory: MirrorCategory,
  runId: string
) {
  if (integration === "qbo" && mirrorCategory === "refdata_static") {
    await reconcileQboRefdataForCompany(client, operatingCompanyId, runId);
  } else if (integration === "qbo" && mirrorCategory === "transactional") {
    await reconcileQboTransactionalForCompany(client, operatingCompanyId, runId);
  } else if (integration === "samsara" && mirrorCategory === "refdata_static") {
    await reconcileSamsaraStaticForCompany(client, operatingCompanyId, runId);
  } else if (integration === "samsara" && mirrorCategory === "identity_mapping") {
    await reconcileCap15IdentityForCompany(client, operatingCompanyId, runId);
  }

  await checkDs5Contract(client, operatingCompanyId, runId);
}

export async function runReconciliationCategoryTick(integration: Integration, mirrorCategory: MirrorCategory): Promise<void> {
  await withLuciaBypass(async (client) => {
    const companies = await listCompaniesForCategory(client, integration, mirrorCategory);
    for (const operatingCompanyId of companies) {
      if (!operatingCompanyId || !operatingCompanyId.trim()) {
        throw new Error(`missing operating_company_id for reconciliation category ${integration}.${mirrorCategory}`);
      }

      const runId = randomUUID();
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
      try {
        await appendAuditEvent(client, "reconciliation.tick.started", "info", {
          operating_company_id: operatingCompanyId,
          integration,
          mirror_category: mirrorCategory,
          reconciliation_run_id: runId,
        });

        await runCategoryForCompany(client, operatingCompanyId, integration, mirrorCategory, runId);
        await updateStateOnSuccess(client, operatingCompanyId, integration, mirrorCategory);

        await appendAuditEvent(client, "reconciliation.tick.succeeded", "info", {
          operating_company_id: operatingCompanyId,
          integration,
          mirror_category: mirrorCategory,
          reconciliation_run_id: runId,
        });
      } catch (error) {
        const message = String((error as Error)?.message ?? error);
        const streak = await updateStateOnFailure(client, operatingCompanyId, integration, mirrorCategory, message);
        await appendAuditEvent(client, "reconciliation.outage.started_or_continued", "warning", {
          operating_company_id: operatingCompanyId,
          integration,
          mirror_category: mirrorCategory,
          consecutive_failures: streak,
          error: message.slice(0, 400),
        });

        if (streak >= 3) {
          await appendAuditEvent(client, "reconciliation.outage.escalated", "critical", {
            operating_company_id: operatingCompanyId,
            integration,
            mirror_category: mirrorCategory,
            consecutive_failures: streak,
          });
        }
      }
    }
  });
}
