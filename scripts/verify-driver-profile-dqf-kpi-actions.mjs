#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const registryPath = "docs/specs/drivers/DRIVER-PROFILE-DQF-KPI-ACTIONS.json";

function verify(read = (file) => fs.readFileSync(path.join(root, file), "utf8")) {
  let registry;
  try { registry = JSON.parse(read(registryPath)); } catch (error) { throw new Error(`registry missing or invalid: ${error.message}`); }
  if (!Array.isArray(registry.actions) || registry.actions.length === 0) throw new Error("registry has no actions");
  if (!registry.source || !registry.target) throw new Error("registry must name source and target");
  const source = read(registry.source);
  const target = read(registry.target);
  const renderedLabels = [...source.matchAll(/<KpiCard\s+[\s\S]*?label="([^"]+)"[\s\S]*?\/>/g)].map((match) => match[1]);
  const registeredLabels = registry.actions.map((action) => action.label);
  const missingContracts = renderedLabels.filter((label) => !registeredLabels.includes(label));
  if (missingContracts.length) throw new Error(`rendered KPI missing contract: ${missingContracts.join(", ")}`);
  for (const action of registry.actions) {
    if (!renderedLabels.includes(action.label)) throw new Error(`contract is not rendered: ${action.label}`);
    if (!action.focus || typeof action.focus !== "string") throw new Error(`contract missing focus: ${action.label}`);
    if (!source.includes(`focusDqf("${action.focus}")`)) throw new Error(`KPI is not bound to focus ${action.focus}: ${action.label}`);
  }
  for (const token of ['id="driver-dqf-checklist"', "scrollIntoView", "focus={dqfFocus}", 'focus === "expiry_alerts"', 'item.expiry_pill === "red"', 'item.expiry_pill === "amber"', "rows={visibleItems}", "onClearFocus"]) {
    if (!source.includes(token) && !target.includes(token)) throw new Error(`required action token missing: ${token}`);
  }
  return registry.actions.length;
}

if (process.argv.includes("--selftest")) {
  const originals = new Map();
  const baseRead = (file) => {
    if (!originals.has(file)) originals.set(file, fs.readFileSync(path.join(root, file), "utf8"));
    return originals.get(file);
  };
  verify(baseRead);
  const cases = [
    ["missing registry", registryPath, () => ""],
    ["empty actions", registryPath, (text) => text.replace(/"actions"\s*:\s*\[[\s\S]*\]\s*}/, '"actions": []\n}')],
    ["unregistered KPI", registryPath, (text) => text.replace(/\s*\{ "label": "Expiry alerts"[^\n]+\n/, "\n")],
    ["dead KPI", "apps/frontend/src/pages/drivers/DriverProfilePage.tsx", (text) => text.replace('onClick={() => focusDqf("missing")}', "disabled")],
    ["missing anchor", "apps/frontend/src/pages/drivers/DriverProfilePage.tsx", (text) => text.replace('id="driver-dqf-checklist"', 'id="driver-dqf-checklist-PLANTED"')],
    ["missing filtered rows", "apps/frontend/src/pages/drivers/components/DriverDqfPanel.tsx", (text) => text.replace("rows={visibleItems}", "rows={itemsQ.data ?? []}")],
    ["missing red alert", "apps/frontend/src/pages/drivers/components/DriverDqfPanel.tsx", (text) => text.replace('item.expiry_pill === "red"', "false")],
  ];
  let detected = 0;
  for (const [, file, mutate] of cases) {
    try { verify((requested) => requested === file ? mutate(baseRead(requested)) : baseRead(requested)); } catch { detected += 1; }
  }
  if (detected !== cases.length) throw new Error(`selftest detected ${detected}/${cases.length} planted defects`);
  console.log(`verify-driver-profile-dqf-kpi-actions selftest PASS (${detected}/${cases.length})`);
} else {
  const count = verify();
  console.log(`verify-driver-profile-dqf-kpi-actions PASS — ${count} DQF KPI actions are registered and actionable`);
}
