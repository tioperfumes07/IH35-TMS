// verify-entity-picker-supersession-drain — §9.0 item 17 pattern sweep
export default {
  name: "verify:entity-picker-supersession-drain",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-entity-picker-supersession-drain.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-entity-picker-supersession-drain.mjs"]);
  },
};
