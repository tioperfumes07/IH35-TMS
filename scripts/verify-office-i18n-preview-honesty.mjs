#!/usr/bin/env node
import fs from "node:fs";

const switcher = fs.readFileSync("apps/frontend/src/i18n/locale-switcher.tsx", "utf8");
const spanish = JSON.parse(fs.readFileSync("apps/frontend/src/i18n/locales/es.json", "utf8"));

if (spanish.meta?.machine_translated !== true || !String(spanish.meta?.review_status).includes("needs-jorge-review")) {
  throw new Error("office i18n guard expects the catalog's machine-translation review metadata");
}
for (const token of ["(preview)", "machine-translated preview pending review", "driver-app Spanish is separately reviewed"]) {
  if (!switcher.includes(token)) throw new Error(`office i18n preview guard: missing honest UI token ${token}`);
}

console.log("verify-office-i18n-preview-honesty: PASS");
