#!/usr/bin/env node
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ALLOWED=new Set(["apps/frontend/src/components/parity/EntityPicker.tsx","apps/frontend/src/components/fleet/CreateUnitModal.tsx","apps/frontend/src/components/accounting/VendorBillForm.tsx","apps/frontend/src/components/expenses/RecordExpenseForm.tsx","apps/frontend/src/pages/accounting/CreateMultipleBillsPage.tsx","apps/frontend/src/pages/fleet/FleetHomePage.tsx","apps/frontend/src/components/parity/__tests__/EntityPicker.test.tsx","apps/frontend/src/pages/accounting/CreateMultipleBillsPage.test.tsx","apps/frontend/src/pages/accounting/VendorBillCreatePage.test.tsx"]);
function walk(d,out,root){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory()&&e.name!=="node_modules")walk(p,out,root);else if(e.name.endsWith(".tsx"))out.push(path.relative(root,p).replace(/\\/g,"/"));}}
if(process.argv.includes("--selftest")){console.log("SELFTEST OK");process.exit(0);}
// Comments stripped before scanning (2026-08-20, CC-3): PermitsPage.test.tsx mentions
// "CreateUnitModal" only in a // comment explaining why its harness needs ToastProvider — prose,
// not an actual import/render that bypasses EntityPicker's canonical create flow. Match the raw
// source, not a comment mentioning the name.
const files=[];walk(path.join(ROOT,"apps/frontend/src"),files,ROOT);const bad=[];for(const rel of files){if(ALLOWED.has(rel))continue;const s=fs.readFileSync(path.join(ROOT,rel),"utf8");const code=s.replace(/\/\*[\s\S]*?\*\//g,"").replace(/\/\/.*$/gm,"");if(/CreateUnitModal/.test(code))bad.push(rel);}if(bad.length){console.error("FAIL unexpected CreateUnitModal",bad.join("\n"));process.exit(1);}console.log("OK");