#!/usr/bin/env node
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGETS=["apps/frontend/src/pages/maintenance/__tests__/WarrantyClaimsPage.test.tsx","apps/frontend/src/components/drivers/DriverPickerWithCreate.test.tsx"];
function stripComments(s){return s.replace(/\/\*[\s\S]*?\*\//g,"").replace(/(^|[^:])\/\/[^\n]*/g,"$1");}
if(process.argv.includes("--selftest")){console.log("SELFTEST OK");process.exit(0);}
const bad=[];for(const rel of TARGETS){const raw=fs.readFileSync(path.join(ROOT,rel),"utf8");const s=stripComments(raw);if(/listDrivers|listUnits/.test(s)&&/(Combobox|allowAddNew)/.test(s)&&!/vi\.mock\([^)]*EntityPicker/.test(s))bad.push(rel);}if(bad.length){console.error("FAIL",bad);process.exit(1);}console.log("OK");