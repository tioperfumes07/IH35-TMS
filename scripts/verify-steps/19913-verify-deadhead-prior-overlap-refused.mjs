export default {
  name: "verify:verify-deadhead-prior-overlap-refused",
  run(ctx) {
    ctx.run("node", ["scripts/verify-deadhead-prior-overlap-refused.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-deadhead-prior-overlap-refused.mjs"]);
  },
};
