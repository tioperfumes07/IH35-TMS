import { execSync } from "node:child_process";

export default {
  name: "verify-user-facing-api-errors-in-toasts",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-user-facing-api-errors-in-toasts.mjs"]);
  },
};
