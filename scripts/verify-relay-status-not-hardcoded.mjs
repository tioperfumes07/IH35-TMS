#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const targets = [
  "apps/frontend/src/components/Topbar.tsx",
  "apps/frontend/src/pages/maintenance/components/IntegrationsStrip.tsx",
];

const directHardcode = /\b(?:const|let|var)\s+relayVis\s*=\s*RELAY_NOT_CONFIGURED\b/;
const missingResolver = /\bresolveRelayVisualStatus\s*\(/;

const failures = [];

for (const rel of targets) {
  const abs = path.join(root, rel);
  const src = fs.readFileSync(abs, "utf8");
  if (directHardcode.test(src)) {
    failures.push(`${rel}: relayVis is assigned directly to RELAY_NOT_CONFIGURED`);
  }
  if (!missingResolver.test(src)) {
    failures.push(`${rel}: Relay badge must derive from resolveRelayVisualStatus(...)`);
  }
}

if (failures.length > 0) {
  console.error("verify-relay-status-not-hardcoded FAILED");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("verify-relay-status-not-hardcoded PASS");
