#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/safety/Permits.tsx";

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

export function run(root = ROOT) {
  const failures = [];
  const raw = fs.readFileSync(path.join(root, PAGE), "utf8");
  const src = stripComments(raw);
  if (/\?\?\s*["']Aug 31["']/.test(src) || /deadline\s*=\s*["']Aug 31["']/.test(src)) {
    failures.push(`${PAGE}: must not hardcode Form 2290 deadline (SAF-F32)`);
  }
  if (!raw.includes("Form 2290 due date unavailable")) {
    failures.push(`${PAGE}: must show unavailable copy when deadline is missing`);
  }
  if (!src.includes("resolveApiUrl")) {
    failures.push(`${PAGE}: deadline fetch must use resolveApiUrl (SAF-F06 companion)`);
  }
  if (!raw.includes("SAF-F32")) {
    failures.push(`${PAGE}: keep SAF-F32 comment anchoring the honesty rule`);
  }
  if (!src.includes("per_unit_deadlines")) {
    failures.push(`${PAGE}: must read per_unit_deadlines from API — company-wide Aug 31 alone is not per-unit honest (SAF-ORPH-04)`);
  }
  if (!src.includes("due on a different date")) {
    failures.push(`${PAGE}: must render per-unit deadline exceptions in the Safety Permits banner (SAF-ORPH-04)`);
  }
  return failures;
}

function selftest() {
  const clean = run();
  if (clean.length) {
    console.error("SELFTEST FAIL already red", clean);
    process.exit(1);
  }
  const abs = path.join(ROOT, PAGE);
  const original = fs.readFileSync(abs, "utf8");
  try {
    fs.writeFileSync(
      abs,
      original.replace(
        "const deadline = deadlineQ.data?.deadline ?? null;",
        'const deadline = deadlineQ.data?.deadline ?? "Aug 31";'
      )
    );
    if (!run().some((f) => f.includes("hardcode"))) {
      console.error("SELFTEST FAIL planted hardcode not caught", run());
      process.exit(1);
    }
    fs.writeFileSync(abs, original);
    fs.writeFileSync(
      abs,
      original.replace(/per_unit_deadlines/g, "deadline_only")
    );
    if (!run().some((f) => f.includes("per_unit_deadlines"))) {
      console.error("SELFTEST FAIL planted missing per_unit_deadlines not caught", run());
      process.exit(1);
    }
  } finally {
    fs.writeFileSync(abs, original);
  }
  console.log("verify-saf-f32-permits-deadline-honesty --selftest OK");
}

if (process.argv.includes("--selftest")) selftest();
else {
  const f = run();
  if (f.length) {
    console.error("FAIL\n  - " + f.join("\n  - "));
    process.exit(1);
  }
  console.log("verify-saf-f32-permits-deadline-honesty OK");
}
