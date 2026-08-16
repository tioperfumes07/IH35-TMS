import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser, withSavepoint } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { computeRelayWalletBalanceControl } from "./relay-wallet-balance-control.service.js";
import { isEnabled } from "../../lib/feature-flags/service.js";
import { relayApiBase, relayApiKey } from "./relay-client.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

type RelayHealthStatus = "ok" | "auth_failed" | "not_configured" | "base_missing" | "error" | null;

type RelayPublicHealth = {
  is_configured: boolean;
  is_enabled: boolean;
  last_pull_at: string | null;
  last_health_status: RelayHealthStatus;
  last_error: string | null;
};

function currentOfficeUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  const user = req.user as { uuid: string; role: string };
  if (user.role === "Driver") {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return user;
}

function classifyRelayConfigError(err: unknown): RelayHealthStatus {
  const message = String((err as Error | undefined)?.message ?? err);
  if (message.includes("relay_api_base_missing")) return "base_missing";
  return "error";
}

export async function registerRelayHealthRoutes(app: FastifyInstance) {
  app.get("/api/integrations/relay/health", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentOfficeUser(req, reply);
    if (!user) return;

    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    }

    const oc = parsed.data.operating_company_id;
    try {
      const health = await withCurrentUser(user.uuid, async (client): Promise<RelayPublicHealth> => {
        await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [oc]);
        // LV-ORPHANED-GUC-WRITE-ACTIVE-COMPANY-ID: no app.active_company_id — unread inert GUC.

        const company = await client.query<{ code: string | null }>(
          `SELECT code FROM org.companies WHERE id = $1::uuid LIMIT 1`,
          [oc]
        );
        if (!company.rows[0]) {
          throw Object.assign(new Error("operating_company_not_found"), { statusCode: 404 });
        }

        const hasKey = relayApiKey(company.rows[0].code) !== null;
        let hasBase = false;
        let configStatus: RelayHealthStatus = null;
        try {
          relayApiBase();
          hasBase = true;
        } catch (err) {
          configStatus = classifyRelayConfigError(err);
        }
        const isConfigured = hasKey && hasBase;

        const relayIngestFlagOn = await isEnabled(client, "RELAY_FUEL_INGEST_ENABLED", { operating_company_id: oc });

        const lastPullAt = await withSavepoint(
          client,
          "relay_health_last_pull",
          async () => {
            const columnRes = await client.query<{ column_name: string }>(
              `
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'integrations'
                  AND table_name = 'relay_fuel_transactions'
                  AND column_name IN ('pulled_at', 'created_at')
                ORDER BY CASE column_name WHEN 'pulled_at' THEN 0 ELSE 1 END
                LIMIT 1
              `
            );
            const timestampColumn = columnRes.rows[0]?.column_name === "pulled_at" ? "pulled_at" : "created_at";
            const res = await client.query<{ last_pull_at: string | null }>(
              `
                SELECT max(${timestampColumn})::text AS last_pull_at
                FROM integrations.relay_fuel_transactions
                WHERE operating_company_id = $1::uuid
              `,
              [oc]
            );
            return res.rows[0]?.last_pull_at ?? null;
          },
          null
        );

        const latestFailure = await withSavepoint(
        client,
        "relay_health_latest_failure",
        async () => {
          const res = await client.query<{ failed_at: string | null; last_error: string | null }>(
            `
              SELECT created_at::text AS failed_at,
                     COALESCE(
                payload #>> '{error,message}',
                payload ->> 'error',
                payload ->> 'message'
              ) AS last_error
              FROM audit.audit_events
              WHERE source = 'RELAY-FUEL-INGEST-1'
                AND event_class = 'integrations.relay_fuel_ingest_daily_pull_failed'
                AND payload ->> 'operating_company_id' = $1
              ORDER BY created_at DESC
              LIMIT 1
            `,
            [oc]
          );
          return res.rows[0] ?? null;
        },
        null
      );

      let lastHealthStatus: RelayHealthStatus = configStatus;
      const latestUnrecoveredError =
        latestFailure?.last_error &&
        (!lastPullAt || !latestFailure.failed_at || Date.parse(latestFailure.failed_at) >= Date.parse(lastPullAt))
          ? latestFailure.last_error
          : null;
      if (!isConfigured) lastHealthStatus = hasKey ? "base_missing" : "not_configured";
      else if (latestUnrecoveredError) {
        lastHealthStatus = /auth|401|403/i.test(latestUnrecoveredError) ? "auth_failed" : "error";
      } else if (lastPullAt) {
        lastHealthStatus = "ok";
      }

        return {
          is_configured: isConfigured,
          is_enabled: relayIngestFlagOn,
          last_pull_at: lastPullAt,
          last_health_status: lastHealthStatus,
          last_error: latestUnrecoveredError,
        };
      });

      return health;
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 404) {
        return reply.code(404).send({ error: "operating_company_not_found" });
      }
      throw err;
    }
  });

  // CONN-3 wallet reconciling control — read-only. The wallet is carried as an ASSET precisely so its
  // balance can be proved against Relay's reported balance; without a surface that compares them the
  // account is bookkeeping with nothing verifying it. Flags every divergence with no dollar threshold
  // (RECON-01) and auto-corrects nothing — a control that fixes its own exceptions cannot be trusted
  // to report them.
  app.get(
    "/api/integrations/relay/wallet-balance-control",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentOfficeUser(req, reply);
      if (!user) return;

      const parsed = companyQuerySchema.safeParse(req.query ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
      }
      const oc = parsed.data.operating_company_id;

      const control = await withCurrentUser(user.uuid, async (client) => {
        await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [oc]);
        return computeRelayWalletBalanceControl(client, oc);
      });
      return reply.code(200).send(control);
    }
  );

}
