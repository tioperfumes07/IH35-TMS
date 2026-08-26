#!/usr/bin/env node
/** SAFETY-F6476 — Safety create DatePicker labels target their trigger buttons. */
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url"; import { spawnSync } from "node:child_process";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const EXPECTED={"apps/frontend/src/pages/safety/components/CompanyViolationCreateModal.tsx":"company-violation-reported-date","apps/frontend/src/pages/safety/components/FineCreateModal.tsx":"fine-issued-date"};
function inspect(){const e=[];for(const [rel,id] of Object.entries(EXPECTED)){const s=fs.readFileSync(path.join(ROOT,rel),"utf8");if(!s.includes(`htmlFor="${id}"`))e.push(`${rel}: label missing htmlFor=${id}`);if(!new RegExp(`<DatePicker[\\s\\S]{0,100}id="${id}"`).test(s))e.push(`${rel}: DatePicker missing id=${id}`);}return e;}
function run(){const e=inspect();if(e.length){console.error("verify-safety-create-datepicker-label-association FAIL:");e.forEach(x=>console.error(" -",x));process.exit(1);}console.log("verify-safety-create-datepicker-label-association OK — 2 create labels target DatePicker buttons");}
function selftest(){const rel=Object.keys(EXPECTED)[0],file=path.join(ROOT,rel),original=fs.readFileSync(file,"utf8");try{fs.writeFileSync(file,original.replace('htmlFor="company-violation-reported-date"','data-orphaned="company-violation-reported-date"'));const red=spawnSync(process.execPath,[fileURLToPath(import.meta.url)],{cwd:ROOT});if(red.status===0)throw new Error("orphan escaped");}finally{fs.writeFileSync(file,original);}console.log("verify-safety-create-datepicker-label-association --selftest PASS");}
if(process.argv.includes("--selftest"))selftest();else run();
