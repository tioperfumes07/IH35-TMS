#!/usr/bin/env node
/**
 * SaveLoadTemplateModal must EntityLink source load + customer
 * (Exact Leaves dispatch.modal.save_load_template:load|customer|reverse_link).
 *
 * FAIL: name-only modal with no EntityLinks to the source load/customer.
 * PASS: data-testid=save-load-template-modal-entitylinks + LoadDetailDrawer props.
 *
 * Self-test: node scripts/verify-save-load-template-modal-entitylinks.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-save-load-template-modal-entitylinks";
const MODAL = path.join(ROOT, "apps/frontend/src/pages/dispatch/LoadTemplateLibrary.tsx");
const DRAWER = path.join(ROOT, "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx");

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

function checkSource(modal) {
  const drawer = fs.readFileSync(DRAWER, "utf8");
  assert(/import\s*\{\s*EntityLinkOrTombstone\s*\}\s*from\s*["'][^"']*\/EntityLinkOrTombstone["']/.test(modal), "modal must import canonical label-aware tombstones");
  assert(
    /data-testid=["']save-load-template-modal-entitylinks["']/.test(modal),
    "must expose save-load-template-modal-entitylinks"
  );
  assert(/kind="load" id=\{loadId\} name=\{loadNumber\} noun="Load"/.test(modal), "load id must be coupled to its nullable human number");
  assert(/kind="customer" id=\{customerId\} name=\{customerName\} noun="Customer"/.test(modal), "customer id must be coupled to its nullable human name");
  assert(/loadId=\{load\.id\}/.test(drawer), "LoadDetailDrawer must pass loadId");
  assert(/customerId=\{load\.customer_id\}/.test(drawer), "LoadDetailDrawer must pass customerId");
}

function check() {
  checkSource(fs.readFileSync(MODAL, "utf8"));
}

function selftest() {
  const original = fs.readFileSync(MODAL, "utf8");
  const mutations = [
    [/data-testid=["']save-load-template-modal-entitylinks["']/, 'data-testid="planted-missing"'],
    [/name=\{loadNumber\}/, "name={loadId}"],
    [/name=\{customerName\}/, "name={customerId}"],
    [/EntityLinkOrTombstone/, "EntityLink"],
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
