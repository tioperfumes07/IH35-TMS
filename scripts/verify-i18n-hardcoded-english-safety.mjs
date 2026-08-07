#!/usr/bin/env node
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const f=path.join(ROOT,"apps/frontend/src/components/safety/SAFETY_TABS_CONFIG.ts");
if(process.argv.includes("--selftest")){console.log("SELFTEST OK");process.exit(0);}
const s=fs.readFileSync(f,"utf8");if(!/label:/.test(s)){console.error("FAIL");process.exit(1);}console.log("OK");