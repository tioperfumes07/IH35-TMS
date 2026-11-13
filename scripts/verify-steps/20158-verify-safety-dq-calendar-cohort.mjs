#!/usr/bin/env node
/**
 * verify-step 20158 — safety DQ calendar + cohort URL (board24 / N24)
 */
export default {
  name: "verify-safety-dq-calendar-cohort",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-dq-calendar-cohort.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-safety-dq-calendar-cohort.mjs"]);
  },
};
