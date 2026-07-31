#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/safety/Permits.tsx";
export function run(root = ROOT) {
  const failures = [];
  const src = fs.readFileSync(path.join(root, PAGE), "utf8");
  if (src.includes('"Aug 31"') || src.includes("'Aug 31'")) {
    failures.push(`${PAGE}: must not hardcode Form 2290 deadline (SAF-F32)`);
  }
  if (!src.includes("Form 2290 due date unavailable")) {
    failures.push(`${PAGE}: must show unavailable copy when deadline is missing`);
  }
  if (!src.includes("resolveApiUrl")) {
    failures.push(`${PAGE}: deadline fetch must use resolveApiUrl (SAF-F06 companion)`);
  }
  if (!src.includes("SAF-F32")) {
    failures.push(`${PAGE}: keep SAF-F32 comment anchoring the honesty rule`);
  }
  return failures;
}
function selftest() {
  const clean = run();
  if (clean.length) { console.error("SELFTEST FAIL already red", clean); process.exit(1); }
  const abs = path.join(ROOT, PAGE);
  const original = fs.readFileSync(abs, "utf8");
  try {
    fs.writeFileSync(abs, original.replace("Form 2290 due date unavailable", "Form 2290 due Aug 31").replace(/deadlineQ\.data\?\.deadline \?\? null/, 'deadlineQ.data?.deadline ?? "Aug 31"'));
    if (!run().some((f) => f.includes("hardcode") || f.includes("unavailable"))) {
      console.error("SELFTEST FAIL planted hardcode not caught", run());
      process.exit(1);
    }
  } finally { fs.writeFileSync(abs, original); }
  console.log("verify-saf-f32-permits-deadline-honesty --selftest OK");
}
if (process.argv.includes("--selftest")) selftest();
else {
  const f = run();
  if (f.length) { console.error("FAIL\n  - " + f.join("\n  - ")); process.exit(1); }
  console.log("verify-saf-f32-permits-deadline-honesty OK");
}
