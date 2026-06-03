#!/usr/bin/env node
/**
 * A17.2 CI guard — catalogs.driver_* tables must carry A17.2 deprecation COMMENT ON TABLE.
 */
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Client } = pg;

const REQUIRED_TABLES = [
  "license_classes",
  "cdl_endorsements",
  "cdl_restrictions",
  "medical_card_statuses",
  "employment_statuses",
];

function fail(message) {
  console.error(`verify:a17-deprecation-comments FAIL: ${message}`);
  process.exit(1);
}

const connectionString = process.env.DATABASE_DIRECT_URL;
if (!connectionString) {
  console.log("verify:a17-deprecation-comments SKIP (no DATABASE_DIRECT_URL)");
  process.exit(0);
}

const client = new Client({ connectionString });

try {
  await client.connect();

  let checked = 0;
  for (const tableName of REQUIRED_TABLES) {
    const reg = await client.query(`SELECT to_regclass($1) AS reg`, [`catalogs.${tableName}`]);
    if (!reg.rows[0]?.reg) {
      continue;
    }
    checked += 1;
    const commentRes = await client.query(
      `
        SELECT obj_description($1::regclass, 'pg_class') AS comment_text
      `,
      [`catalogs.${tableName}`]
    );
    const comment = String(commentRes.rows[0]?.comment_text ?? "");
    const hasDeprecation =
      comment.includes("DEPRECATED") &&
      (comment.includes("A17.2") || comment.includes("superseded by reference."));
    if (!hasDeprecation) {
      fail(`catalogs.${tableName} missing deprecation comment (got: ${comment || "<empty>"})`);
    }
  }

  if (checked === 0) {
    console.log(
      "verify:a17-deprecation-comments SKIP (no catalogs.driver_* lookup tables present — run db/scripts/a17-2-deprecate-catalogs-driver-tables.sql after bootstrap)"
    );
    process.exit(0);
  }

  console.log(`verify:a17-deprecation-comments PASS (${checked} tables checked)`);
} catch (error) {
  fail(String((error && error.message) || error));
} finally {
  await client.end().catch(() => undefined);
}
