#!/usr/bin/env node
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const require = createRequire(import.meta.url);
const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
const { Client } = pg;

const verifyUrl = process.env.DATABASE_URL ?? "";

function redact(url) {
  if (!url) return "<empty>";
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = "****";
    return parsed.toString();
  } catch {
    return "<unparseable>";
  }
}

if (!verifyUrl.includes("localhost:54329") || !verifyUrl.includes("ih35_verify")) {
  console.error("verify:db:reset refusing to run. DATABASE_URL");
  console.error(" does not point to the local verify DB. Expected");
  console.error(" localhost:54329 + ih35_verify. Got: " + redact(verifyUrl));
  process.exit(1);
}

const adminUrl = new URL(verifyUrl);
adminUrl.pathname = "/postgres";
adminUrl.search = "";

const adminClient = new Client(buildPgClientConfig(adminUrl.toString()));

try {
  await adminClient.connect();
  await adminClient.query(
    `
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = 'ih35_verify'
        AND pid <> pg_backend_pid()
    `
  );
  await adminClient.query("DROP DATABASE IF EXISTS ih35_verify");
  await adminClient.query("CREATE DATABASE ih35_verify");
} catch (error) {
  console.error("verify:db:reset failed during drop/recreate:", error instanceof Error ? error.message : String(error));
  process.exit(1);
} finally {
  await adminClient.end();
}

const migrateResult = spawnSync("npm", ["run", "db:migrate"], {
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_URL: verifyUrl,
    DATABASE_DIRECT_URL: verifyUrl,
  },
});

if ((migrateResult.status ?? 1) !== 0) {
  process.exit(migrateResult.status ?? 1);
}

console.log("verify:db:reset completed.");
