import { execSync } from "node:child_process";

export default {
  name: "verify-gate-b-purge-predicate",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-gate-b-purge-predicate.mjs"]);
  },
};
