#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/frontend/src/components/dispatch/LoadBolPanel.tsx";
const source = fs.readFileSync(file, "utf8");

function verify(text) {
  return [
    ["shared API-origin resolver imported", /import \{ resolveApiUrl \} from "\.\.\/\.\.\/api\/client"/.test(text)],
    ["direct BOL link resolves API origin", /href=\{resolveApiUrl\(`\/api\/v1\/dispatch\/loads\/\$\{encodeURIComponent\(loadId\)\}\/bol\.pdf\?operating_company_id=\$\{encodeURIComponent\(companyId\)\}`\)\}/.test(text)],
    ["relative frontend-origin BOL href retired", !/href=\{`\/api\/v1\/dispatch\/loads\//.test(text)],
  ];
}

if (process.argv.includes("--selftest")) {
  const mutation = source.replace("href={resolveApiUrl(", "href={(");
  const failed = verify(mutation).filter(([, ok]) => !ok).map(([name]) => name);
  if (!failed.includes("direct BOL link resolves API origin")) {
    console.error("verify-load-bol-download-api-origin --selftest: FAIL — planted resolver removal survived");
    process.exit(1);
  }
  console.log("verify-load-bol-download-api-origin --selftest: PASS — planted resolver removal rejected");
  process.exit(0);
}

const checks = verify(source);
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
if (checks.some(([, ok]) => !ok)) process.exit(1);
console.log(`PASS: ${checks.length}/${checks.length} BOL download API-origin checks`);
