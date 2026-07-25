export default {
  name: "verify:header-counts-match-actual",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-header-counts-match-actual.mjs"]);
  },
};
