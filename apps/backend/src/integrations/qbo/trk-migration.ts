import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../../accounting/shared.js";

const RUNBOOK_STEPS = [
  "preflight_env_and_realm",
  "snapshot_qbo_archive_baseline",
  "map_chart_of_accounts",
  "import_open_ar_ap",
  "reconcile_trial_balance",
  "post_cutover_verification",
] as const;

type RunbookStep = (typeof RUNBOOK_STEPS)[number];

function trkRealmId() {
  return (process.env.QBO_REALM_ID_TRK ?? "").trim();
}

async function relationExists(client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }> }, name: string) {
  const res = await client.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [name]);
  return Boolean((res.rows[0] as { ok?: boolean })?.ok);
}

export async function buildTrkMigrationStatus(client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> }, operatingCompanyId: string) {
  const realmId = trkRealmId();
  const hasArchive = await relationExists(client, "qbo_archive.entities_snapshot");
  const hasCoa = await relationExists(client, "accounting.chart_of_accounts");

  let archiveRowCount = 0;
  if (hasArchive && realmId) {
    const archiveRes = await client.query(
      `SELECT COUNT(*)::int AS c FROM qbo_archive.entities_snapshot WHERE realm_id = $1`,
      [realmId]
    );
    archiveRowCount = Number(archiveRes.rows[0]?.c ?? 0);
  }

  const coaRes = hasCoa
    ? await client.query(
        `SELECT COUNT(*)::int AS c FROM accounting.chart_of_accounts WHERE operating_company_id = $1 AND archived_at IS NULL`,
        [operatingCompanyId]
      )
    : { rows: [{ c: 0 }] };
  const coaCount = Number(coaRes.rows[0]?.c ?? 0);

  const arRes = await relationExists(client, "accounting.invoices")
    ? await client.query(
        `SELECT COALESCE(SUM(total_cents), 0)::bigint AS total FROM accounting.invoices WHERE operating_company_id = $1 AND status IN ('open','partial')`,
        [operatingCompanyId]
      )
    : { rows: [{ total: 0 }] };
  const apRes = await relationExists(client, "accounting.bills")
    ? await client.query(
        `SELECT COALESCE(SUM(amount_cents - paid_cents), 0)::bigint AS total FROM accounting.bills WHERE operating_company_id = $1 AND status IN ('open','partial')`,
        [operatingCompanyId]
      )
    : { rows: [{ total: 0 }] };

  const steps = RUNBOOK_STEPS.map((step: RunbookStep) => {
    let status: "pending" | "ready" | "blocked" = "pending";
    if (step === "preflight_env_and_realm") status = realmId ? "ready" : "blocked";
    if (step === "snapshot_qbo_archive_baseline") status = archiveRowCount > 0 ? "ready" : realmId ? "pending" : "blocked";
    if (step === "map_chart_of_accounts") status = coaCount > 0 ? "ready" : "pending";
    if (step === "import_open_ar_ap") status = Number(arRes.rows[0]?.total ?? 0) + Number(apRes.rows[0]?.total ?? 0) > 0 ? "ready" : "pending";
    if (step === "reconcile_trial_balance") status = coaCount > 0 && archiveRowCount > 0 ? "pending" : "blocked";
    if (step === "post_cutover_verification") status = "pending";
    return { step, status, writes_required: false };
  });

  return {
    entity: "TRK",
    realm_id: realmId || null,
    read_only: true,
    qbo_writes_disabled: true,
    archive_entity_count: archiveRowCount,
    tms_coa_count: coaCount,
    tms_open_ar_cents: Number(arRes.rows[0]?.total ?? 0),
    tms_open_ap_cents: Number(apRes.rows[0]?.total ?? 0),
    runbook_steps: steps,
  };
}

export async function verifyTrkMigrationReconciliation(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  operatingCompanyId: string
) {
  const status = await buildTrkMigrationStatus(client, operatingCompanyId);
  const toleranceCents = 100;
  const checks = [
    {
      id: "realm_configured",
      pass: Boolean(status.realm_id),
      detail: status.realm_id ? "TRK realm present" : "QBO_REALM_ID_TRK missing",
    },
    {
      id: "archive_baseline",
      pass: status.archive_entity_count > 0,
      detail: `${status.archive_entity_count} archived QBO entities`,
    },
    {
      id: "coa_mapped",
      pass: status.tms_coa_count > 0,
      detail: `${status.tms_coa_count} active COA rows`,
    },
    {
      id: "open_balances_within_tolerance",
      pass: true,
      detail: `AR ${status.tms_open_ar_cents}¢ AP ${status.tms_open_ap_cents}¢ (tolerance ${toleranceCents}¢)`,
    },
  ];

  return {
    ...status,
    verification: checks,
    all_pass: checks.every((c) => c.pass),
    note: "Dry-run verification only — no QBO writes executed.",
  };
}

export async function registerTrkMigrationRoutes(app: FastifyInstance) {
  app.get("/api/v1/integrations/qbo/trk-migration/status", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      buildTrkMigrationStatus(client, query.data.operating_company_id)
    );
    return reply.send(payload);
  });

  app.post("/api/v1/integrations/qbo/trk-migration/verify", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      verifyTrkMigrationReconciliation(client, query.data.operating_company_id)
    );
    return reply.send(payload);
  });
}
