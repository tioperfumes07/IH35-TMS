import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Client } = pg;
const connectionString = process.env.DATABASE_DIRECT_URL;

if (!connectionString) {
  console.error("Missing DATABASE_DIRECT_URL in environment.");
  process.exit(1);
}

const migrationsDir = path.resolve("db/migrations");
const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

const client = new Client({ connectionString });

try {
  await client.connect();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    console.log(`Applying migration: ${file}`);
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
  }
  console.log("Migrations applied successfully.");
} catch (err) {
  try { await client.query("ROLLBACK"); } catch {}
  console.error("Migration failed:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
