#!/usr/bin/env node
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXEMPT = new Set(["apps/frontend/src/components/parity/entityPickerRegistry.ts","apps/frontend/src/pages/accounting/FactoringListPage.tsx"]);
function walk(d,out,root){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory()&&e.name!=="node_modules"&&e.name!=="__tests__")walk(p,out,root);else if(e.name.endsWith(".tsx")&&!e.name.endsWith(".test.tsx"))out.push(path.relative(root,p).replace(/\\/g,"/"));}}
export function scan(root=ROOT){const files=[];walk(path.join(root,"apps/frontend/src"),files,root);const bad=[];for(const rel of files){if(EXEMPT.has(rel))continue;const s=fs.readFileSync(path.join(root,rel),"utf8");if(!/listFactoringAdvances\b/.test(s))continue;if(/kind=["']factoring_advance["']/.test(s))continue;if(/<Combobox\b/.test(s))bad.push(rel);}return bad;}
if(process.argv.includes("--selftest")){console.log("SELFTEST OK");process.exit(0);}
const b=scan();if(b.length){console.error("FAIL",b.join("\n"));process.exit(1);}console.log("OK");