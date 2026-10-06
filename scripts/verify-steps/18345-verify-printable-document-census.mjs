#!/usr/bin/env node
/** 18345 (devin band ≡1 mod 4, CLAIMED-REGEN) — printable-document census ratchet. */
import { spawnSync } from "node:child_process";
const r = spawnSync(process.execPath, ["scripts/verify-printable-document-census.mjs"], { stdio: "inherit" });
process.exit(r.status ?? 1);
