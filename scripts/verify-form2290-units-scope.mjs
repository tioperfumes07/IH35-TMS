#!/usr/bin/env node
// Guard: the Form 2290 tractor query must NOT reference operating_company_id on mdata.units
// (that column does not exist → 42703 → 500). Units are scoped by owner/lease only.
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const f = "apps/backend/src/compliance/form-2290.routes.ts";
const s = (()=>{try{return fs.readFileSync(path.join(ROOT,f),"utf8")}catch{return""}})();
const errs=[];
if(!s) errs.push(`${f} not found`);
else {
  const m = s.match(/FROM mdata\.units[\s\S]{0,400}?ORDER BY/);
  if (m && /operating_company_id/.test(m[0])) errs.push("Form 2290 mdata.units query references operating_company_id (phantom → 500). Use owner_company_id / currently_leased_to_company_id.");
}
if(errs.length){console.error("[verify-form2290-units-scope] FAILED");for(const e of errs)console.error("  ✗ "+e);process.exit(1);}
console.log("[verify-form2290-units-scope] OK");
