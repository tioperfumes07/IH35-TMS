#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fill-batch3-boards";
const SURFACES = [
  ["MultiEntityAccountingPage", "apps/frontend/src/pages/accounting/MultiEntityAccountingPage.tsx",
   ["multi-entity-query-board", "multi-entity-by-company-board", "multi-entity-accounts-board"],
   ["multi-entity-by-company-table", "Run consolidated summary"]],
  ["QboReconcileCapturesPage", "apps/frontend/src/pages/accounting/QboReconcileCapturesPage.tsx",
   ["qbo-recon-health-board", "qbo-recon-captures-board", "qbo-recon-runs-board"],
   ["ParityTable"]],
];
const fails=[];
for (const [id,rel,ids,keep] of SURFACES) {
  const src=fs.readFileSync(path.join(ROOT,rel),"utf8");
  if (!src.includes("components/v3/BoardSection")) fails.push(`${id}: import`);
  for (const tid of ids) if (!src.includes(`testId="${tid}"`)) fails.push(`${id}: ${tid}`);
  for (const k of keep) if (!src.includes(k)) fails.push(`${id}: keep ${k}`);
}
if (fails.length){console.error(LABEL+": FAIL\n  - "+fails.join("\n  - ")); process.exit(1)}
console.log(`${LABEL}: PASS — ${SURFACES.length}`);
