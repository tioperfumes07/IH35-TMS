#!/usr/bin/env node
import fs from "node:fs";

const FILE = "apps/backend/src/safety/driver-documents.routes.ts";
const source = fs.readFileSync(FILE, "utf8");

function failures(candidate) {
  const route = candidate.slice(candidate.indexOf('/api/v1/safety/driver-documents"'));
  const checks = [
    ["upload limiter", /driver-documents"[\s\S]{0,180}rateLimit:\s*\{\s*max:\s*30,\s*timeWindow:\s*"1 minute"/],
    ["real bytes", /const fileBytes = await file\.toBuffer\(\)[\s\S]{0,100}fileBytes\.length === 0[\s\S]{0,80}file_empty/],
    ["company driver", /FROM mdata\.drivers[\s\S]{0,160}operating_company_id = \$1::uuid[\s\S]{0,100}id = \$2::uuid[\s\S]{0,100}deactivated_at IS NULL/],
    ["driver failure", /if \(!driver\.rows\[0\]\?\.id\) return \{ kind: "driver_not_found" as const \}/],
    ["insert identity", /const document = insertRes\.rows\[0\][\s\S]{0,100}if \(!document\?\.id\) throw new Error\("safety_driver_document_insert_failed"\)/],
    ["durable upload", /await putObjectBytes\(r2Key, fileBytes, file\.mimetype \|\| "application\/octet-stream"\)/],
    ["audit identity", /"safety\.driver_document\.uploaded"[\s\S]{0,180}resource_id: document\.id[\s\S]{0,160}driver_id: metadataParse\.data\.driver_id[\s\S]{0,120}r2_key: r2Key/],
    ["proven response", /kind: "ok" as const, document[\s\S]{0,260}send\(payload\.document\)/],
  ];
  return checks.filter(([, pattern]) => !pattern.test(route)).map(([label]) => label);
}

const problems = failures(source);
if (problems.length) {
  console.error(`verify-safety-driver-document-durable FAILED:\n${problems.map((p) => ` - ${p}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ['{ config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },', ""],
    ["const fileBytes = await file.toBuffer();", "const fileBytes = Buffer.alloc(0);"],
    ["            AND deactivated_at IS NULL\n", ""],
    ['if (!driver.rows[0]?.id) return { kind: "driver_not_found" as const };', ""],
    ['if (!document?.id) throw new Error("safety_driver_document_insert_failed");', ""],
    ['await putObjectBytes(r2Key, fileBytes, file.mimetype || "application/octet-stream");', ""],
    ["resource_id: document.id", "resource_id: null"],
    ["send(payload.document)", "send(undefined)"],
  ];
  for (const [from, to] of mutations) {
    const changed = source.replace(from, to);
    if (changed === source || failures(changed).length === 0) {
      console.error(`verify-safety-driver-document-durable selftest mutation escaped: ${from}`);
      process.exit(1);
    }
  }
  console.log(`verify-safety-driver-document-durable --selftest PASS (${mutations.length}/${mutations.length} planted defects red)`);
  process.exit(0);
}

console.log("verify-safety-driver-document-durable PASS — company driver, persisted row, R2 bytes, audit, and response share one identity");
