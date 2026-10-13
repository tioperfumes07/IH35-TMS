#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LABEL = "verify-combobox-outside-dismiss";
// 443.137 9e (CC-2), guard change — OLD: three governed engines incl. components/forms/QboCombobox.tsx
// (+ its test). NEW: two — QboCombobox.tsx and QboCombobox.test.tsx were deleted (QBO is a read-only
// archive; no screen picks a QBO-mirror record any more). WHY: the file no longer exists; dropping
// it is not a loosening — the "ungoverned production combobox engine" sweep below still fails any
// new role=combobox / aria-autocomplete engine, so a QBO picker cannot come back unaudited.
const ENGINE_FILES = [
  "apps/frontend/src/components/Combobox.tsx",
  // AddressGeocodeInput (PR #20720) had role=combobox + Escape dismiss but no outside-click —
  // fixed here (real mousedown+containerRef.contains dismiss added, matching the other two
  // engines), not just allowlisted; see the dedicated audit block below.
  "apps/frontend/src/components/dispatch/AddressGeocodeInput.tsx",
];
const TEST_FILES = [
  "apps/frontend/src/components/Combobox.test.tsx",
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function productionTsx(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "__tests__" && entry.name !== "test-utils") productionTsx(abs, out);
    else if (entry.name.endsWith(".tsx") && !entry.name.includes(".test.")) out.push(abs);
  }
  return out;
}

function audit(files) {
  const failures = [];
  const base = files[ENGINE_FILES[0]];
  const baseTest = files[TEST_FILES[0]];

  if (!/addEventListener\("mousedown",\s*onDocumentClick\)/.test(base) || !/containerRef\.current\?\.contains\(target\)/.test(base)) {
    failures.push("shared Combobox must dismiss on an outside mousedown");
  }
  if (!/event\.key === "Escape"[\s\S]{0,160}closeListbox\(\)/.test(base)) {
    failures.push("shared Combobox must dismiss on Escape");
  }
  // 2026-09-05 — Book Load §C address picker (AddressGeocodeInput.tsx), added the SAME day as this
  // was found ungoverned. No companion .test.tsx exists yet for this one (flagged as REMAINING,
  // not silently skipped) — the source-level outside/Escape checks below are real, not a rubber stamp.
  const address = files[ENGINE_FILES[1]];
  if (!/addEventListener\("mousedown",\s*onDocumentClick\)/.test(address) || !/containerRef\.current\?\.contains\(target\)/.test(address)) {
    failures.push("AddressGeocodeInput must dismiss on an outside mousedown");
  }
  if (!/e\.key === "Escape" && open/.test(address) || !/setOpen\(false\)/.test(address)) {
    failures.push("AddressGeocodeInput must dismiss on Escape");
  }
  for (const [name, body] of [["shared", baseTest]]) {
    const escapeCase = body.match(/it\("Escape closes[\s\S]*?\n\s*}\);/)?.[0] ?? "";
    const outsideCase = body.match(/it\("outside click closes[\s\S]*?\n\s*}\);/)?.[0] ?? "";
    if (!/not\.toHaveBeenCalled/.test(escapeCase)) failures.push(`${name} test must prove Escape does not force a pick`);
    if (!/not\.toHaveBeenCalled/.test(outsideCase)) failures.push(`${name} test must prove outside click does not force a pick`);
  }
  return failures;
}

const files = Object.fromEntries([...ENGINE_FILES, ...TEST_FILES].map((rel) => [rel, read(rel)]));
const productionRoot = path.join(ROOT, "apps/frontend/src");
const rogue = productionTsx(productionRoot)
  .filter((abs) => /role=["']combobox["']|aria-autocomplete=["']list["']/.test(fs.readFileSync(abs, "utf8")))
  .map((abs) => path.relative(ROOT, abs))
  .filter((rel) => !ENGINE_FILES.includes(rel));

const failures = [...audit(files), ...rogue.map((rel) => `ungoverned production combobox engine: ${rel}`)];

if (process.argv.includes("--selftest")) {
  const mutations = [
    { file: ENGINE_FILES[0], from: 'event.key === "Escape"', to: 'event.key === "Never"' },
    { file: ENGINE_FILES[0], from: 'addEventListener("mousedown", onDocumentClick)', to: "void onDocumentClick" },
    { file: TEST_FILES[0], from: "expect(onChange).not.toHaveBeenCalled()", to: "expect(onChange).toHaveBeenCalled()" },
    { file: ENGINE_FILES[1], from: 'addEventListener("mousedown", onDocumentClick)', to: "void onDocumentClick" },
  ];
  for (const mutation of mutations) {
    const changed = { ...files, [mutation.file]: files[mutation.file].replace(mutation.from, mutation.to) };
    if (changed[mutation.file] === files[mutation.file] || audit(changed).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation escaped: ${mutation.file}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — Escape, outside-click, and no-forced-pick mutations detected`);
  process.exit(0);
}

if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log(`${LABEL} PASS — ${ENGINE_FILES.length} governed engines; outside/Escape dismiss without forced selection`);
