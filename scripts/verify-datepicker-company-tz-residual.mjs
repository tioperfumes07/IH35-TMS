#!/usr/bin/env node
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGETS=["apps/backend/src/accounting/cash-forecast.routes.ts"];
if(process.argv.includes("--selftest")){console.log("SELFTEST OK");process.exit(0);}
const bad=[];for(const rel of TARGETS){const s=fs.readFileSync(path.join(ROOT,rel),"utf8");if(/as_of_date\s*\?\?\s*new Date\(\)\.toISOString/.test(s))bad.push(rel);}if(bad.length){console.error("FAIL",bad);process.exit(1);}console.log("OK");