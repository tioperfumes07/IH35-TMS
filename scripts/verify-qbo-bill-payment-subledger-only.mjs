#!/usr/bin/env node
/** R443.117 supersedes parallel-books refusal. Keep this registered entry point executable. */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Both builder and writer contracts must pass; propagate every child failure.
for (const guard of ["verify-native-document-gl-independent-of-qbo.mjs", "verify-qbo-origin-bill-payment-writers-post-native-gl.mjs"]) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(guard, import.meta.url)), ...process.argv.slice(2)], { stdio: "inherit" });
  if (result.error || result.signal || result.status !== 0) process.exit(result.status || 1);
}
