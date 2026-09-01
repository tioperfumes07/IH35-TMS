// verify-settlement-header-backlink-written — wires a real, pre-existing guard
// (scripts/verify-settlement-header-backlink-written.mjs) into CI. Discovered orphan (neither
// package.json nor CI) via verify:guard-wired while an unrelated PR failed the required
// locked-guards/locked-guards-heavy checks on main's own pre-existing state. Claimed as
// verify-step 10221 (10221 % 4 === 1, CC-1 band), reserved on main before this collision repair.
export default {
  name: "verify:settlement-header-backlink-written",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-settlement-header-backlink-written.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-settlement-header-backlink-written.mjs"]);
  },
};
