#!/usr/bin/env node
export default {
  name: "3066-verify-wiring-plan-50-present",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-wiring-plan-50-present.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-wiring-plan-50-present.mjs"]);
  },
};
