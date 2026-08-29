#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/frontend/src/components/dispatch/LoadBolPanel.tsx";
let source = fs.readFileSync(file, "utf8");
if (process.argv.includes("--selftest")) source = source.replace("href={resolveApiUrl(", "href={(");

const checks = [
  ["shared API-origin resolver imported", /import \{ resolveApiUrl \} from "\.\.\/\.\.\/api\/client"/.test(source)],
  ["direct BOL link resolves API origin", /href=\{resolveApiUrl\(`\/api\/v1\/dispatch\/loads\/\$\{encodeURIComponent\(loadId\)\}\/bol\.pdf\?operating_company_id=\$\{encodeURIComponent\(companyId\)\}`\)\}/.test(source)],
  ["relative frontend-origin BOL href retired", !/href=\{`\/api\/v1\/dispatch\/loads\//.test(source)],
];
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
if (checks.some(([, ok]) => !ok)) process.exit(1);
console.log(`PASS: ${checks.length}/${checks.length} BOL download API-origin checks`);
