#!/usr/bin/env node
import { execSync } from "node:child_process";
const script = new URL("../verify-invoice-qbo-origin-guard.mjs", import.meta.url).pathname;
execSync(`node ${script}`, { stdio: "inherit" });
