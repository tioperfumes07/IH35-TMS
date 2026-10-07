export default {
  name: "verify:unselected-boxes-are-not-pure-white",
  run(ctx) {
    ctx.run("node", ["scripts/verify-unselected-boxes-are-not-pure-white.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-unselected-boxes-are-not-pure-white.mjs"]);
  },
};
