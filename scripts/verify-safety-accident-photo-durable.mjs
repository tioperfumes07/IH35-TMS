#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTE = path.join(ROOT, "apps/backend/src/safety/safety.routes.ts");
const MIGRATION = path.join(ROOT, "db/migrations/202608270002_safety_accident_photo_keys.sql");
const route = fs.readFileSync(ROUTE, "utf8");
const migration = fs.readFileSync(MIGRATION, "utf8");

function failuresFor(r, m) {
  const failures = [];
  const upload = r.match(/app\.post\("\/api\/v1\/safety\/accidents\/:id\/photos"[\s\S]*?\n  \}\);/)?.[0] ?? "";
  const checks = [
    ["route fails closed without R2", /if \(!isR2Configured\(\)\)[\s\S]{0,100}503[\s\S]{0,100}r2_not_configured/.test(upload)],
    ["route consumes uploaded bytes", /for await \(const chunk of file\.file\)[\s\S]{0,120}Buffer\.concat/.test(upload)],
    ["route uses company/accident scoped key", /safety\/accidents\/\$\{query\.data\.operating_company_id\}\/\$\{params\.data\.id\}/.test(upload)],
    ["route persists key before success", /UPDATE safety\.accident_reports[\s\S]{0,300}photo_keys = array_append\(photo_keys, \$3\)[\s\S]{0,600}putObjectBytes\(photoKey, buffer/.test(upload)],
    ["route audits durable key", /photo_key: photoKey[\s\S]{0,260}reply\.code\(201\)\.send\(result\)/.test(upload)],
    ["route rejects missing accident", /if \(!result\)[\s\S]{0,100}404[\s\S]{0,100}accident_not_found/.test(upload)],
    ["migration adds append-only key array", /ALTER TABLE safety\.accident_reports[\s\S]{0,160}ADD COLUMN IF NOT EXISTS photo_keys text\[\] NOT NULL DEFAULT '\{\}'::text\[\]/.test(m)],
  ];
  for (const [name, ok] of checks) if (!ok) failures.push(name);
  return failures;
}

const failures = failuresFor(route, migration);
if (failures.length) {
  console.error(`FAIL verify-safety-accident-photo-durable: ${failures.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { route: route.replace("if (!isR2Configured())", "if (false)"), migration },
    { route: route.replace("for await (const chunk of file.file)", "for await (const chunk of [])"), migration },
    { route: route.replace("photo_keys = array_append(photo_keys, $3)", "photo_keys = photo_keys"), migration },
    { route: route.replace("putObjectBytes(photoKey, buffer", "putObjectBytes(photoKey, Buffer.alloc(0)"), migration },
    { route: route.replace("if (!result) return reply.code(404)", "if (!result) return reply.code(200)"), migration },
    { route, migration: migration.replace("photo_keys text[] NOT NULL", "photo_keys text NULL") },
  ];
  let caught = 0;
  for (const mutation of mutations) {
    if (failuresFor(mutation.route, mutation.migration).length) caught += 1;
  }
  if (caught !== mutations.length) {
    console.error(`SELFTEST FAIL verify-safety-accident-photo-durable: caught ${caught}/${mutations.length}`);
    process.exit(1);
  }
  console.log(`SELFTEST PASS verify-safety-accident-photo-durable: caught ${caught}/${mutations.length}`);
  process.exit(0);
}

console.log("PASS verify-safety-accident-photo-durable: accident uploads persist bytes + company-scoped R2 key or fail loudly.");
