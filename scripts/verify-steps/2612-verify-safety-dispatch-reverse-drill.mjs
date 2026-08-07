// verify-safety-dispatch-reverse-drill — §9.0 item 17 pattern sweep
export default {
  name: "verify:safety-dispatch-reverse-drill",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-dispatch-reverse-drill.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-safety-dispatch-reverse-drill.mjs"]);
  },
};
