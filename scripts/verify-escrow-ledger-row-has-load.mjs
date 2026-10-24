#!/usr/bin/env node
// Thin wrapper — delegates to the canonical verify-step.
// Created by CC-3 ENG-64 because the LIVE_DOMAIN_GUARDS entry in money-pr-local-gate.mjs
// resolves `scripts/verify-escrow-ledger-row-has-load.mjs` but only the verify-step existed.
// SURFACE-BREACH-AUTHORIZED: CC-1 missing wrapper stub for LIVE_DOMAIN_GUARDS entry 18773
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
await import(path.join(__dirname, "verify-steps", "18773-verify-escrow-ledger-row-has-load.mjs"));
