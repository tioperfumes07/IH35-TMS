import { execSync } from "node:child_process";

export default {
  name: "verify-outbox-handlers-rls-context",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-outbox-handlers-rls-context.mjs"]);
  },
};
