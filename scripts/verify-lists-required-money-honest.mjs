#!/usr/bin/env node
/** @ratchet — scoreboard money-declaration honesty only; never product or Live proof. */
/**
 * LISTS-REQUIRED-MONEY-INFLATION — catalog.* type CRUD must NOT claim money columns
 * expense / ap_bill / gl_je (same class as liability honesty #6161).
 *
 * Wave D: qbo_chrome is intentionally NOT stripped here.
 *
 * Usage: node scripts/verify-lists-required-money-honest.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REQ = path.join(ROOT, "docs/specs/scoreboard/modules/lists.required.json");
const LABEL = "verify-lists-required-money-honest";
const BANNED = ["expense", "ap_bill", "gl_je"];

function load() {
  return JSON.parse(fs.readFileSync(REQ, "utf8"));
}

function offenders(req) {
  return (req.leaves || []).filter((leaf) => {
    if (!String(leaf.id || "").startsWith("catalog.")) return false;
    return BANNED.some((c) => (leaf.required || []).includes(c));
  });
}

function run() {
  const req = load();
  const bad = offenders(req);
  if (bad.length) {
    console.error(
      `${LABEL} FAIL — ${bad.length} catalog leaves still claim expense|ap_bill|gl_je:\n` +
        bad
          .slice(0, 20)
          .map((l) => ` - ${l.id}: ${(l.required || []).filter((c) => BANNED.includes(c)).join(",")}`)
          .join("\n") +
        (bad.length > 20 ? `\n … +${bad.length - 20} more` : ""),
    );
    process.exit(1);
  }
  console.log(
    `${LABEL} PASS — lists catalog leaves claim 0 expense/ap_bill/gl_je Required (type CRUD ≠ money)`,
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
  target.required = [...(target.required || []), "expense"];
  const bad = offenders(clone);
  if (!bad.length) {
    console.error(`${LABEL} --selftest FAIL — poison did not trip`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (poison would trip catalog×expense ban)`);
  process.exit(0);
}

run();
