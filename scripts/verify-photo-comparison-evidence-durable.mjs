#!/usr/bin/env node
import fs from "node:fs";
const service = fs.readFileSync("apps/backend/src/safety/photo-comparison/session.service.ts", "utf8");
const routes = fs.readFileSync("apps/backend/src/safety/photo-comparison/routes.ts", "utf8");
function verify(serviceText, routeText) {
  const failures = [];
  const upload = serviceText.slice(serviceText.indexOf("export async function uploadTripPhotoEvidence"), serviceText.indexOf("export async function startPreTripSession"));
  if (!/import \{[^}]*putObjectBytes[^}]*\} from "\.\.\/\.\.\/storage\/r2-client\.js"/.test(serviceText)) failures.push("service must import canonical R2 byte writer");
  if (!/contentType: string/.test(upload)) failures.push("service input must carry content type");
  if (!/await putObjectBytes\(input\.r2ObjectKey, input\.buffer, input\.contentType\)/.test(upload)) failures.push("service must upload exact received bytes");
  if (upload.indexOf("await putObjectBytes") > upload.indexOf("INSERT INTO documents.damage_photo_evidence")) failures.push("R2 upload must complete before durable evidence row");
  if (!/contentType: file\.mimetype \|\| "application\/octet-stream"/.test(routeText)) failures.push("multipart MIME type must reach storage");
  if (!/sha256_hash,[\s\S]*?validation\.sha256/.test(upload)) failures.push("persisted digest must derive from uploaded buffer");
  return failures;
}
const failures = verify(service, routes);
if (failures.length) { console.error(`verify-photo-comparison-evidence-durable: FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  const mutations = [
    [service.replace("putObjectBytes }", "missingPutObjectBytes }"), routes],
    [service.replace("contentType: string", "contentType?: string"), routes],
    [service.replace("await putObjectBytes(input.r2ObjectKey, input.buffer, input.contentType);", ""), routes],
    [service.replace("input.buffer, input.contentType", "Buffer.alloc(0), input.contentType"), routes],
    [service, routes.replace('contentType: file.mimetype || "application/octet-stream"', 'contentType: "application/octet-stream"')],
    [service.replaceAll("validation.sha256", '"unverified"'), routes],
  ];
  const survived = mutations.filter(([s, r]) => verify(s, r).length === 0);
  if (survived.length) { console.error(`verify-photo-comparison-evidence-durable --selftest: FAIL; ${survived.length} mutation(s) survived`); process.exit(1); }
  console.log("verify-photo-comparison-evidence-durable --selftest: PASS (6/6 mutations red)");
} else console.log("verify-photo-comparison-evidence-durable: PASS — exact multipart bytes reach R2 before evidence identity is persisted");
