#!/usr/bin/env node
import fs from "node:fs";

const source = fs.readFileSync("apps/frontend/src/pages/admin/AdminPage.tsx", "utf8");
for (const label of ["API Keys", "Webhooks"]) {
  const row = source.split("\n").find((line) => line.includes(`label: \"${label}\"`));
  if (!row || !row.includes("disabled: true") || !row.includes("Unavailable")) {
    throw new Error(`${label} must be rendered as an honestly unavailable disabled tile`);
  }
}
if (!source.includes("disabled={tile.disabled}") || !source.includes("aria-disabled={tile.disabled}")) {
  throw new Error("Admin tile renderer must enforce disabled semantics");
}
console.log("verify-admin-api-webhooks-honest-disabled: PASS");
