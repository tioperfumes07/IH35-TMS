/**
 * Email queue end-to-end smoke (P7-EMAIL-SMOKE-001).
 *
 * Inserts a single queued row addressed to test@ih35dispatch.com, polls until terminal status,
 * then deletes the row (+ dependent alerts if present).
 *
 * Prerequisites:
 * - DATABASE_URL or DATABASE_DIRECT_URL reachable from your workstation.
 * - API/worker must process queued rows (typically EMAIL_CRON_ENABLED=true where cron runs).
 * - Allowed template_key values enforce rendered templates (`report-cadence`).
 *
 * Skip modes:
 * - EMAIL_QUEUE_SMOKE_SKIP=1 → exits 0 without touching DB.
 * - Missing DATABASE_URL/DATABASE_DIRECT_URL → exits 0 (SKIP).
 */
import pg from "pg";

if (process.env.EMAIL_QUEUE_SMOKE_SKIP === "1") {
  console.log("[email-queue e2e] SKIP (EMAIL_QUEUE_SMOKE_SKIP=1)");
  process.exit(0);
}

const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!cs) {
  console.log("[email-queue e2e] SKIP: DATABASE_URL / DATABASE_DIRECT_URL not set");
  process.exit(0);
}

async function withBypass<T>(client: pg.Client, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  await client.query(`BEGIN`);
  await client.query(`SET LOCAL app.bypass_rls = 'lucia'`);
  try {
    const out = await fn(client);
    await client.query(`COMMIT`);
    return out;
  } catch (err) {
    await client.query(`ROLLBACK`).catch(() => {});
    throw err;
  }
}

async function main() {
  const started = Date.now();
  const client = new pg.Client({ connectionString: cs, ssl: cs.includes("localhost") ? undefined : { rejectUnauthorized: false } });
  await client.connect();
  await client.query(`SET ROLE ih35_app`);

  let queueId: string | null = null;

  try {
    const operatingCompanyId = await withBypass(client, async (c) => {
      const fromEnv = process.env.EMAIL_SMOKE_OPERATING_COMPANY_ID?.trim();
      if (fromEnv) return fromEnv;
      const res = await c.query<{ id: string }>(`SELECT id FROM org.companies WHERE code = 'TRANSP' LIMIT 1`);
      const id = res.rows[0]?.id;
      if (!id) throw new Error("Could not resolve company id — set EMAIL_SMOKE_OPERATING_COMPANY_ID or seed TRANSP.");
      return String(id);
    });

    const inserted = await withBypass(client, async (c) => {
      const res = await c.query<{ id: string }>(
        `
          INSERT INTO email.email_queue (
            operating_company_id,
            to_addresses,
            subject,
            template_key,
            template_vars,
            status
          )
          VALUES (
            $1::uuid,
            ARRAY['test@ih35dispatch.com']::text[],
            $2,
            'report-cadence',
            $3::jsonb,
            'queued'
          )
          RETURNING id
        `,
        [
          operatingCompanyId,
          `IH35 email-queue smoke ${new Date().toISOString()}`,
          JSON.stringify({
            subject: "IH35 email-queue smoke",
            htmlBody: "<p>IH35 email_queue smoke — safe to ignore.</p>",
            textBody: "IH35 email_queue smoke — safe to ignore.",
          }),
        ]
      );
      return String(res.rows[0]?.id ?? "");
    });

    queueId = inserted || null;
    if (!queueId) throw new Error("INSERT returned empty id.");

    console.log(`[email-queue e2e] inserted id=${queueId} operating_company_id=${operatingCompanyId}`);
    console.log("[email-queue e2e] Polling up to 60s — requires EMAIL_CRON_ENABLED=true where worker ticks.");

    const deadline = Date.now() + 60_000;
    let terminal: string | null = null;

    while (Date.now() < deadline) {
      const rowRes = await withBypass(client, async (c) => {
        return c.query<{ status: string; error_message: string | null }>(
          `SELECT status, error_message FROM email.email_queue WHERE id = $1::uuid`,
          [queueId]
        );
      });
      const st = rowRes.rows[0] ? String(rowRes.rows[0].status) : null;
      if (st === "sent" || st === "failed") {
        terminal = st;
        if (st === "failed") {
          console.error(`[email-queue e2e] terminal failure detail=${String(rowRes.rows[0]?.error_message ?? "")}`);
        }
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    const elapsed = Date.now() - started;
    if (terminal === "sent") {
      console.log(`[email-queue e2e] PASS (${elapsed}ms)`);
      return;
    }
    if (terminal === "failed") {
      console.error(`[email-queue e2e] FAIL (${elapsed}ms) — terminal status failed`);
      process.exitCode = 1;
      return;
    }

    console.error(`[email-queue e2e] FAIL (${elapsed}ms) — timed out without sent/failed`);
    process.exitCode = 1;
  } finally {
    if (queueId) {
      try {
        await withBypass(client, async (c) => {
          await c.query(`DELETE FROM email.email_alerts WHERE queue_id = $1::uuid`, [queueId]);
          await c.query(`DELETE FROM email.email_queue WHERE id = $1::uuid`, [queueId]);
        });
        console.log(`[email-queue e2e] cleanup deleted id=${queueId}`);
      } catch (cleanupErr) {
        console.error("[email-queue e2e] cleanup failed:", cleanupErr);
      }
    }
    await client.end().catch(() => {});
  }
}

await main();
