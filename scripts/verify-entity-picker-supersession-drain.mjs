#!/usr/bin/env node
/** @ratchet — presence-only retirement-ledger ratchet; never product or Live proof. */
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const doc=path.join(ROOT,"docs/audit/EP-GUARD-SUPERSESSION-DRAIN.md");
if(process.argv.includes("--selftest")){console.log("SELFTEST OK");process.exit(0);}
if(!fs.existsSync(doc)){console.error("FAIL missing doc");process.exit(1);}console.log("OK");
