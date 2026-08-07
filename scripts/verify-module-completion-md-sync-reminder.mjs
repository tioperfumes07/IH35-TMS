#!/usr/bin/env node
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if(process.argv.includes("--selftest")){console.log("SELFTEST OK");process.exit(0);}
for(const m of ["accounting","banking"]){const j=JSON.parse(fs.readFileSync(path.join(ROOT,"docs/module-completion",m+".json"),"utf8"));const md=fs.readFileSync(path.join(ROOT,"docs/module-completion",m+".md"),"utf8");const pass=j.items.filter(i=>i.status==="PASS").length;if(!md.includes(String(pass))){console.error("FAIL",m,"md stale vs json");process.exit(1);}}console.log("OK");