#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = path.join(ROOT, "apps/backend/src/safety/incidents.routes.ts");
const source = fs.readFileSync(FILE, "utf8");

function failuresFor(text) {
  const route = text.match(/app\.post\("\/api\/v1\/safety\/incidents\/:id\/photos"[\s\S]*?\n  \}\);/)?.[0] ?? "";
  const checks = [
    ["fails closed without R2", /if \(!isR2Configured\(\)\)[\s\S]{0,100}503[\s\S]{0,100}r2_not_configured/.test(route)],
    ["consumes uploaded bytes", /for await \(const chunk of file\.file\)[\s\S]{0,120}Buffer\.concat/.test(route)],
    ["uses collision-proof company incident key", /safety\/incidents\/\$\{query\.data\.operating_company_id\}\/\$\{params\.data\.id\}\/\$\{randomUUID\(\)\}/.test(route)],
    ["persists key before storing bytes", /photo_keys = array_append\(photo_keys, \$3\)[\s\S]{0,650}putObjectBytes\(photoKey, buffer/.test(route)],
    ["keeps active cap", /voided_at IS NULL[\s\S]{0,100}cardinality\(photo_keys\) < 10/.test(route)],
    ["audits only after storage", /putObjectBytes\(photoKey, buffer[\s\S]{0,220}appendCrudAudit/.test(route)],
    ["returns created only after durable result", /if \(!result\)[\s\S]{0,100}404[\s\S]{0,200}reply\.code\(201\)\.send\(result\)/.test(route)],
  ];
  return checks.filter(([, ok]) => !ok).map(([name]) => name);
}

const failures = failuresFor(source);
if (failures.length) {
  console.error(`FAIL verify-safety-incident-photo-durable: ${failures.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("if (!isR2Configured())", "if (false)"),
    source.replace("for await (const chunk of file.file)", "for await (const chunk of [])"),
    source.replace("${randomUUID()}-${safeFilename}", "${safeFilename}"),
    source.replace("photo_keys = array_append(photo_keys, $3)", "photo_keys = photo_keys"),
    source.replace("await putObjectBytes(photoKey, buffer", "await Promise.resolve(buffer"),
    source.replace("AND cardinality(photo_keys) < 10", "AND true"),
    source.replace("return reply.code(201).send(result);", "return result;"),
  ];
  const caught = mutations.filter((mutation) => failuresFor(mutation).length > 0).length;
  if (caught !== mutations.length) {
    console.error(`SELFTEST FAIL verify-safety-incident-photo-durable: caught ${caught}/${mutations.length}`);
    process.exit(1);
  }
  console.log(`SELFTEST PASS verify-safety-incident-photo-durable: caught ${caught}/${mutations.length}`);
  process.exit(0);
}

console.log("PASS verify-safety-incident-photo-durable: incident photo bytes and canonical keys persist together or fail loudly.");
