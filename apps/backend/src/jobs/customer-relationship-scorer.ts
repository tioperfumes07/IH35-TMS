/**
 * GAP-72 — Customer relationship health scorer worker.
 *
 * Recomputes customer relationship scores every 6 hours.
 */
import type { FastifyInstance } from "fastify";
import { withLuciaBypass } from "../auth/db.js";
import { computeRelationshipScore, upsertRelationshipScore } from "../customers/relationship-score/scorer.service.js";

const WORKER_NAME = "customers.relationship_score_worker";
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

let timer: NodeJS.Timeout | undefined;

function intervalMs(): number {
  const raw = Number(process.env.CUSTOMER_RELATIONSHIP_SCORER_INTERVAL_MS ?? String(DEFAULT_INTERVAL_MS));
  return Number.isFinite(raw) && raw >= 60_000 ? raw : DEFAULT_INTERVAL_MS;
}

async function relationshipScoresTableExists(client: { query: (sql: string) => Promise<{ rows: Array<{ rel?: string | null }> }> }) {
  const res = await client.query(`SELECT to_regclass('master_data.customer_relationship_scores') AS rel`);
  return Boolean(res.rows[0]?.rel);
}

export async function runCustomerRelationshipScorerTick(): Promise<{
  companies_processed: number;
  customers_scored: number;
}> {
  let companiesProcessed = 0;
  let customersScored = 0;

  await withLuciaBypass(async (client) => {
    if (!(await relationshipScoresTableExists(client))) {
      return;
    }

    const companies = await client.query<{ id: string }>(
      `
        SELECT id::text AS id
        FROM org.companies
        WHERE is_active = true
          AND deactivated_at IS NULL
        ORDER BY id
      `
    );

    for (const company of companies.rows) {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [company.id]);
      const customers = await client.query<{ id: string }>(
        `
          SELECT id::text AS id
          FROM mdata.customers
          WHERE operating_company_id = $1::uuid
            AND deactivated_at IS NULL
        `,
        [company.id]
      );

      for (const customer of customers.rows) {
        const computed = await computeRelationshipScore(client, {
          operating_company_id: company.id,
          customer_uuid: customer.id,
        });
        await upsertRelationshipScore(client, computed);
        customersScored += 1;
      }

      companiesProcessed += 1;
    }
  });

  return { companies_processed: companiesProcessed, customers_scored: customersScored };
}

export function initializeCustomerRelationshipScorerWorker(app: FastifyInstance) {
  const ms = intervalMs();

  const run = async () => {
    try {
      const result = await runCustomerRelationshipScorerTick();
      app.log.info(result, `[${WORKER_NAME}] tick complete`);
    } catch (err) {
      app.log.error({ err }, `[${WORKER_NAME}] tick failed`);
    }
  };

  void run();
  timer = setInterval(() => {
    void run();
  }, ms);

  app.log.info({ intervalMs: ms }, `[${WORKER_NAME}] started`);
}

export function stopCustomerRelationshipScorerWorker() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
