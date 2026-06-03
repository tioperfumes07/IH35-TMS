#!/usr/bin/env node
/**
 * One-off Samsara vehicle location backfill (manual run only — not wired to cron).
 *
 * Usage:
 *   node scripts/ops/samsara-positions-backfill.mjs <operating_company_id>
 */
import crypto from "node:crypto";
import { createRequire } from "node:module";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const require = createRequire(import.meta.url);
const { buildPgClientConfig } = require("../lib/pg-connection-options.cjs");

const operatingCompanyId = process.argv[2]?.trim();
if (!operatingCompanyId) {
  console.error("Usage: node scripts/ops/samsara-positions-backfill.mjs <operating_company_id>");
  process.exit(1);
}

const API_BASE = (process.env.SAMSARA_API_BASE_URL ?? "https://api.samsara.com").trim();
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
  const key = Buffer.from(raw, "hex");
  if (key.length !== 32) throw new Error("SAMSARA_TOKEN_ENCRYPTION_KEY must decode to 32 bytes");
  return key;
}

function decryptSecret(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length <= IV_BYTES + AUTH_TAG_BYTES) {
    throw new Error("invalid_encrypted_secret");
  }
  const key = resolveEncryptionKey();
  const iv = buffer.subarray(0, IV_BYTES);
  const authTag = buffer.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
  const encrypted = buffer.subarray(IV_BYTES + AUTH_TAG_BYTES);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

function parseLocation(row) {
  const location = row.location && typeof row.location === "object" ? row.location : null;
  if (!location) return null;
  const lat = Number(location.latitude ?? location.lat);
  const lng = Number(location.longitude ?? location.lng ?? location.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const timeRaw = location.time ?? location.timestamp ?? location.recorded_at ?? new Date().toISOString();
  return {
    vehicleId: String(row.id),
    lat,
    lng,
    capturedAt: new Date(timeRaw).toISOString(),
    speedMph: Number.isFinite(Number(location.speed)) ? Number(location.speed) : null,
    headingDeg: Number.isFinite(Number(location.heading)) ? Number(location.heading) : null,
  };
}

async function fetchLocations(token) {
  const out = [];
  let after = null;
  for (let page = 0; page < 50; page += 1) {
    const url = new URL(`${API_BASE}/fleet/vehicles/locations`);
    url.searchParams.set("limit", "512");
    if (after) url.searchParams.set("after", after);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    if (!res.ok) {
      throw new Error(`samsara_http_${res.status}`);
    }
    const json = await res.json();
    const rows = Array.isArray(json.data) ? json.data : [];
    for (const row of rows) {
      const parsed = parseLocation(row);
      if (parsed) out.push(parsed);
    }
    const pagination = json.pagination ?? {};
    const cursor = typeof pagination.endCursor === "string" ? pagination.endCursor : null;
    if (!pagination.hasNextPage || !cursor) break;
    after = cursor;
  }
  return out;
}

async function loadUnitMap(client, companyId) {
  const map = new Map();
  const mirror = await client.query(
    `SELECT samsara_vehicle_id, local_unit_id::text AS unit_id
     FROM integrations.samsara_vehicles
     WHERE operating_company_id = $1::uuid AND local_unit_id IS NOT NULL`,
    [companyId]
  );
  for (const row of mirror.rows) map.set(row.samsara_vehicle_id, row.unit_id);

  const units = await client.query(
    `SELECT samsara_vehicle_id, id::text AS unit_id
     FROM mdata.units
     WHERE samsara_vehicle_id IS NOT NULL
       AND deactivated_at IS NULL
       AND COALESCE(currently_leased_to_company_id, owner_company_id) = $1::uuid`,
    [companyId]
  );
  for (const row of units.rows) {
    if (!map.has(row.samsara_vehicle_id)) map.set(row.samsara_vehicle_id, row.unit_id);
  }
  return map;
}

const client = new pg.Client(buildPgClientConfig());
await client.connect();

try {
  await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
  await client.query(`SELECT identity.set_lucia_bypass(true)`);

  const cfgRes = await client.query(
    `SELECT encrypted_api_token, api_token_encrypted, is_enabled
     FROM integrations.samsara_config
     WHERE operating_company_id = $1::uuid
     LIMIT 1`,
    [operatingCompanyId]
  );
  const cfg = cfgRes.rows[0];
  if (!cfg?.is_enabled) {
    throw new Error("samsara_not_enabled_for_tenant");
  }
  const enc = cfg.encrypted_api_token ?? cfg.api_token_encrypted;
  const token = decryptSecret(enc);
  const locations = await fetchLocations(token);
  const unitMap = await loadUnitMap(client, operatingCompanyId);

  let inserted = 0;
  for (const location of locations) {
    const unitId = unitMap.get(location.vehicleId);
    if (!unitId) continue;
    const rawEventId = `backfill:locations:${location.vehicleId}:${location.capturedAt}`;
    const result = await client.query(
      `INSERT INTO telematics.vehicle_locations (
         operating_company_id, unit_id, samsara_vehicle_id, captured_at, lat, lng, speed_mph, heading_deg, engine_state, raw_samsara_event_id
       ) VALUES ($1::uuid,$2::uuid,$3,$4::timestamptz,$5,$6,$7,$8,'unknown',$9)
       ON CONFLICT (operating_company_id, raw_samsara_event_id) DO NOTHING`,
      [
        operatingCompanyId,
        unitId,
        location.vehicleId,
        location.capturedAt,
        location.lat,
        location.lng,
        location.speedMph,
        location.headingDeg,
        rawEventId,
      ]
    );
    inserted += result.rowCount ?? 0;
  }

  console.log(`Fetched ${locations.length} positions, inserted ${inserted}.`);
} finally {
  await client.end();
}
