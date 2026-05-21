import { randomUUID } from "node:crypto";
import { withLuciaBypass } from "../../auth/db.js";
import { decryptSamsaraSecret } from "../../lib/samsara-crypto.js";
import { SamsaraApiError, SamsaraClient, type SamsaraRemoteEntityType } from "./samsara-client.js";
import { getSamsaraConfigForCompany } from "./samsara.service.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

type FailureClass = "auth_failed" | "rate_limited" | "transient_error" | "not_configured";

type CollectorResult = {
  operating_company_id: string;
  collection_run_id: string;
  collected_count: number;
  failed_entities: SamsaraRemoteEntityType[];
  auth_failed: boolean;
};

const AUDIT_SOURCE = "DS-REMEDIATE-9";
const ENTITY_TYPES: SamsaraRemoteEntityType[] = ["drivers", "vehicles"];

function assertOperatingCompanyId(operatingCompanyId: string): void {
  if (!operatingCompanyId || !operatingCompanyId.trim()) {
    throw new Error("samsara remote-count collector requires operating_company_id");
  }
}

function classifyCollectorError(error: unknown): { failureClass: FailureClass; statusCode: number | null; message: string } {
  if (error instanceof SamsaraApiError) {
    if (error.statusCode === 401 || error.statusCode === 403) {
      return {
        failureClass: "auth_failed",
        statusCode: error.statusCode,
        message: `${error.message}:${JSON.stringify(error.body ?? {}).slice(0, 500)}`,
      };
    }
    if (error.statusCode === 429) {
      return {
        failureClass: "rate_limited",
        statusCode: error.statusCode,
        message: `${error.message}:${JSON.stringify(error.body ?? {}).slice(0, 500)}`,
      };
    }
    return {
      failureClass: "transient_error",
      statusCode: error.statusCode,
      message: `${error.message}:${JSON.stringify(error.body ?? {}).slice(0, 500)}`,
    };
  }

  const message = String((error as Error)?.message ?? error);
  if (message.includes("not_configured")) {
    return { failureClass: "not_configured", statusCode: null, message };
  }
  return { failureClass: "transient_error", statusCode: null, message };
}

async function appendAuditEvent(
  client: DbClient,
  eventClass: string,
  severity: "info" | "warning" | "critical",
  payload: Record<string, unknown>
): Promise<void> {
  await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
    eventClass,
    severity,
    JSON.stringify(payload),
    AUDIT_SOURCE,
  ]);
}

async function readCollectionState(client: DbClient, operatingCompanyId: string): Promise<{ consecutive_failures: number }> {
  const res = await client.query<{ consecutive_failures: number }>(
    `
      SELECT consecutive_failures
      FROM integrations.samsara_remote_count_collection_state
      WHERE operating_company_id = $1::uuid
    `,
    [operatingCompanyId]
  );
  return {
    consecutive_failures: Number(res.rows[0]?.consecutive_failures ?? 0),
  };
}

async function markCollectionSuccess(client: DbClient, operatingCompanyId: string): Promise<void> {
  await client.query(
    `
      INSERT INTO integrations.samsara_remote_count_collection_state (
        operating_company_id,
        consecutive_failures,
        last_run_status,
        last_error_class,
        last_error_message,
        last_success_at,
        updated_at
      )
      VALUES ($1::uuid, 0, 'ok', NULL, NULL, now(), now())
      ON CONFLICT (operating_company_id)
      DO UPDATE SET
        consecutive_failures = 0,
        last_run_status = 'ok',
        last_error_class = NULL,
        last_error_message = NULL,
        last_success_at = now(),
        updated_at = now()
    `,
    [operatingCompanyId]
  );
}

async function markCollectionFailure(
  client: DbClient,
  operatingCompanyId: string,
  nextFailureStreak: number,
  failureClass: FailureClass,
  message: string
): Promise<void> {
  await client.query(
    `
      INSERT INTO integrations.samsara_remote_count_collection_state (
        operating_company_id,
        consecutive_failures,
        last_run_status,
        last_error_class,
        last_error_message,
        last_failure_at,
        updated_at
      )
      VALUES ($1::uuid, $2::int, 'failed', $3, $4, now(), now())
      ON CONFLICT (operating_company_id)
      DO UPDATE SET
        consecutive_failures = $2::int,
        last_run_status = 'failed',
        last_error_class = $3,
        last_error_message = $4,
        last_failure_at = now(),
        updated_at = now()
    `,
    [operatingCompanyId, nextFailureStreak, failureClass, message.slice(0, 400)]
  );
}

async function countWithRetry(client: SamsaraClient, entityType: SamsaraRemoteEntityType): Promise<number> {
  const count =
    entityType === "drivers"
      ? await client.countDrivers()
      : await client.countVehicles();
  return count;
}

async function countWithRateLimitRetry(client: SamsaraClient, entityType: SamsaraRemoteEntityType): Promise<number> {
  try {
    return await countWithRetry(client, entityType);
  } catch (error) {
    if (error instanceof SamsaraApiError && error.statusCode === 429) {
      return countWithRetry(client, entityType);
    }
    throw error;
  }
}

export async function collectSamsaraRemoteCounts(
  operatingCompanyId: string,
  options?: {
    collectionRunId?: string;
  }
): Promise<CollectorResult> {
  assertOperatingCompanyId(operatingCompanyId);
  const collectionRunId = options?.collectionRunId ?? randomUUID();

  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);

    const config = await getSamsaraConfigForCompany(client, operatingCompanyId);
    if (!config || !Boolean(config.is_enabled)) {
      await appendAuditEvent(client, "cron_skipped_samsara_disabled", "info", {
        operating_company_id: operatingCompanyId,
        cron_name: "samsara.remote_count_collector",
      });
      return {
        operating_company_id: operatingCompanyId,
        collection_run_id: collectionRunId,
        collected_count: 0,
        failed_entities: [],
        auth_failed: false,
      };
    }

    const token = config.api_token_encrypted
      ? decryptSamsaraSecret(config.api_token_encrypted as Buffer)
      : null;
    const samsara = new SamsaraClient({
      apiToken: token,
      samsaraOrgId: config.samsara_org_id ? String(config.samsara_org_id) : null,
    });

    const previousState = await readCollectionState(client, operatingCompanyId);
    let collectedCount = 0;
    const failedEntities: SamsaraRemoteEntityType[] = [];
    let lastFailureClass: FailureClass | null = null;
    let lastFailureMessage: string | null = null;

    for (const entityType of ENTITY_TYPES) {
      const start = Date.now();
      try {
        const remoteCount = await countWithRateLimitRetry(samsara, entityType);
        const elapsed = Date.now() - start;

        await client.query(
          `
            INSERT INTO integrations.samsara_remote_counts (
              operating_company_id,
              entity_type,
              remote_count,
              polled_at,
              api_response_time_ms,
              api_status_code,
              collection_run_id
            )
            VALUES ($1::uuid, $2, $3::int, now(), $4::int, 200, $5::uuid)
          `,
          [operatingCompanyId, entityType, remoteCount, elapsed, collectionRunId]
        );

        await appendAuditEvent(client, "samsara_remote_count_collected", "info", {
          operating_company_id: operatingCompanyId,
          entity_type: entityType,
          remote_count: remoteCount,
          api_response_time_ms: elapsed,
          collection_run_id: collectionRunId,
        });
        collectedCount += 1;
      } catch (error) {
        failedEntities.push(entityType);
        const classified = classifyCollectorError(error);
        lastFailureClass = classified.failureClass;
        lastFailureMessage = classified.message;

        if (classified.failureClass === "auth_failed") {
          await appendAuditEvent(client, "samsara_auth_failed", "critical", {
            operating_company_id: operatingCompanyId,
            entity_type: entityType,
            api_status_code: classified.statusCode,
            error: classified.message.slice(0, 400),
            collection_run_id: collectionRunId,
          });
        } else if (classified.failureClass === "rate_limited") {
          await appendAuditEvent(client, "samsara_api_rate_limit_hit", "warning", {
            operating_company_id: operatingCompanyId,
            entity_type: entityType,
            api_status_code: classified.statusCode,
            error: classified.message.slice(0, 400),
            collection_run_id: collectionRunId,
          });
        } else {
          await appendAuditEvent(client, "samsara_remote_count_failed", "warning", {
            operating_company_id: operatingCompanyId,
            entity_type: entityType,
            api_status_code: classified.statusCode,
            error: classified.message.slice(0, 400),
            collection_run_id: collectionRunId,
          });
        }
      }
    }

    if (failedEntities.length === 0) {
      await markCollectionSuccess(client, operatingCompanyId);
    } else {
      await markCollectionFailure(
        client,
        operatingCompanyId,
        previousState.consecutive_failures + 1,
        lastFailureClass ?? "transient_error",
        lastFailureMessage ?? "unknown_error"
      );
    }

    return {
      operating_company_id: operatingCompanyId,
      collection_run_id: collectionRunId,
      collected_count: collectedCount,
      failed_entities: failedEntities,
      auth_failed: failedEntities.length > 0 && lastFailureClass === "auth_failed",
    };
  });
}
