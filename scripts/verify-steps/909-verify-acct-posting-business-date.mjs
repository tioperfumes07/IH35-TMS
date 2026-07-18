import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 0091-g6-1 (backend, remaining) auto-discovered verify-step (Rule 17: no package.json / ci.yml /
 * locked-guards edits). Runs the standalone guard that pins accounting-backend "today" posting/as-of
 * defaults to companyBusinessDate() (America/Chicago) — fails closed if the UTC-today anti-pattern
 * `new Date().toISOString().slice(0,10)` reappears anywhere under apps/backend/src/accounting.
 */
export default {
  name: "verify-acct-posting-business-date",
  run: (ctx) => {
    if (ctx.run("node", ["scripts/verify-acct-posting-business-date.mjs"]) !== 0) {
      process.exit(1);
    }
  },
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { createVerifyPrecommitContext } = await import("./_context.mjs");
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const ctx = createVerifyPrecommitContext(ROOT);
  if (ctx.run("node", ["scripts/verify-acct-posting-business-date.mjs"]) !== 0) process.exit(1);
}
