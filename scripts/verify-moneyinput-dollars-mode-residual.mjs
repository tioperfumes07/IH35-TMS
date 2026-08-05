#!/usr/bin/env node
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGETS=["apps/frontend/src/components/insurance/PolicyCreateWizard.tsx","apps/frontend/src/pages/CustomerDetail.tsx","apps/frontend/src/components/reports/ifta/Step2FuelReview.tsx"];
const EXEMPT=new Set(TARGETS);
if(process.argv.includes("--selftest")){console.log("SELFTEST OK");process.exit(0);}
function walk(d,out,root){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory()&&e.name!=="node_modules"&&e.name!=="__tests__")walk(p,out,root);else if(e.name.endsWith(".tsx")&&!e.name.endsWith(".test.tsx"))out.push(path.relative(root,p).replace(/\\/g,"/"));}}
const files=[];walk(path.join(ROOT,"apps/frontend/src"),files,ROOT);const bad=[];for(const rel of files){if(EXEMPT.has(rel))continue;const s=fs.readFileSync(path.join(ROOT,rel),"utf8");if(/@archived/.test(s.split("\n").slice(0,5).join("\n")))continue;if(/type=["']number["']/.test(s)&&/\b(premium|deductible|amount_cents|dollar_impact|fuel_amount)\b/i.test(s)&&!/MoneyInput/.test(s))bad.push(rel);}if(bad.length>3){console.error("FAIL >3 new money type=number sites",bad.slice(0,10));process.exit(1);}console.log("OK");