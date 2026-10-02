#!/usr/bin/env node
/**
 * CC-3 queue 2b (2026-10-02): the full-enum table MDATA_STATUS_TRANSITIONS (PATCH /mdata/loads/:id/status, the billing
 * lifecycle) and the canonical dispatch machine (PATCH /dispatch/loads/:id/transition, GPS auto-delivery) live in one
 * module and must agree on every cross-bucket edge. They had drifted 14 edges apart. Same-bucket granular steps and the
 * billing tail (invoiced / paid / closed) are the table's own. Static (runs the module through tsx), < 3 s.
 */
import { execFileSync } from "node:child_process";
const out = JSON.parse(execFileSync("npx", ["tsx", "scripts/lib/load-status-machines-diff.ts"], { encoding: "utf8" }));
if (out.length) { console.error(`verify-load-status-machines-agree: FAIL — ${out.length} disagreement(s):\n  ` + out.join("\n  ")); process.exit(1); }
console.log("verify-load-status-machines-agree: OK — MDATA_STATUS_TRANSITIONS agrees with the canonical dispatch machine on every cross-bucket edge");
