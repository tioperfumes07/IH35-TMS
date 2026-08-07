#!/usr/bin/env node
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGETS=["apps/frontend/src/components/home/DispatcherActiveLoadsPanel.tsx"];
export function collect(root=ROOT){const p=[];for(const rel of TARGETS){const s=fs.readFileSync(path.join(root,rel),"utf8");if(/unit_id/.test(s)&&!/EntityLink[\s\S]*kind=["']unit["']/.test(s))p.push(rel);}return p;}
if(process.argv.includes("--selftest")){console.log("SELFTEST OK");process.exit(0);}
const f=collect();if(f.length){console.error("FAIL",f.join("\n"));process.exit(1);}console.log("OK");