#!/usr/bin/env node
// verify-feature-flag-key-shape.mjs (2026-07-12)
// A company/entity UUID was written as a lib.feature_flags.flag_key, creating a junk non-flag row.
// This guard locks the two defenses so they can't regress:
//   (1) app boundary: createFlag() AND setOverride() call assertPlausibleFlagKey(), which rejects a
//       UUID-shaped flag_key.
//   (2) DB: migration 202607360000 adds a CHECK constraint so a UUID-shaped flag_key can't be inserted.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-feature-flag-key-shape";
const SERVICE = "apps/backend/src/lib/feature-flags/service.ts";
const MIGRATION = "db/migrations/202607360000_feature_flag_key_not_uuid.sql";

const errs = [];
const svc = (() => { try { return fs.readFileSync(path.join(ROOT, SERVICE), "utf8"); } catch { return null; } })();
if (svc == null) {
  console.error(`[${LABEL}] FAILED — missing ${SERVICE}`);
  process.exit(1);
}

// (1) assertPlausibleFlagKey defined + rejects UUID-shaped keys
if (!/export function assertPlausibleFlagKey\s*\(/.test(svc))
  errs.push(`${SERVICE}: assertPlausibleFlagKey() not defined`);
if (!/invalid_flag_key_uuid_shaped/.test(svc))
  errs.push(`${SERVICE}: no 'invalid_flag_key_uuid_shaped' rejection`);

// (2) createFlag + setOverride call it before inserting
for (const fn of ["createFlag", "setOverride"]) {
  const idx = svc.indexOf(`export async function ${fn}`);
  if (idx < 0) { errs.push(`${SERVICE}: ${fn}() not found`); continue; }
  const body = svc.slice(idx, idx + 900);
  if (!/assertPlausibleFlagKey\s*\(/.test(body))
    errs.push(`${SERVICE}: ${fn}() does not call assertPlausibleFlagKey() (a UUID-shaped key could be written)`);
}

// (3) migration adds the CHECK constraint + cleans junk
const mig = (() => { try { return fs.readFileSync(path.join(ROOT, MIGRATION), "utf8"); } catch { return null; } })();
if (mig == null) {
  errs.push(`missing ${MIGRATION}`);
} else {
  if (!/ADD CONSTRAINT\s+feature_flags_flag_key_not_uuid/i.test(mig))
    errs.push(`${MIGRATION}: does not add the feature_flags_flag_key_not_uuid CHECK constraint`);
  if (!/CHECK\s*\(\s*flag_key\s*!~\*/i.test(mig))
    errs.push(`${MIGRATION}: CHECK does not forbid a UUID-shaped flag_key`);
  if (!/DELETE FROM lib\.feature_flags\b/i.test(mig))
    errs.push(`${MIGRATION}: does not delete existing UUID-shaped junk rows`);
}

if (errs.length) {
  console.error(`[${LABEL}] FAILED — ${errs.length} issue(s):`);
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — createFlag/setOverride reject UUID-shaped keys + DB CHECK constraint enforces it.`);
