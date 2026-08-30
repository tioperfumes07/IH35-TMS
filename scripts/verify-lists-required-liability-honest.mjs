#!/usr/bin/env node
/** @ratchet — scoreboard liability-declaration honesty only; never product or Live proof. */
/**
 * lists.required.json must NOT claim money column `liability` on catalog type CRUD leaves.
 * Those surfaces write catalogs.* enum/type rows only — never driver_finance.driver_liabilities
 * or escrow money. Inflating Required lied about Box 1 / Built%.
 *
 * Companion: WAVE-C-liability (#6158) audited lists = N/A for liability create.
 * Self-test: node scripts/verify-lists-required-liability-honest.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REQ = path.join(ROOT, "docs/specs/scoreboard/modules/lists.required.json");
const LABEL = "verify-lists-required-liability-honest";

function load() {
  return JSON.parse(fs.readFileSync(REQ, "utf8"));
}

function offenders(req) {
  return (req.leaves || []).filter(
    (leaf) =>
      String(leaf.id || "").startsWith("catalog.") &&
      (leaf.required || []).includes("liability"),
  );
}

function run() {
  const req = load();
  const bad = offenders(req);
  if (bad.length) {
    console.error(
      `${LABEL} FAIL — ${bad.length} catalog leaves still claim liability:\n` +
        bad.map((l) => ` - ${l.id}`).join("\n"),
    );
    process.exit(1);
  }
  const anyLiability = (req.leaves || []).filter((l) => (l.required || []).includes("liability"));
  if (anyLiability.length) {
    console.error(
      `${LABEL} FAIL — unexpected non-catalog lists liability claims:\n` +
        anyLiability.map((l) => ` - ${l.id}`).join("\n"),
    );
    process.exit(1);
  }
  console.log(
    `${LABEL} PASS — lists catalog leaves claim 0 liability Required (type CRUD ≠ driver_liabilities)`,
  );
}

if (process.argv.includes("--selftest")) {
  const req = load();
  const clone = structuredClone(req);
  const target = (clone.leaves || []).find((l) => String(l.id || "").startsWith("catalog."));
  if (!target) {
    console.error(`${LABEL} --selftest FAIL — no catalog leaf to poison`);
    process.exit(1);
  }
  target.required = [...(target.required || []), "liability"];
  const bad = offenders(clone);
  if (!bad.length) {
    console.error(`${LABEL} --selftest FAIL — poison did not trip offender scan`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (poison would trip catalog×liability ban)`);
  process.exit(0);
}

run();
