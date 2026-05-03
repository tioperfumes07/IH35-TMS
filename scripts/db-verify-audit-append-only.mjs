import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Client } = pg;
const connectionString = process.env.DATABASE_DIRECT_URL;

if (!connectionString) {
  console.error("Missing DATABASE_DIRECT_URL in environment.");
  process.exit(1);
}

const client = new Client({ connectionString });

function expectDenied(err) {
  const msg = String(err?.message || "").toLowerCase();
  return (
    msg.includes("policy") ||
    msg.includes("permission") ||
    msg.includes("row-level security") ||
    msg.includes("append-only") ||
    msg.includes("not allowed")
  );
}

try {
  await client.connect();

  const insertRes = await client.query(
    `SELECT audit.append_event($1,$2,$3::jsonb,$4::uuid,$5) AS id`,
    ["audit.smoke", "info", JSON.stringify({ source: "verify-script" }), null, "bt-0-audit-01"]
  );

  const id = insertRes.rows[0]?.id;
  if (!id) throw new Error("append_event did not return id");

  let updateDenied = false;
  try {
    await client.query(`UPDATE audit.audit_events SET event_class='audit.mutated' WHERE uuid=$1`, [id]);
  } catch (err) {
    updateDenied = expectDenied(err);
  }

  let deleteDenied = false;
  try {
    await client.query(`DELETE FROM audit.audit_events WHERE uuid=$1`, [id]);
  } catch (err) {
    deleteDenied = expectDenied(err);
  }

  if (!updateDenied || !deleteDenied) {
    throw new Error(`Append-only verification failed: updateDenied=${updateDenied}, deleteDenied=${deleteDenied}`);
  }

  console.log("PASS: audit.append_event works and UPDATE/DELETE are blocked.");
} catch (err) {
  console.error("FAIL:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
