#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const script = path.join(root, "scripts/verify-bill-payment-overpay-creates-vendor-credit.mjs");
const args = process.argv.slice(2);
const res = spawnSync(process.execPath, [script, ...args], { cwd: root, stdio: "inherit", env: process.env });
process.exit(res.status ?? 1);
