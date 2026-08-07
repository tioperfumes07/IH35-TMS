// verify-test-mock-entitypicker-pattern — §9.0 item 17 pattern sweep
export default {
  name: "verify:test-mock-entitypicker-pattern",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-test-mock-entitypicker-pattern.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-test-mock-entitypicker-pattern.mjs"]);
  },
};
