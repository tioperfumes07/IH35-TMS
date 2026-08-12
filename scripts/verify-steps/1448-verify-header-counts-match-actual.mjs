export default {
  name: "verify:header-counts-match-actual",
  run(ctx) {
    ctx.run("node", ["scripts/verify-header-counts-match-actual.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-header-counts-match-actual.mjs"]);
  },
};
