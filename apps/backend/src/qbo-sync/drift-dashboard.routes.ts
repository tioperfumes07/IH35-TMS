import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withLuciaBypass } from "../auth/db.js";
import { fetchChartOfAccountsSyncStatus } from "./chart-of-accounts-reconciler.js";
import { fetchItemsSyncStatus } from "./items-reconciler.js";
import type { DriftEntityType } from "./drift-detector.js";

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const resolveBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  resolution_action: z.enum(["accept_local", "accept_qbo", "manual_merge_recorded"]),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user as { uuid: string; role: string };
}

function accountingRoles(role: string) {
  return ["Owner", "Administrator", "Accountant", "Manager"].includes(role);
}

type EntitySummary = {
  entity_type: DriftEntityType;
  label: string;
  synced: number;
  drift: number;
  total_local: number;
  last_sync: string | null;
  unresolved_drift_log: number;
};

async function fetchOptionalCustomersStatus(operatingCompanyId: string) {
  try {
    const mod = await import("./customers-reconciler.js");
    if (typeof mod.fetchCustomersSyncStatus === "function") {
      return mod.fetchCustomersSyncStatus(operatingCompanyId);
    }
  } catch {
    // QBO-SYNC-3 not deployed
  }
  return null;
}

async function fetchOptionalVendorsStatus(operatingCompanyId: string) {
  try {
    const mod = await import("./vendors-reconciler.js");
    if (typeof mod.fetchVendorsSyncStatus === "function") {
      return mod.fetchVendorsSyncStatus(operatingCompanyId);
    }
  } catch {
    // QBO-SYNC-3 not deployed
  }
  return null;
}

async function countDriftLogByEntity(client: import("pg").PoolClient, operatingCompanyId: string) {
  const res = await client.query<{ entity_type: DriftEntityType; c: string }>(
    `
      SELECT entity_type, COUNT(*)::text AS c
      FROM qbo_sync.drift_log
      WHERE operating_company_id = $1::uuid
        AND resolved_at IS NULL
      GROUP BY entity_type
    `,
    [operatingCompanyId]
  );
  const map = new Map<DriftEntityType, number>();
  for (const row of res.rows) {
    map.set(row.entity_type, Number(row.c));
  }
  return map;
}

async function fetchLastAlert(client: import("pg").PoolClient, operatingCompanyId: string) {
  const res = await client.query<{ entity_type: string; alert_day: string; drift_count: string }>(
    `
      SELECT entity_type, alert_day::text, drift_count::text
      FROM qbo_sync.drift_alert_throttle
      WHERE operating_company_id = $1::uuid
      ORDER BY alert_day DESC, entity_type
      LIMIT 1
    `,
    [operatingCompanyId]
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    entity_type: row.entity_type,
    alert_day: row.alert_day,
    drift_count: Number(row.drift_count),
  };
}

export async function registerQboSyncDriftDashboardRoutes(app: FastifyInstance) {
  app.get("/api/v1/qbo-sync/drift-dashboard", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!accountingRoles(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    const operatingCompanyId = parsed.data.operating_company_id;
    const [coa, items, customers, vendors] = await Promise.all([
      fetchChartOfAccountsSyncStatus(operatingCompanyId),
      fetchItemsSyncStatus(operatingCompanyId),
      fetchOptionalCustomersStatus(operatingCompanyId),
      fetchOptionalVendorsStatus(operatingCompanyId),
    ]);

    const payload = await withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
      const driftLogCounts = await countDriftLogByEntity(client, operatingCompanyId);
      const lastAlert = await fetchLastAlert(client, operatingCompanyId);

      const entities: EntitySummary[] = [
        {
          entity_type: "chart_of_accounts",
          label: "Chart of Accounts",
          synced: coa.synced,
          drift: coa.drift_detected,
          total_local: coa.total_local,
          last_sync: coa.last_pull_at,
          unresolved_drift_log: driftLogCounts.get("chart_of_accounts") ?? 0,
        },
        {
          entity_type: "items",
          label: "Products & Services",
          synced: items.synced,
          drift: items.drift_detected,
          total_local: items.total_local,
          last_sync: items.last_pull_at,
          unresolved_drift_log: driftLogCounts.get("items") ?? 0,
        },
      ];

      if (customers) {
        entities.push({
          entity_type: "customers",
          label: "Customers",
          synced: customers.synced,
          drift: customers.drift_detected,
          total_local: customers.total_local,
          last_sync: customers.last_pull_at,
          unresolved_drift_log: driftLogCounts.get("customers") ?? 0,
        });
      }

      if (vendors) {
        entities.push({
          entity_type: "vendors",
          label: "Vendors",
          synced: vendors.synced,
          drift: vendors.drift_detected,
          total_local: vendors.total_local,
          last_sync: vendors.last_pull_at,
          unresolved_drift_log: driftLogCounts.get("vendors") ?? 0,
        });
      }

      const logRes = await client.query(
        `
          SELECT
            id::text,
            entity_type,
            entity_id::text,
            qbo_id,
            drift_type,
            local_snapshot,
            qbo_snapshot,
            detected_at::text,
            resolved_at::text,
            resolution_action
          FROM qbo_sync.drift_log
          WHERE operating_company_id = $1::uuid
          ORDER BY detected_at DESC
          LIMIT 200
        `,
        [operatingCompanyId]
      );

      return {
        entities,
        last_alert: lastAlert,
        drift_log: logRes.rows,
      };
    });

    return reply.send(payload);
  });

  app.post("/api/v1/qbo-sync/drift-log/:id/resolve", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!accountingRoles(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });

    const body = resolveBodySchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const updated = await withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [body.data.operating_company_id]);
      const res = await client.query(
        `
          UPDATE qbo_sync.drift_log
          SET resolved_at = now(),
              resolution_action = $3
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
            AND resolved_at IS NULL
          RETURNING id::text
        `,
        [params.data.id, body.data.operating_company_id, body.data.resolution_action]
      );
      return res.rows[0]?.id ?? null;
    });

    if (!updated) return reply.code(404).send({ error: "drift_log_not_found" });
    return reply.send({ ok: true, id: updated });
  });
}
