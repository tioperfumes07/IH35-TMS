#!/usr/bin/env node
/**
 * work_order column remainder — Built WorkOrderDetailPage EntityLink.
 * @matrix-built {"modules":["maintenance"],"cols":["work_order"],"leafRe":"^maintenance\\.modal\\.work_order_detail$","task":"VERTICAL-WORK-ORDER-col-remainder","vertical":"column-wave"}
 * @matrix-built {"modules":["inventory"],"cols":["inventory"],"leafRe":"^parts\\.roster$","task":"VERTICAL-INVENTORY-col-remainder","vertical":"column-wave"}
 * Self-test: node scripts/verify-work-order-col-remainder.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-work-order-col-remainder";
const CHECKS = [
  { name: "WorkOrderDetailPage", file: "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx", re: /EntityLink/ },
  { name: "InventoryPartsStockPage", file: "apps/frontend/src/pages/inventory/InventoryPartsStockPage.tsx", re: /EntityLink/ },
];
function run(root=ROOT){
  const fails=[];
  for (const c of CHECKS){
    const abs=path.join(root,c.file);
    if(!fs.existsSync(abs)){fails.push(`${c.name}: missing`);continue;}
    if(!c.re.test(fs.readFileSync(abs,"utf8"))) fails.push(`${c.name}: no EntityLink`);
  }
  return fails;
}
if (process.argv.includes("--selftest")) {
  const live=run();
  const tmp=fs.mkdtempSync(path.join(ROOT,"scripts",".wo-col-selftest-"));
  try{
    for (const c of CHECKS){const abs=path.join(tmp,c.file);fs.mkdirSync(path.dirname(abs),{recursive:true});fs.writeFileSync(abs,"// poison\n");}
    const planted=run(tmp);
    if(planted.length<CHECKS.length){console.error(`${LABEL} SELFTEST FAIL`);process.exit(1);}
    console.log(`${LABEL} SELFTEST PASS`);
  } finally { fs.rmSync(tmp,{recursive:true,force:true}); }
  if(live.length){console.error(`${LABEL} FAIL live`);process.exit(1);}
  process.exit(0);
}
const fails=run();
if(fails.length){console.error(`${LABEL} FAIL`,fails);process.exit(1);}
console.log(`${LABEL} PASS`);
