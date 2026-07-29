#!/usr/bin/env node
// verify-fixed-asset-autopost-trk-enable — Cursor band 1742 (ACCT-F44).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SUFFIX = "_trk_accum_depr_default_and_fa_enable.sql";

function findMig() {
  const dir = path.join(ROOT, "db/migrations");
  const hit = fs.existsSync(dir) ? fs.readdirSync(dir).find((f) => f.endsWith(SUFFIX)) : null;
  return hit ? path.join(dir, hit) : null;
}

function analyze(sql) {
  const f = [];
  if (!/accum_depr_default/.test(sql)) f.push("must bind accum_depr_default");
  if (!/FIXED_ASSET_AUTOPOST_ENABLED/.test(sql)) f.push("must enable FIXED_ASSET_AUTOPOST_ENABLED");
  if (!/code\s*=\s*'TRK'|code = 'TRK'/.test(sql)) f.push("must scope to TRK");
  if (/code\s*=\s*'TRANSP'[\s\S]{0,80}FIXED_ASSET_AUTOPOST_ENABLED[\s\S]{0,80}true/i.test(sql)) {
    f.push("must not enable FA for TRANSP");
  }
  if (/Unit\/Flatbed|never steal|!~\*|!~\*/i.test(sql) === false && !/unit\|flatbed/i.test(sql)) {
    f.push("must refuse binding a Unit/Flatbed AD account as the control");
  }
  for (const pf of ["QBO_JE_PUSH_ENABLED", "QBO_ENTITY_PUSH_ENABLED"]) {
    if (sql.includes(pf) && /true/.test(sql)) f.push(`must not touch ${pf}`);
  }
  if (/RAISE\s+EXCEPTION/i.test(sql)) f.push("must not RAISE EXCEPTION");
  if (!/NOTICE/.test(sql)) f.push("must NOTICE-skip");
  return f;
}

if (process.argv.includes("--selftest")) {
  const good = `code = 'TRK'; accum_depr_default; FIXED_ASSET_AUTOPOST_ENABLED; unit|flatbed; RAISE NOTICE 'x'; never steal`;
  const bad = `RAISE EXCEPTION 'x'; QBO_JE_PUSH_ENABLED true;`;
  if (analyze(good).length === 0 && analyze(bad).length > 0) {
    console.log("verify-fixed-asset-autopost-trk-enable --selftest: PASS");
    process.exit(0);
  }
  console.error("selftest FAIL", analyze(good), analyze(bad));
  process.exit(1);
}

const mig = findMig();
if (!mig) {
  console.error(`FAIL: missing *${SUFFIX}`);
  process.exit(1);
}
const failures = analyze(fs.readFileSync(mig, "utf8"));
if (failures.length) {
  console.error("FAIL verify-fixed-asset-autopost-trk-enable:");
  for (const x of failures) console.error(" -", x);
  process.exit(1);
}
console.log(`PASS verify-fixed-asset-autopost-trk-enable — ${path.basename(mig)}`);
