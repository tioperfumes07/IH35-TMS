#!/usr/bin/env node
/**
 * DeadheadOptimizerPanel must EntityLink the scoped unit
 * (Exact Leaves dispatch.panel.deadhead_optimizer:unit).
 *
 * FAIL: unitUuid used only for the suggestions API — no unit EntityLink in panel chrome.
 * PASS: data-testid=deadhead-optimizer-unit-entitylink with EntityLink kind=unit.
 *
 * Self-test: node scripts/verify-deadhead-optimizer-unit-entitylink.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-deadhead-optimizer-unit-entitylink";
const FILE = path.join(ROOT, "apps/frontend/src/components/dispatch/DeadheadOptimizerPanel.tsx");

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

function checkSource(src) {
  assert(/EntityLink/.test(src), "must use EntityLink");
  assert(
    /data-testid=["']deadhead-optimizer-unit-entitylink["']/.test(src),
    "must expose deadhead-optimizer-unit-entitylink"
  );
  assert(/kind=["']unit["']/.test(src), "must EntityLink kind=unit");
  assert(/unitName\?: string \| null/.test(src), "must accept resolved canonical unit name");
  assert(/id=\{unitUuid\} name=\{unitName\} noun="Unit"/.test(src), "must bind unit id to resolved name");
}

function check() {
  checkSource(fs.readFileSync(FILE, "utf8"));
}

function selftest() {
  const original = fs.readFileSync(FILE, "utf8");
  const mutations = [
    [/data-testid=["']deadhead-optimizer-unit-entitylink["']/, 'data-testid="planted-missing"'],
    [/name=\{unitName\}/, "name={null}"],
    [/unitName\?: string \| null/, "unitName?: never"],
  ];
  for (const [pattern, replacement] of mutations) {
    const broken = original.replace(pattern, replacement);
    assert(broken !== original, `--selftest plant must mutate ${pattern}`);
    let failed = false;
    try { checkSource(broken); } catch { failed = true; }
    assert(failed, `--selftest expected FAIL for ${pattern}`);
  }
  check();
  console.log(`${LABEL}: OK — selftest PASS (${mutations.length} mutations)`);
}

const mode = process.argv.includes("--selftest") ? "selftest" : "check";
try {
  if (mode === "selftest") selftest();
  else {
    check();
    console.log(`${LABEL}: OK`);
  }
} catch (e) {
  console.error(String(e?.message || e));
  process.exit(1);
}
