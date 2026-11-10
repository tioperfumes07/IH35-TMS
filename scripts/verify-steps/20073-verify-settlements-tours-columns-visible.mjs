export default {
  name: "verify:verify-settlements-tours-columns-visible",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlements-tours-columns-visible.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-settlements-tours-columns-visible.mjs"]);
  },
};
