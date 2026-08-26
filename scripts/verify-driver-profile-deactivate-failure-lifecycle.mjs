#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/frontend/src/pages/DriverDetail.tsx";
const live = fs.readFileSync(file, "utf8");

function failures(source) {
  const problems = [];
  if (!/<ConfirmModal[\s\S]*?title="Deactivate driver"/.test(source)) problems.push("driver deactivation confirmation missing");
  const handler = source.match(/title="Deactivate driver"[\s\S]{0,650}?onConfirm=\{async \(\) => \{[\s\S]{0,350}?\n\s*\}\}/)?.[0] ?? "";
  if (!/await deactivateMutation\.mutateAsync\(\)/.test(handler)) problems.push("confirmation does not await canonical driver deactivation");
  if (/\.catch\s*\(/.test(handler)) problems.push("driver deactivation rejection is swallowed, closing ConfirmModal after failed write");
  return problems;
}

if (process.argv.includes("--selftest")) {
  const mutated = live.replace("await deactivateMutation.mutateAsync();", "await deactivateMutation.mutateAsync().catch(() => undefined);");
  if (failures(mutated).length === 0) {
    console.error("verify-driver-profile-deactivate-failure-lifecycle SELFTEST FAILED — swallowed rejection escaped");
    process.exit(1);
  }
  console.log("verify-driver-profile-deactivate-failure-lifecycle SELFTEST PASS — 1/1 swallowed-rejection mutation rejected");
  process.exit(0);
}

const problems = failures(live);
if (problems.length) {
  console.error(`verify-driver-profile-deactivate-failure-lifecycle FAILED:\n - ${problems.join("\n - ")}`);
  process.exit(1);
}
console.log("verify-driver-profile-deactivate-failure-lifecycle PASS — failed driver deactivation remains open and retryable");
