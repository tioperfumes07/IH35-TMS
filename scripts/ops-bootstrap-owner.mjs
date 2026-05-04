import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;
const connectionString = process.env.DATABASE_DIRECT_URL;
if (!connectionString) {
  console.error("Missing DATABASE_DIRECT_URL");
  process.exit(1);
}

const TARGET_EMAIL = process.env.OPS_BOOTSTRAP_OWNER_EMAIL ?? "tioperfumes07@gmail.com";
const pool = new Pool({ connectionString });
const client = await pool.connect();

try {
  await client.query("SET ROLE ih35_app");
  await client.query("BEGIN");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");

  const findRes = await client.query(
    "SELECT id, email, role FROM identity.users WHERE email = $1 LIMIT 1",
    [TARGET_EMAIL]
  );

  if (findRes.rows.length === 0) {
    throw new Error(`User ${TARGET_EMAIL} not found`);
  }

  const user = findRes.rows[0];
  console.log(`Found user: id=${user.id} email=${user.email} current_role=${user.role}`);

  if (user.role === "Owner") {
    console.log("User is already Owner. No change needed.");
    await client.query("COMMIT");
    process.exit(0);
  }

  const fromRole = user.role;
  await client.query("UPDATE identity.users SET role = 'Owner' WHERE id = $1", [user.id]);

  await client.query(
    `SELECT audit.append_event($1, $2, $3::jsonb, $4::uuid, $5)`,
    [
      "identity.users.role_changed",
      "warning",
      JSON.stringify({
        resource_id: user.id,
        resource_type: "identity.users",
        email: user.email,
        changes: { role: { from: fromRole, to: "Owner" } },
        reason: "ops bootstrap: first Owner",
      }),
      user.id,
      "BT-WEB-OPS-BOOTSTRAP",
    ]
  );

  await client.query("COMMIT");
  console.log(`SUCCESS: ${user.email} role changed from ${fromRole} to Owner.`);
  console.log("Audit event emitted with source=BT-WEB-OPS-BOOTSTRAP.");
} catch (err) {
  await client.query("ROLLBACK");
  console.error(`FAIL: ${err?.message ?? err}`);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
