#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const LABEL="verify-legal-matter-driver-entity-picker"; const FILE="apps/frontend/src/pages/legal/matters/LegalMatterFormFields.tsx";
function readRel(root,rel){const p=path.join(root,rel);return fs.existsSync(p)?fs.readFileSync(p,"utf8"):null;}
export function collectProblems(root=ROOT){
  const problems=[]; const src=readRel(root,FILE); if(!src) return [`missing ${FILE}`];
  const code=src.replace(/\/\*[\s\S]*?\*\//g,"").replace(/\/\/.*$/gm,"");
  if(!/kind=["']driver["']/.test(code)) problems.push("need kind=driver");
  if(/DriverPickerWithCreate/.test(code)) problems.push("no PWC");
  return problems;
}
if(process.argv.includes("--selftest")){
  if(collectProblems().length) process.exit(1);
  const stubRoot=fs.mkdtempSync(path.join(ROOT,".tmp-legal-matter-driver-entity-picker-"));
  try{fs.mkdirSync(path.join(stubRoot,path.dirname(FILE)),{recursive:true});
    fs.writeFileSync(path.join(stubRoot,FILE),"<DriverPickerWithCreate />");
    if(!collectProblems(stubRoot).length) process.exit(1);
  } finally{fs.rmSync(stubRoot,{recursive:true,force:true});}
  console.log(LABEL,"SELFTEST OK");
} else { const p=collectProblems(); if(p.length){console.error(p);process.exit(1);} console.log(LABEL,"OK"); }
