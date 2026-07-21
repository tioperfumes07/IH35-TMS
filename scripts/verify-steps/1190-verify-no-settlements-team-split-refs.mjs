export default {
  name: "verify:no-settlements-team-split-refs",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-settlements-team-split-refs.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-no-settlements-team-split-refs.mjs"]);
  },
};
