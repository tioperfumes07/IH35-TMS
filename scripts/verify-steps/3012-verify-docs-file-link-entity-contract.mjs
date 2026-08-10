import { execSync } from "node:child_process";

export default {
  name: "verify-docs-file-link-entity-contract",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-docs-file-link-entity-contract.mjs"]);
  },
};
