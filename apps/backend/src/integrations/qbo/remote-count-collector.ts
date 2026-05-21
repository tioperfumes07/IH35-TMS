import { withLuciaBypass } from "../../auth/db.js";
import { qboCompanyContext, qboQuery } from "./qbo-client.js";

export type QboRemoteCountEntityType =
  | "qbo_accounts"
  | "qbo_classes"
  | "qbo_items"
  | "qbo_customers"
  | "qbo_vendors";

type CountEntitySpec = {
  entityType: QboRemoteCountEntityType;
  qboEntityName: "Account" | "Class" | "Item" | "Customer" | "Vendor";
};

type CollectorMode = "delta" | "full";

type CollectionStateRow = {
  consecutive_failures: number;
  outage_started_at: string | null;
};

type CollectorOptions = {
  entityTypes?: QboRemoteCountEntityType[];
  runMode?: CollectorMode;
  collectionRunId?: string | null;
};

export type CollectQboRemoteCountsResult = {
  operating_company_id: string;
  run_mode: CollectorMode;
  collected_count: number;
  failed: boolean;
  failure_streak: number;
  outage_started: boolean;
  outage_recovered: boolean;
};

const COUNT_ENTITY_SPECS: CountEntitySpec[] = [
  { entityType: "qbo_accounts", qboEntityName: "Account" },
  { entityType: "qbo_classes", qboEntityName: "Class" },
  { entityType: "qbo_items", qboEntityName: "Item" },
  { entityType: "qbo_customers", qboEntityName: "Customer" },
  { entityType: "qbo_vendors", qboEntityName: "Vendor" },
];

function assertOperatingCompanyId(operatingCompanyId: string) {
  if (!operatingCompanyId || !operatingCompanyId.trim()) {
    throw new Error("qbo remote-count collector requires operating_company_id");
  }
}

function normalizeCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.floor(value);
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  throw new Error(`invalid qbo count value: ${String(value)}`);
}

function pickSpecs(entityTypes?: QboRemoteCountEntityType[]): CountEntitySpec[] {
  if (!entityTypes || entityTypes.length === 0) return COUNT_ENTITY_SPECS;
  const wanted = new Set(entityTypes);
  return COUNT_ENTITY_SPECS.filter((spec) => wanted.has(spec.entityType));
}

async function appendAuditEvent(
  client: { query: (sql: string, values?: unknown[]) => Promise<unknown> },
  eventClass: string,
  severity: "info" | "warning" | "critical",
  payload: Record<string, unknown>
) {
  await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
    eventClass,
    severity,
    JSON.stringify(payload),
    "DS-REMEDIATE-2",
  ]);
}

async function readCollectionState(
  client: { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> },
  operatingCompanyId: string
): Promise<CollectionStateRow> {
  const res = await client.query<CollectionStateRow>(
    `
      SELECT consecutive_failures, outage_started_at::text
      FROM accounting.qbo_remote_count_collection_state
      WHERE operating_company_id = $1::uuid
    `,
    [operatingCompanyId]
  );
  return {
    consecutive_failures: Number(res.rows[0]?.consecutive_failures ?? 0),
    outage_started_at: res.rows[0]?.outage_started_at ?? null,
  };
}

async function markCollectionSuccess(
  client: { query: (sql: string, values?: unknown[]) => Promise<unknown> },
  operatingCompanyId: string
) {
  await client.query(
    `
      INSERT INTO accounting.qbo_remote_count_collection_state (
        operating_company_id,
        consecutive_failures,
        outage_started_at,
        last_failure_at,
        last_success_at,
        last_error_message,
        updated_at
      )
      VALUES ($1::uuid, 0, NULL, NULL, now(), NULL, now())
      ON CONFLICT (operating_company_id)
      DO UPDATE SET
        consecutive_failures = 0,
        outage_started_at = NULL,
        last_success_at = now(),
        last_error_message = NULL,
        updated_at = now()
    `,
    [operatingCompanyId]
  );
}

async function markCollectionFailure(
  client: { query: (sql: string, values?: unknown[]) => Promise<unknown> },
  operatingCompanyId: string,
  nextFailures: number,
  shouldStartOutage: boolean,
  errorMessage: string
) {
  await client.query(
    `
      INSERT INTO accounting.qbo_remote_count_collection_state (
        operating_company_id,
        consecutive_failures,
        outage_started_at,
        last_failure_at,
        last_success_at,
        last_error_message,
        updated_at
      )
      VALUES (
        $1::uuid,
        $2::int,
        CASE WHEN $3::boolean THEN now() ELSE NULL END,
        now(),
        NULL,
        $4::text,
        now()
      )
      ON CONFLICT (operating_company_id)
      DO UPDATE SET
        consecutive_failures = $2::int,
        outage_started_at = CASE
          WHEN $3::boolean THEN COALESCE(accounting.qbo_remote_count_collection_state.outage_started_at, now())
          ELSE accounting.qbo_remote_count_collection_state.outage_started_at
        END,
        last_failure_at = now(),
        last_error_message = $4::text,
        updated_at = now()
    `,
    [operatingCompanyId, nextFailures, shouldStartOutage, errorMessage.slice(0, 400)]
  );
}

async function queryRemoteCount(operatingCompanyId: string, qboEntityName: CountEntitySpec["qboEntityName"]): Promise<number> {
  const context = await qboCompanyContext(operatingCompanyId);
  const payload = await qboQuery<Record<string, unknown>>(context, `SELECT COUNT(*) FROM ${qboEntityName}`);
  return normalizeCount(payload.QueryResponse?.totalCount);
}

export async function collectQboRemoteCounts(
  operatingCompanyId: string,
  options?: CollectorOptions
): Promise<CollectQboRemoteCountsResult> {
  assertOperatingCompanyId(operatingCompanyId);
  const runMode = options?.runMode ?? "delta";
  const selectedSpecs = pickSpecs(options?.entityTypes);

  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const connectionRes = await client.query<{ id: string }>(
      `
        SELECT id::text
        FROM integrations.qbo_connections
        WHERE operating_company_id = $1::uuid
          AND revoked_at IS NULL
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      [operatingCompanyId]
    );

    if (!connectionRes.rows[0]?.id) {
      await appendAuditEvent(client, "qbo.remote_count_run_skipped", "warning", {
        operating_company_id: operatingCompanyId,
        run_mode: runMode,
        reason: "no_active_qbo_connection",
      });
      return {
        operating_company_id: operatingCompanyId,
        run_mode: runMode,
        collected_count: 0,
        failed: false,
        failure_streak: 0,
        outage_started: false,
        outage_recovered: false,
      };
    }

    await appendAuditEvent(client, "qbo.remote_count_run_started", "info", {
      operating_company_id: operatingCompanyId,
      run_mode: runMode,
      entity_types: selectedSpecs.map((spec) => spec.entityType),
      collection_run_id: options?.collectionRunId ?? null,
    });

    const previousState = await readCollectionState(client, operatingCompanyId);
    let collectedCount = 0;

    try {
      for (const spec of selectedSpecs) {
        const remoteCount = await queryRemoteCount(operatingCompanyId, spec.qboEntityName);
        await client.query(
          `
            INSERT INTO accounting.qbo_remote_counts (
              operating_company_id,
              entity_type,
              remote_count,
              collected_at,
              collection_run_id
            )
            VALUES (
              $1::uuid,
              $2::text,
              $3::int,
              now(),
              $4::uuid
            )
          `,
          [operatingCompanyId, spec.entityType, remoteCount, options?.collectionRunId ?? null]
        );
        collectedCount += 1;
      }

      await markCollectionSuccess(client, operatingCompanyId);

      if (previousState.consecutive_failures > 0) {
        await appendAuditEvent(client, "qbo.outage_recovered", "info", {
          operating_company_id: operatingCompanyId,
          prior_failure_streak: previousState.consecutive_failures,
          outage_started_at: previousState.outage_started_at,
          run_mode: runMode,
          catch_up_completed: true,
        });
      }

      await appendAuditEvent(client, "qbo.remote_count_run_succeeded", "info", {
        operating_company_id: operatingCompanyId,
        run_mode: runMode,
        collected_count: collectedCount,
      });

      return {
        operating_company_id: operatingCompanyId,
        run_mode: runMode,
        collected_count: collectedCount,
        failed: false,
        failure_streak: 0,
        outage_started: false,
        outage_recovered: previousState.consecutive_failures > 0,
      };
    } catch (error) {
      const nextFailureStreak = previousState.consecutive_failures + 1;
      const startsOutage = previousState.consecutive_failures === 0;
      const message = String((error as Error)?.message ?? error);
      await markCollectionFailure(client, operatingCompanyId, nextFailureStreak, startsOutage, message);

      await appendAuditEvent(client, startsOutage ? "qbo.outage_started" : "qbo.remote_count_entity_failed", startsOutage ? "warning" : "critical", {
        operating_company_id: operatingCompanyId,
        run_mode: runMode,
        failure_streak: nextFailureStreak,
        error: message.slice(0, 400),
      });

      if (nextFailureStreak >= 3) {
        await appendAuditEvent(client, "qbo.outage_escalated", "critical", {
          operating_company_id: operatingCompanyId,
          run_mode: runMode,
          failure_streak: nextFailureStreak,
        });
      }

      return {
        operating_company_id: operatingCompanyId,
        run_mode: runMode,
        collected_count: collectedCount,
        failed: true,
        failure_streak: nextFailureStreak,
        outage_started: startsOutage,
        outage_recovered: false,
      };
    }
  });
}

export async function listQboConnectedOperatingCompanies(): Promise<string[]> {
  return withLuciaBypass(async (client) => {
    const res = await client.query<{ operating_company_id: string }>(
      `
        SELECT DISTINCT operating_company_id::text AS operating_company_id
        FROM integrations.qbo_connections
        WHERE revoked_at IS NULL
      `
    );
    return res.rows.map((row) => row.operating_company_id).filter(Boolean);
  });
}

export function qboRemoteCountEntityTypes(): QboRemoteCountEntityType[] {
  return COUNT_ENTITY_SPECS.map((spec) => spec.entityType);
}
