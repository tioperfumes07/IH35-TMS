#!/usr/bin/env node
export default {
  name: "3074-verify-findings-triple-lock-law",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-findings-triple-lock-law.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-findings-triple-lock-law.mjs"]);
    await ctx.run("node", ["scripts/verify-findings-register-signoff.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-findings-register-signoff.mjs"]);
  },
};
