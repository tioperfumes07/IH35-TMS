#!/usr/bin/env node
/**
 * verify-owner-all-entities-non-qbo-flags-on
 *
 * Owner 2026-08-15: everything ON except QuickBooks sync/write-back/mirror-pull/heal.
 * Migration: db/migrations/202612581400_owner_all_entities_non_qbo_flags_on.sql
 *
 * Static guard: migration must (1) enable non-sync flags for TRANSP+TRK+USMCA,
 * (2) keep QBO sync-class OFF, (3) keep read-only QBO *UI* flags out of the OFF set.
 *
 * Selftest: node scripts/verify-owner-all-entities-non-qbo-flags-on.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-owner-all-entities-non-qbo-flags-on";
const MIG =
  "db/migrations/202612581400_owner_all_entities_non_qbo_flags_on.sql";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function check(src) {
  assert(src.includes("TRANSP"), `${MIG}: must scope TRANSP`);
  assert(src.includes("TRK"), `${MIG}: must scope TRK`);
  assert(src.includes("USMCA"), `${MIG}: must scope USMCA`);
  assert(src.includes("TMS_QBO_RECON_ENABLED"), `${MIG}: must force TMS_QBO_RECON_ENABLED OFF`);
  assert(src.includes("QBO_JE_PUSH_ENABLED"), `${MIG}: must force QBO_JE_PUSH_ENABLED OFF`);
  assert(src.includes("QBO_ENTITY_PUSH_ENABLED"), `${MIG}: must force QBO_ENTITY_PUSH_ENABLED OFF`);
  assert(src.includes("NOT LIKE '%UI%'"), `${MIG}: must exclude QBO UI flags from sync-OFF set`);
  assert(src.includes("enabled = true") || src.includes("enabled, set_by_user_uuid"), `${MIG}: must enable non-sync overrides`);
  assert(!/default_enabled\s*=\s*true/.test(src), `${MIG}: must not flip global default_enabled (per-entity overrides only)`);
}

function selftest() {
  const good = fs.readFileSync(MIG, "utf8");
  check(good);

  const badNoUi = good.replace("AND r.flag_key NOT LIKE '%UI%'", "");
  let failed = false;
  try {
    check(badNoUi);
  } catch {
    failed = true;
  }
  assert(failed, `${LABEL} --selftest: expected FAIL when UI exclusion removed`);

  const badNoUsmca = good.replaceAll("USMCA", "XXXX");
  failed = false;
  try {
    check(badNoUsmca);
  } catch {
    failed = true;
  }
  assert(failed, `${LABEL} --selftest: expected FAIL when USMCA removed`);

  console.log(`${LABEL} --selftest PASS`);
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  process.chdir(root);
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  check(fs.readFileSync(MIG, "utf8"));
  console.log(`${LABEL} PASS — migration encodes owner ALL-ON except QBO sync`);
}

main();
