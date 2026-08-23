#!/usr/bin/env node
/** Guard: Form 425C generate-PDF must not swallow a blocked popup (silent no-op). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, "apps/frontend/src/pages/form425c/Form425CHome.tsx");

function ok(src) {
  const silent = /window\.open\([^)]*\)[\s\S]{0,80}if\s*\(\s*!w\s*\)\s*return\s*;/.test(src);
  const toast = /if\s*\(\s*!w\s*\)\s*\{[\s\S]{0,200}pushToast\([^)]*Popup blocked/;
  return !silent && toast.test(src);
}

function selftest() {
  const bad = `const w = window.open("", "_blank");\n      if (!w) return;`;
  const good = `const w = window.open("", "_blank");\n      if (!w) {\n        pushToast("Popup blocked — allow popups to print the filing PDF", "error");\n        return;\n      }`;
  if (ok(bad)) {
    console.error("selftest FAIL: silent return should fail");
    process.exit(1);
  }
  if (!ok(good)) {
    console.error("selftest FAIL: toasted block should pass");
    process.exit(1);
  }
  console.log("verify-form-425c-print-popup-blocked --selftest PASS");
}

if (process.argv.includes("--selftest")) selftest();
else {
  const src = fs.readFileSync(file, "utf8");
  if (!ok(src)) {
    console.error("FAIL: generate PDF popup-blocked path must toast, not silent return");
    process.exit(1);
  }
  console.log("verify-form-425c-print-popup-blocked PASS");
}
