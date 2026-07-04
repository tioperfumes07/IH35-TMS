#!/usr/bin/env node
import fs from "node:fs";import path from "node:path";import { fileURLToPath } from "node:url";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const f="apps/backend/src/accounting/cash-forecast.routes.ts";
const s=(()=>{try{return fs.readFileSync(path.join(ROOT,f),"utf8")}catch{return""}})();const errs=[];
if(!s)errs.push(f+" not found");else{if(/as_of_date\s*\?\?\s*new Date\(\)\.toISOString/.test(s))errs.push("as_of default uses UTC toISOString — use companyBusinessDate()");if(!/companyBusinessDate\s*\(/.test(s))errs.push("must use companyBusinessDate()");}
if(errs.length){console.error("[verify-cash-forecast-company-tz] FAILED");for(const e of errs)console.error("  ✗ "+e);process.exit(1);}
console.log("[verify-cash-forecast-company-tz] OK");
