#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const verifyArchDesignPath = path.resolve("scripts/verify-architectural-design.ts");
const source = fs.readFileSync(verifyArchDesignPath, "utf8");
const match = source.match(/const EXTRA_GUARDS = \[([\s\S]*?)\] as const;/);

if (!match) {
  console.error("verify-guards meta guard: could not locate EXTRA_GUARDS array literal.");
  process.exit(1);
}

const literalBody = match[1].trim();
if (literalBody.length > 0) {
  console.error("verify-guards meta guard: EXTRA_GUARDS must remain an empty literal [].");
  process.exit(1);
}
