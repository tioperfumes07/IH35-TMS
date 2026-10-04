#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/frontend/src/components/dispatch/LoadBolPanel.tsx";
const source = fs.readFileSync(file, "utf8");

function leftoverRefuse(text) {
  const hits = [];
  if (text.includes("text-[11px]")) hits.push("LoadBolPanel.tsx: leftover text-[11px]");
  if (text.includes("#8A92AB") || text.includes("#334155")) {
    hits.push("LoadBolPanel.tsx: leftover off-scale muted");
  }
  return hits;
}

function verify(text) {
  return [
    ["shared API-origin resolver imported", /import \{ resolveApiUrl \} from "\.\.\/\.\.\/api\/client"/.test(text)],
    ["direct BOL link resolves API origin", /href=\{resolveApiUrl\(`\/api\/v1\/dispatch\/loads\/\$\{encodeURIComponent\(loadId\)\}\/bol\.pdf\?operating_company_id=\$\{encodeURIComponent\(companyId\)\}`\)\}/.test(text)],
    ["relative frontend-origin BOL href retired", !/href=\{`\/api\/v1\/dispatch\/loads\//.test(text)],
    ["no leftover text-[11px]", !leftoverRefuse(text).some((h) => h.includes("text-[11px]"))],
    ["no leftover off-scale muted", !leftoverRefuse(text).some((h) => h.includes("off-scale muted"))],
  ];
}

if (process.argv.includes("--selftest")) {
  const liveLeftover = leftoverRefuse(source);
  if (liveLeftover.length) {
    console.error("verify-load-bol-download-api-origin --selftest: FAIL — live leftover tokens present");
    for (const e of liveLeftover) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  const leftoverPlant = `${source}\n<div className="text-[11px] text-[#8A92AB]" style={{ color: "#334155" }}>plant</div>`;
  const leftoverHits = leftoverRefuse(leftoverPlant);
  if (
    !leftoverHits.some((e) => e.includes("leftover text-[11px]")) ||
    !leftoverHits.some((e) => e.includes("leftover off-scale muted"))
  ) {
    console.error("verify-load-bol-download-api-origin --selftest: FAIL leftover plant escaped", leftoverHits);
    process.exit(1);
  }
  const mutation = source.replace("href={resolveApiUrl(", "href={(");
  const failed = verify(mutation).filter(([, ok]) => !ok).map(([name]) => name);
  if (!failed.includes("direct BOL link resolves API origin")) {
    console.error("verify-load-bol-download-api-origin --selftest: FAIL — planted resolver removal survived");
    process.exit(1);
  }
  console.log("verify-load-bol-download-api-origin --selftest: PASS — leftover plant + resolver removal rejected");
  process.exit(0);
}

const checks = verify(source);
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
if (checks.some(([, ok]) => !ok)) process.exit(1);
console.log(`PASS: ${checks.length}/${checks.length} BOL download API-origin checks`);
