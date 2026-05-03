import "dotenv/config";
import { Client } from "pg";
import IORedis from "ioredis";
import { Queue } from "bullmq";

const DATABASE_DIRECT_URL = process.env.DATABASE_DIRECT_URL;
const REDIS_URL = process.env.REDIS_URL;
const QUEUE_NAME = "outbox-drain-v1";

if (!DATABASE_DIRECT_URL) {
  console.error("Missing DATABASE_DIRECT_URL");
  process.exit(1);
}
if (!REDIS_URL) {
  console.error("Missing REDIS_URL");
  process.exit(1);
}

const db = new Client({ connectionString: DATABASE_DIRECT_URL });
const redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
const queue = new Queue(QUEUE_NAME, { connection: redis });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await db.connect();

  const insert = await db.query(
    `
      INSERT INTO outbox.outbox_queue (
        aggregate_type,
        aggregate_id,
        event_type,
        payload
      )
      VALUES ($1, $2, $3, $4::jsonb)
      RETURNING id
    `,
    ["system", "verify-1", "outbox.verify", JSON.stringify({ source: "bt-0-outbox-01" })]
  );

  const outboxId = insert.rows[0].id;
  console.log("[verify] inserted outbox row:", outboxId);

  await queue.add(
    "drain",
    { outboxId },
    { jobId: outboxId, removeOnComplete: true, removeOnFail: 1000 }
  );
  console.log("[verify] enqueued outbox job");

  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    const check = await db.query(
      `SELECT status, processed_at FROM outbox.outbox_queue WHERE id = $1`,
      [outboxId]
    );

    const row = check.rows[0];
    if (row?.status === "SENT" && row?.processed_at) {
      console.log("[verify] PASS: row drained in under 5 minutes");
      await queue.close();
      await redis.quit();
      await db.end();
      return;
    }

    await sleep(2000);
  }

  console.error("[verify] FAIL: row did not drain within 5 minutes");
  await queue.close();
  await redis.quit();
  await db.end();
  process.exit(1);
}

main().catch(async (err) => {
  console.error("[verify] ERROR:", err.message);
  try { await queue.close(); } catch {}
  try { await redis.quit(); } catch {}
  try { await db.end(); } catch {}
  process.exit(1);
});
