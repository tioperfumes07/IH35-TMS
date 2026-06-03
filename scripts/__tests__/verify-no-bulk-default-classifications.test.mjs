import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const script = path.join(ROOT, "scripts/verify-no-bulk-default-classifications.mjs");

const output = execFileSync("node", [script], { encoding: "utf8" });
assert.match(output, /verify:no-bulk-default-classifications PASS/);
