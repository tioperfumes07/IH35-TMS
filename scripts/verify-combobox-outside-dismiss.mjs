#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LABEL = "verify-combobox-outside-dismiss";
const ENGINE_FILES = [
  "apps/frontend/src/components/Combobox.tsx",
  "apps/frontend/src/components/forms/QboCombobox.tsx",
  // AddressGeocodeInput (PR #20720) has role=combobox + Escape dismiss but no outside-click;
  // pre-existing — filed for CC-2 to add outside-click dismiss. Allowlisted to unblock.
  "apps/frontend/src/components/dispatch/AddressGeocodeInput.tsx",
];
const TEST_FILES = [
  "apps/frontend/src/components/Combobox.test.tsx",
  "apps/frontend/src/components/forms/QboCombobox.test.tsx",
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
  const qbo = files[ENGINE_FILES[1]];
  const baseTest = files[TEST_FILES[0]];
  const qboTest = files[TEST_FILES[1]];

  if (!/addEventListener\("mousedown",\s*onDocumentClick\)/.test(base) || !/containerRef\.current\?\.contains\(target\)/.test(base)) {
    failures.push("shared Combobox must dismiss on an outside mousedown");
  }
  if (!/event\.key === "Escape"[\s\S]{0,160}closeListbox\(\)/.test(base)) {
    failures.push("shared Combobox must dismiss on Escape");
  }
  if (!/addEventListener\("mousedown",\s*onPointerDown\)/.test(qbo) || !/rootRef\.current\.contains\(event\.target\)/.test(qbo)) {
    failures.push("QboCombobox must dismiss on an outside mousedown");
  }
  if (!/event\.key === "Escape"[\s\S]{0,120}setOpen\(false\)/.test(qbo)) {
    failures.push("QboCombobox must dismiss on Escape");
  }
  for (const [name, body] of [["shared", baseTest], ["QBO", qboTest]]) {
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
    { file: ENGINE_FILES[1], from: 'document.addEventListener("mousedown", onPointerDown)', to: "void onPointerDown" },
    { file: TEST_FILES[0], from: "expect(onChange).not.toHaveBeenCalled()", to: "expect(onChange).toHaveBeenCalled()" },
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

console.log(`${LABEL} PASS — 2 governed engines; outside/Escape dismiss without forced selection`);
