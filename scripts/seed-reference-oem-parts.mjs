#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const require = createRequire(import.meta.url);
const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
const { Client } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(ROOT, "scripts/data/oem-parts-bootstrap.json");

export function loadOemPartsBootstrapManifest(manifestPath = MANIFEST_PATH) {
  const raw = fs.readFileSync(manifestPath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.parts)) {
    throw new Error("oem_parts bootstrap manifest must contain parts array");
  }
  return parsed.parts;
}

export function buildUpsertSql() {
  return `
    INSERT INTO reference.oem_parts (
      brand, model_compat, oem_part_number, part_name, category,
      sub_category, description, unit_cost_usd_typical, default_supplier
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (brand, oem_part_number) DO UPDATE SET
      model_compat = EXCLUDED.model_compat,
      part_name = EXCLUDED.part_name,
      category = EXCLUDED.category,
      sub_category = EXCLUDED.sub_category,
      description = EXCLUDED.description,
      unit_cost_usd_typical = EXCLUDED.unit_cost_usd_typical,
      default_supplier = EXCLUDED.default_supplier,
      updated_at = now(),
      archived_at = NULL
  `;
}

export async function seedReferenceOemParts(client, parts = loadOemPartsBootstrapManifest()) {
  const upsertSql = buildUpsertSql();
  let upserted = 0;
  for (const part of parts) {
    await client.query(upsertSql, [
      part.brand,
      part.model_compat ?? null,
      part.oem_part_number ?? null,
      part.part_name,
      part.category,
      part.sub_category ?? null,
      part.description ?? null,
      part.unit_cost_usd_typical ?? null,
      part.default_supplier ?? null,
    ]);
    upserted += 1;
  }
  const countRes = await client.query(`SELECT count(*)::int AS total FROM reference.oem_parts WHERE archived_at IS NULL`);
  return { upserted, active_total: countRes.rows[0]?.total ?? 0 };
}

async function main() {
  const databaseUrl = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
  }
  const client = new Client(buildPgClientConfig(databaseUrl));
  await client.connect();
  try {
    const result = await seedReferenceOemParts(client);
    console.log(`seed-reference-oem-parts: upserted ${result.upserted} rows; active total ${result.active_total}`);
  } finally {
    await client.end();
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
