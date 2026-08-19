#!/usr/bin/env node
/**
 * AuthGatePanel must expose EntityLinks for bound load/driver/unit/trailer
 * (Exact Leaves dispatch.panel.auth_gate:driver|unit|trailer|load reverse/forward).
 *
 * FAIL: UUID query params only — no EntityLink strip.
 * PASS: data-testid=auth-gate-panel-entitylinks with EntityLink kinds.
 *
 * Self-test: node scripts/verify-auth-gate-panel-entitylinks.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-auth-gate-panel-entitylinks";
const FILE = path.join(ROOT, "apps/frontend/src/components/dispatch/AuthGatePanel.tsx");

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

function checkSource(src) {
  assert(/EntityLinkOrTombstone/.test(src), "must import/use EntityLinkOrTombstone");
  assert(
    /data-testid=["']auth-gate-panel-entitylinks["']/.test(src),
    "must expose auth-gate-panel-entitylinks"
  );
  for (const [kind, id, name, noun] of [
    ["load", "props.loadUuid", "props.loadLabel", "Load"],
    ["driver", "props.driverUuid", "props.driverLabel", "Driver"],
    ["unit", "props.unitUuid", "props.unitLabel", "Unit"],
    ["trailer", "props.trailerUuid", "props.trailerLabel", "Trailer"],
  ]) {
    assert(src.includes(`<EntityLinkOrTombstone kind="${kind}" id={${id}} name={${name}} noun="${noun}"`), `must use unresolved-safe ${kind} drill`);
  }
  assert(/loadLabel\?: string \| null/.test(src), "must accept parent-resolved human labels");
}

function check() {
  checkSource(fs.readFileSync(FILE, "utf8"));
}

function selftest() {
  const original = fs.readFileSync(FILE, "utf8");
  const mutations = [
    [/data-testid=["']auth-gate-panel-entitylinks["']/, 'data-testid="planted-missing"'],
    [/name=\{props\.loadLabel\}/, "name={null}"],
    [/name=\{props\.driverLabel\}/, "name={null}"],
    [/name=\{props\.unitLabel\}/, "name={null}"],
    [/name=\{props\.trailerLabel\}/, "name={null}"],
  ];
  for (const [pattern, replacement] of mutations) {
    const broken = original.replace(pattern, replacement);
    assert(broken !== original, "--selftest plant must mutate source");
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
