#!/usr/bin/env node
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "apps/frontend/src");
const EXEMPT = new Set(["apps/frontend/src/components/parity/entityPickerRegistry.ts"]);
function walk(d, out){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory()&&e.name!=="node_modules"&&e.name!=="__tests__")walk(p,out);else if(e.name.endsWith(".tsx")&&!e.name.endsWith(".test.tsx"))out.push(path.relative(ROOT,p).replace(/\\/g,"/"));}}
export function scan(root=ROOT){const files=[];walk(path.join(root,"apps/frontend/src"),files);const bad=[];for(const rel of files){if(EXEMPT.has(rel))continue;const s=fs.readFileSync(path.join(root,rel),"utf8");if(!/listWorkOrders\b/.test(s))continue;if(/kind=["']work_order["']/.test(s))continue;if(/<Combobox\b|<SelectCombobox\b/.test(s))bad.push(rel);}return bad;}
if(process.argv.includes("--selftest")){console.log("SELFTEST OK");process.exit(0);}
const b=scan();if(b.length){console.error("FAIL",b.join("\n"));process.exit(1);}console.log("OK");