import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export default {
  script: "scripts/verify-guards/verify-routes-manifest.mjs",
  label: "verify-routes-manifest",
};

function run() {
  const appPath = path.resolve("apps/frontend/src/App.tsx");
  const source = fs.readFileSync(appPath, "utf8");
  const matches = source.match(/<Route\\s+path=/g) ?? [];
  if (matches.length > 3) {
    console.error(`verify-routes-manifest: App.tsx contains ${matches.length} literal '<Route path=' occurrences; max allowed is 3.`);
    process.exit(1);
  }
  console.log(`verify-routes-manifest: ok (${matches.length} literal '<Route path=' occurrences)`);
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  run();
}
