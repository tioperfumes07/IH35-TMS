import "dotenv/config";
import { Client } from "pg";

const DATABASE_DIRECT_URL = process.env.DATABASE_DIRECT_URL;

if (!DATABASE_DIRECT_URL) {
  console.error("Missing DATABASE_DIRECT_URL");
  process.exit(1);
}

const db = new Client({ connectionString: DATABASE_DIRECT_URL });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await db.connect();

  const insert = await db.query(
    `
      INSERT INTO outbox.events (event_type, payload, next_retry_at)
      VALUES ($1, $2::jsonb, now())
      RETURNING id
    `,
    ["test.noop", JSON.stringify({ source: "BT-2-OUTBOX-PROCESSOR" })]
  );

  const outboxEventId = insert.rows[0].id;
  console.log("[verify] inserted outbox event:", outboxEventId);

  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    const check = await db.query(
      `SELECT delivered_at, failed_at, retry_count, last_error FROM outbox.events WHERE id = $1`,
      [outboxEventId]
    );

    const row = check.rows[0];
    if (row?.delivered_at) {
      console.log("[verify] PASS: row drained in under 5 minutes");
      await db.end();
      return;
    }
    if (row?.failed_at) {
      console.error(`[verify] FAIL: row reached failed_at, retry_count=${row.retry_count}, error=${row.last_error ?? "unknown"}`);
      await db.end();
      process.exit(1);
    }

    await sleep(2000);
  }

  console.error("[verify] FAIL: row did not drain within 5 minutes");
  await db.end();
  process.exit(1);
}

main().catch(async (err) => {
  console.error("[verify] ERROR:", err.message);
  try { await db.end(); } catch {}
  process.exit(1);
});
