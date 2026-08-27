#!/usr/bin/env node
import fs from "node:fs";
const service = fs.readFileSync("apps/backend/src/safety/damage-reports/photo-evidence.service.ts", "utf8");
const routes = fs.readFileSync("apps/backend/src/safety/damage-reports/photo-evidence.routes.ts", "utf8");
function verify(s, r) {
  const failures = [];
  if (!/putObjectBytes/.test(s) || !/await putObjectBytes\(input\.r2ObjectKey, input\.buffer, input\.contentType\)/.test(s)) failures.push("exact bytes must reach canonical R2");
  if (!/contentType: string/.test(s) || !/contentType: file\.mimetype \|\| "application\/octet-stream"/.test(r)) failures.push("multipart content type must reach storage");
  if (s.indexOf("await putObjectBytes") > s.indexOf("INSERT INTO documents.damage_photo_evidence")) failures.push("R2 upload must precede evidence identity");
  if (!/array_append\(COALESCE\(evidence_uuids, ARRAY\[\]::uuid\[\]\), \$3::uuid\)/.test(s)) failures.push("incident backlink must handle empty array");
  if (!/NOT \(\$3::uuid = ANY\(COALESCE\(evidence_uuids, ARRAY\[\]::uuid\[\]\)\)\)/.test(s)) failures.push("incident backlink must reject duplicate append");
  if (!/RETURNING id::text[\s\S]*?if \(!linked\.rows\[0\]\?\.id\) throw new Error\("damage_evidence_backlink_failed"\)/.test(s)) failures.push("incident backlink must be required");
  if (!/rateLimit: \{ max: 30, timeWindow: "1 minute" \}/.test(r)) failures.push("upload must be rate limited");
  return failures;
}
const failures = verify(service, routes);
if (failures.length) { console.error(`verify-damage-photo-evidence-durable: FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  const mutations = [
    [service.replace("await putObjectBytes(input.r2ObjectKey, input.buffer, input.contentType);", ""), routes],
    [service.replace("input.buffer, input.contentType", "Buffer.alloc(0), input.contentType"), routes],
    [service, routes.replace('contentType: file.mimetype || "application/octet-stream"', 'contentType: "application/octet-stream"')],
    [service.replace("array_append(COALESCE(evidence_uuids, ARRAY[]::uuid[]), $3::uuid)", "array_append(evidence_uuids, $3::uuid)"), routes],
    [service.replace("AND NOT ($3::uuid = ANY(COALESCE(evidence_uuids, ARRAY[]::uuid[])))", "AND true"), routes],
    [service.replace("if (!linked.rows[0]?.id)", "if (false)"), routes],
    [service, routes.replace('max: 30, timeWindow: "1 minute"', 'max: 0, timeWindow: "1 minute"')],
  ];
  const survived = mutations.filter(([s, r]) => verify(s, r).length === 0);
  if (survived.length) { console.error(`verify-damage-photo-evidence-durable --selftest: FAIL; ${survived.length} mutation(s) survived`); process.exit(1); }
  console.log("verify-damage-photo-evidence-durable --selftest: PASS (7/7 mutations red)");
} else console.log("verify-damage-photo-evidence-durable: PASS — exact bytes persist and incident backlink is required/idempotent");
