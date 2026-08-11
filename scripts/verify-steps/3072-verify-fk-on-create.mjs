#!/usr/bin/env node
export default {
  name: "3072-verify-fk-on-create",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fk-on-create.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-fk-on-create.mjs"]);
  },
};
