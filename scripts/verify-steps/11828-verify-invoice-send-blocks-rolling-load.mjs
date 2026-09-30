#!/usr/bin/env node
// verify-step 11828 -- wrapper. See scripts/verify-invoice-send-blocks-rolling-load.mjs.
// The WRITE half of FACTOR-BUT-NOT-DELIVERED: an invoice may be issued and factored on a load that
// has not delivered ONLY with the customer's approval recorded in
// dispatch.manual_delivery_authorizations. Static, no DATABASE_URL -- safe on the local path.
import { fileURLToPath } from "node:url";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
execFileSync("node", [path.join(ROOT, "scripts/verify-invoice-send-blocks-rolling-load.mjs")], { stdio: "inherit" });
