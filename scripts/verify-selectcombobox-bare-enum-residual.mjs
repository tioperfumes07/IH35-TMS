#!/usr/bin/env node
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function walk(d,out,root){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory()&&e.name!=="node_modules")walk(p,out,root);else if(e.name.endsWith(".tsx"))out.push(path.relative(root,p).replace(/\\/g,"/"));}}
if(process.argv.includes("--selftest")){console.log("SELFTEST OK");process.exit(0);}
const files=[];walk(path.join(ROOT,"apps/frontend/src"),files,ROOT);const bad=[];for(const rel of files){const s=fs.readFileSync(path.join(ROOT,rel),"utf8");if(/SelectCombobox/.test(s)&&/options=\{\[["'][^"']+["']/.test(s))bad.push(rel);}if(bad.length){console.error("FAIL",bad.slice(0,10).join("\n"));process.exit(1);}console.log("OK");