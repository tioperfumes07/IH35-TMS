import { execSync } from "node:child_process";

export default {
  name: "verify-user-facing-api-errors-in-toasts",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-user-facing-api-errors-in-toasts.mjs"]) !== 0) {
      return 1;
    }
    // BANK-F91439 — C-52 side-dock toasts (top-14; C-65 owns bottom-3). Never ran in CI.
    return ctx.run("node", ["scripts/ops/verify-c52-alerts-side-dock.mjs", "--selftest"]);
  },
};
