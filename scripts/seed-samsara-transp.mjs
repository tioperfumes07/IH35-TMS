#!/usr/bin/env node
import crypto from "node:crypto";
import { createRequire } from "node:module";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const require = createRequire(import.meta.url);
const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");

const { Client } = pg;
const OPERATING_COMPANY_ID = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";
const API_BASE = (process.env.SAMSARA_API_BASE_URL ?? "https://api.samsara.com").trim();
const TOKEN = (process.env.SAMSARA_API_TOKEN ?? "").trim();
const WEBHOOK_SECRET = (process.env.SAMSARA_WEBHOOK_SECRET ?? TOKEN).trim();
const ORG_ID = (process.env.SAMSARA_ORG_ID ?? "").trim() || null;
const DATABASE_URL = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const DEV_FALLBACK_SEED = "ih35-samsara-dev-encryption-key";

function resolveEncryptionKey() {
  const raw = (process.env.SAMSARA_TOKEN_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || "").trim();
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SAMSARA_TOKEN_ENCRYPTION_KEY (or ENCRYPTION_KEY) is required in production");
    }
    return crypto.createHash("sha256").update(DEV_FALLBACK_SEED).digest();
  }
  if (!/^[0-9a-fA-F]+$/.test(raw)) {
    throw new Error("SAMSARA_TOKEN_ENCRYPTION_KEY must be hex");
  }
  const key = Buffer.from(raw, "hex");
  if (key.length !== 32) {
    throw new Error("SAMSARA_TOKEN_ENCRYPTION_KEY must decode to 32 bytes");
  }
  return key;
}

function encryptSecret(plain) {
  const key = resolveEncryptionKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]);
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}`, Accept: "application/json" };
}

async function fetchSamsaraList(endpoint) {
  const records = [];
  let after = null;
  for (let page = 0; page < 50; page += 1) {
    const url = new URL(`${API_BASE}${endpoint}`);
    url.searchParams.set("limit", "512");
    if (after) url.searchParams.set("after", after);
    const res = await fetch(url, { headers: authHeaders(TOKEN) });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`samsara_http_${res.status}:${body.slice(0, 500)}`);
    }
    const json = await res.json();
    const rows = Array.isArray(json.data) ? json.data : [];
    for (const row of rows) {
      if (row && typeof row === "object" && typeof row.id === "string" && row.id.trim()) {
        records.push(row);
      }
    }
    const pagination = json.pagination ?? {};
    const hasNextPage = Boolean(pagination.hasNextPage);
    const cursor = typeof pagination.endCursor === "string" && pagination.endCursor.trim() ? pagination.endCursor : null;
    if (!hasNextPage || !cursor) break;
    after = cursor;
  }
  return records;
}

async function columnExists(client, schema, table, column) {
  const res = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = $2
          AND column_name = $3
      ) AS ok
    `,
    [schema, table, column]
  );
  return Boolean(res.rows[0]?.ok);
}

async function relationExists(client, qualifiedName) {
  const res = await client.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [qualifiedName]);
  return Boolean(res.rows[0]?.ok);
}

async function functionExists(client, qualifiedName) {
  const [schema, fn] = qualifiedName.split(".");
  const res = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = $1
          AND p.proname = $2
      ) AS ok
    `,
    [schema, fn]
  );
  return Boolean(res.rows[0]?.ok);
}

async function seedConfig(client, tokenCipher, webhookCipher) {
  const hasCanonicalToken = await columnExists(client, "integrations", "samsara_config", "encrypted_api_token");
  const hasConnectedAt = await columnExists(client, "integrations", "samsara_config", "connected_at");
  const hasDisconnectedAt = await columnExists(client, "integrations", "samsara_config", "disconnected_at");
  const hasTokenVersion = await columnExists(client, "integrations", "samsara_config", "token_key_version");

  const columns = [
    "operating_company_id",
    "samsara_org_id",
    "api_token_encrypted",
    "webhook_secret_encrypted",
    "is_enabled",
  ];
  const values = ["$1::uuid", "$2", "$3", "$4", "true"];
  const updates = [
    "samsara_org_id = EXCLUDED.samsara_org_id",
    "api_token_encrypted = EXCLUDED.api_token_encrypted",
    "webhook_secret_encrypted = EXCLUDED.webhook_secret_encrypted",
    "is_enabled = true",
  ];

  if (hasCanonicalToken) {
    columns.push("encrypted_api_token");
    values.push("$3");
    updates.push("encrypted_api_token = EXCLUDED.encrypted_api_token");
  }
  if (hasConnectedAt) {
    columns.push("connected_at");
    values.push("now()");
    updates.push("connected_at = now()");
  }
  if (hasDisconnectedAt) {
    columns.push("disconnected_at");
    values.push("NULL");
    updates.push("disconnected_at = NULL");
  }
  if (hasTokenVersion) {
    columns.push("token_key_version");
    values.push("1");
    updates.push("token_key_version = 1");
  }

  await client.query(
    `
      INSERT INTO integrations.samsara_config (${columns.join(", ")})
      VALUES (${values.join(", ")})
      ON CONFLICT (operating_company_id) DO UPDATE SET
        ${updates.join(", ")}
    `,
    [OPERATING_COMPANY_ID, ORG_ID, tokenCipher, webhookCipher]
  );
}

async function upsertProjectionRows(client, tableName, idColumn, rows) {
  for (const row of rows) {
    await client.query(
      `
        INSERT INTO ${tableName} (
          operating_company_id,
          ${idColumn},
          raw_payload,
          last_seen_at
        )
        VALUES ($1::uuid, $2, $3::jsonb, now())
        ON CONFLICT (operating_company_id, ${idColumn})
        DO UPDATE SET
          raw_payload = EXCLUDED.raw_payload,
          last_seen_at = now()
      `,
      [OPERATING_COMPANY_ID, String(row.id), JSON.stringify(row)]
    );
  }
}

async function appendAuditEventIfAvailable(client, eventClass, severity, payload) {
  if (!(await functionExists(client, "audit.append_event"))) return;
  await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
    eventClass,
    severity,
    JSON.stringify(payload),
    "SAMSARA_TRANSP_ONE_SHOT_SEED",
  ]);
}

async function insertRemoteCountIfAvailable(client, entityType, remoteCount, runId) {
  if (!(await relationExists(client, "integrations.samsara_remote_counts"))) return;
  await client.query(
    `
      INSERT INTO integrations.samsara_remote_counts (
        operating_company_id,
        entity_type,
        remote_count,
        polled_at,
        api_response_time_ms,
        api_status_code,
        collection_run_id
      )
      VALUES ($1::uuid, $2, $3::int, now(), 0, 200, $4::uuid)
    `,
    [OPERATING_COMPANY_ID, entityType, remoteCount, runId]
  );
}

async function main() {
  if (!DATABASE_URL) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
  if (!TOKEN) throw new Error("SAMSARA_API_TOKEN is required");
  if (!WEBHOOK_SECRET) throw new Error("SAMSARA_WEBHOOK_SECRET (or fallback token) is required");

  const client = new Client(buildPgClientConfig(DATABASE_URL));
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [OPERATING_COMPANY_ID]);

    const tokenCipher = encryptSecret(TOKEN);
    const webhookCipher = encryptSecret(WEBHOOK_SECRET);
    await seedConfig(client, tokenCipher, webhookCipher);

    const [drivers, vehicles] = await Promise.all([
      fetchSamsaraList("/fleet/drivers"),
      fetchSamsaraList("/fleet/vehicles"),
    ]);

    await upsertProjectionRows(client, "integrations.samsara_drivers", "samsara_driver_id", drivers);
    await upsertProjectionRows(client, "integrations.samsara_vehicles", "samsara_vehicle_id", vehicles);

    const runId = crypto.randomUUID();
    await insertRemoteCountIfAvailable(client, "drivers", drivers.length, runId);
    await insertRemoteCountIfAvailable(client, "vehicles", vehicles.length, runId);

    await appendAuditEventIfAvailable(client, "samsara_remote_count_collected", "info", {
      operating_company_id: OPERATING_COMPANY_ID,
      entity_type: "drivers",
      remote_count: drivers.length,
      collection_run_id: runId,
    });
    await appendAuditEventIfAvailable(client, "samsara_remote_count_collected", "info", {
      operating_company_id: OPERATING_COMPANY_ID,
      entity_type: "vehicles",
      remote_count: vehicles.length,
      collection_run_id: runId,
    });

    const verify = await client.query(
      `
        SELECT
          (SELECT count(*)::int FROM integrations.samsara_drivers WHERE operating_company_id = $1::uuid) AS drivers_rows,
          (SELECT count(*)::int FROM integrations.samsara_vehicles WHERE operating_company_id = $1::uuid) AS vehicles_rows,
          (SELECT count(*)::int FROM integrations.samsara_remote_counts WHERE operating_company_id = $1::uuid AND entity_type = 'drivers') AS rc_drivers_rows,
          (SELECT count(*)::int FROM integrations.samsara_remote_counts WHERE operating_company_id = $1::uuid AND entity_type = 'vehicles') AS rc_vehicles_rows,
          (SELECT count(*)::int FROM audit.events WHERE operating_company_id = $1::uuid AND event_class = 'samsara_remote_count_collected') AS audit_rows
      `,
      [OPERATING_COMPANY_ID]
    );

    await client.query("COMMIT");
    const row = verify.rows[0] ?? {};
    console.log("seed-samsara-transp: OK");
    console.log(JSON.stringify({
      operating_company_id: OPERATING_COMPANY_ID,
      drivers_remote: drivers.length,
      vehicles_remote: vehicles.length,
      drivers_rows: Number(row.drivers_rows ?? 0),
      vehicles_rows: Number(row.vehicles_rows ?? 0),
      remote_counts_drivers_rows: Number(row.rc_drivers_rows ?? 0),
      remote_counts_vehicles_rows: Number(row.rc_vehicles_rows ?? 0),
      audit_rows: Number(row.audit_rows ?? 0),
      warning: vehicles.length > 4 ? "vehicles_remote_gt_4_check_tenant_contamination" : null,
    }, null, 2));
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback failure
    }
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`seed-samsara-transp FAILED: ${String(error?.message ?? error)}`);
  process.exit(1);
});
