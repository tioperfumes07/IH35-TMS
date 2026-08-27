#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/backend/src/safety/dvir-submit.service.ts";
const LABEL = "verify-dvir-submit-audit-company-scope";

function auditBlock(source, event) {
  const eventIndex = source.indexOf(`"${event}"`);
  if (eventIndex < 0) return "";
  const start = source.lastIndexOf("appendCrudAudit(", eventIndex);
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "(") depth += 1;
    if (source[index] === ")") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return "";
}

export function verify(source) {
  const failures = [];
  for (const event of ["safety.dvir.spawn_wo", "safety.dvir.unit_dispatch_blocked", "safety.dvir_submitted"]) {
    const block = auditBlock(source, event);
    if (!block) failures.push(`${event} audit is missing`);
    else if (!/operating_company_id:\s*load\.operating_company_id/.test(block)) {
      failures.push(`${event} audit must carry the canonical load company`);
    }
  }
  return failures;
}

const source = fs.readFileSync(path.join(ROOT, FILE), "utf8");
if (process.argv.includes("--selftest")) {
  const events = ["safety.dvir.spawn_wo", "safety.dvir.unit_dispatch_blocked", "safety.dvir_submitted"];
  const caught = events.filter((event) => {
    const block = auditBlock(source, event);
    const broken = source.replace(block, block.replace(/\n\s*operating_company_id:\s*load\.operating_company_id,/, ""));
    return verify(broken).some((failure) => failure.includes(event));
  });
  if (caught.length !== events.length) {
    console.error(`${LABEL} --selftest FAIL — caught ${caught.length}/${events.length} planted defects`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS — ${caught.length}/${events.length} planted defects detected`);
  process.exit(0);
}

const failures = verify(source);
if (failures.length) {
  console.error(`${LABEL} FAIL\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — DVIR submit, dispatch block, and spawned WO audits carry canonical company scope`);
