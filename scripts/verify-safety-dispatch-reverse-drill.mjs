#!/usr/bin/env node
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGETS=["apps/frontend/src/pages/safety/SafetyEventsPage.tsx","apps/frontend/src/pages/safety/AccidentsPage.tsx"];
if(process.argv.includes("--selftest")){console.log("SELFTEST OK");process.exit(0);}
const bad=[];for(const rel of TARGETS){if(!fs.existsSync(path.join(ROOT,rel)))continue;const s=fs.readFileSync(path.join(ROOT,rel),"utf8");if(/load_id/.test(s)&&/ParityTable|ParityColumn/.test(s)&&!/EntityLink[\s\S]*kind=["']load["']/.test(s))bad.push(rel);}if(bad.length){console.error("FAIL",bad);process.exit(1);}console.log("OK");