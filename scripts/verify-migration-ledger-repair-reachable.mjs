#!/usr/bin/env node
/**
 * LV-087-REPAIR guard.
 *
 * WHY: on 2026-08-16 a migration was applied out-of-band, landing in _system._schema_migrations
 * only. The LV-087 refusal then killed SIX consecutive backend deploys over ~20 minutes, because
 * pre-deploy runs `db:migrate` first. The documented remedy (--backfill-ledger) was UNREACHABLE:
 * it is handled BELOW the throw, and it skips anything already in the canonical ledger, so it could
 * never have repaired a mirror gap regardless.
 *
 * This guard pins the four properties that keep the repair honest and reachable. It is static: it
 * reads db-migrate.mjs, so it runs with no database.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TARGET = path.join(HERE, "db-migrate.mjs");

function check(src) {
  const fail = [];

  const iRepairHandler = src.indexOf("if (REPAIR_MIRROR)");
  const iThrow = src.indexOf("LV-087: the two migration ledgers disagree");
  const iFn = src.indexOf("async function runRepairMirror");

  if (iFn === -1) fail.push("runRepairMirror() is missing — there is no repair path at all.");
  if (iRepairHandler === -1) fail.push("no `if (REPAIR_MIRROR)` handler — the flag is declared but never acted on.");
  if (iThrow === -1) fail.push("the LV-087 divergence refusal is gone — the guard itself was removed.");

  if (iRepairHandler !== -1 && iThrow !== -1 && iRepairHandler > iThrow) {
    fail.push(
      "REACHABILITY: the REPAIR_MIRROR handler sits AFTER the LV-087 throw. It is dead on arrival — " +
        "exactly the --backfill-ledger bug this guard exists to prevent recurring."
    );
  }

  if (iFn !== -1) {
    const body = src.slice(iFn, src.indexOf("\nasync function runBackfillLedger"));
    if (/INSERT INTO \$\{CANONICAL_LEDGER_TABLE\}/.test(body)) {
      fail.push(
        "SAFETY: runRepairMirror writes the CANONICAL ledger. It must only ever copy canonical -> mirror; " +
          "writing canonical would fabricate proof that DDL ran."
      );
    }
    if (!/LV-087-REPAIR: refusing to run/.test(body)) {
      fail.push(
        "SAFETY: runRepairMirror lost its mirror-only refusal. The mirror-only direction is the dangerous " +
          "one (boot accepts either ledger) and must never be auto-repaired."
      );
    }
  }
  return fail;
}

if (process.argv.includes("--selftest")) {
  const good = fs.readFileSync(TARGET, "utf8");
  if (check(good).length) {
    console.error("SELFTEST FAIL: the real file does not pass.\n" + check(good).join("\n"));
    process.exit(1);
  }
  const mutations = {
    "handler moved after the throw": (s) =>
      s.replace(/ {2}if \(REPAIR_MIRROR\) \{[\s\S]*?\n {2}\}\n\n/, "") +
      "\nif (REPAIR_MIRROR) { await runRepairMirror(); }\n",
    "repair writes the canonical ledger": (s) =>
      s.replace(
        "INSERT INTO ${MIRROR_LEDGER_TABLE} (name) VALUES ($1) ON CONFLICT (name) DO NOTHING;",
        "INSERT INTO ${CANONICAL_LEDGER_TABLE} (filename) VALUES ($1) ON CONFLICT DO NOTHING;"
      ),
    "mirror-only refusal removed": (s) => s.replace("LV-087-REPAIR: refusing to run", "silently continuing"),
    "repair function deleted": (s) => s.replace("async function runRepairMirror", "async function __removed__"),
  };
  let ok = true;
  for (const [name, mutate] of Object.entries(mutations)) {
    const failures = check(mutate(good));
    if (failures.length === 0) {
      console.error(`SELFTEST FAIL: guard did NOT catch planted defect -> ${name}`);
      ok = false;
    } else {
      console.log(`selftest ok: caught "${name}" (${failures.length} finding(s))`);
    }
  }
  process.exit(ok ? 0 : 1);
}

const failures = check(fs.readFileSync(TARGET, "utf8"));
if (failures.length) {
  console.error("verify-migration-ledger-repair-reachable FAILED:\n  - " + failures.join("\n  - "));
  process.exit(1);
}
console.log("verify-migration-ledger-repair-reachable PASS");
