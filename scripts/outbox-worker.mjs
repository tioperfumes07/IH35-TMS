import "dotenv/config";
import { Client } from "pg";
import IORedis from "ioredis";
import { Queue, Worker } from "bullmq";

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

async function enqueuePending(limit = 200) {
  const { rows } = await db.query(
    `
      SELECT id
      FROM outbox.outbox_queue
      WHERE status = 'PENDING'
        AND available_at <= now()
      ORDER BY created_at ASC
      LIMIT $1
    `,
    [limit]
  );

  for (const row of rows) {
    await queue.add(
      "drain",
      { outboxId: row.id },
      { jobId: row.id, removeOnComplete: true, removeOnFail: 1000 }
    );
  }

  if (rows.length > 0) {
    console.log(`[outbox-worker] enqueued ${rows.length} pending rows`);
  }
}

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    const outboxId = job.data.outboxId;

    await db.query("BEGIN");
    try {
      const claim = await db.query(
        `
          UPDATE outbox.outbox_queue
          SET status = 'PROCESSING',
              attempts = attempts + 1,
              locked_at = now(),
              updated_at = now()
          WHERE id = $1
            AND status = 'PENDING'
          RETURNING id
        `,
        [outboxId]
      );

      if (claim.rowCount === 0) {
        await db.query("ROLLBACK");
        return { skipped: true };
      }

      await db.query(
        `
          UPDATE outbox.outbox_queue
          SET status = 'SENT',
              processed_at = now(),
              updated_at = now(),
              last_error = NULL
          WHERE id = $1
        `,
        [outboxId]
      );

      await db.query("COMMIT");
      return { sent: true, outboxId };
    } catch (err) {
      await db.query("ROLLBACK");

      await db.query(
        `
          UPDATE outbox.outbox_queue
          SET status = 'FAILED',
              last_error = left($2, 2000),
              updated_at = now()
          WHERE id = $1
        `,
        [outboxId, String(err?.message || err)]
      );

      throw err;
    }
  },
  { connection: redis, concurrency: 5 }
);

worker.on("ready", () => console.log("[outbox-worker] ready"));
worker.on("completed", (job, result) => {
  console.log("[outbox-worker] completed", job.id, result);
});
worker.on("failed", (job, err) => {
  console.error("[outbox-worker] failed", job?.id, err?.message);
});

await db.connect();
await enqueuePending();
const ticker = setInterval(() => enqueuePending().catch(console.error), 5000);

const shutdown = async () => {
  clearInterval(ticker);
  await worker.close();
  await queue.close();
  await redis.quit();
  await db.end();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
