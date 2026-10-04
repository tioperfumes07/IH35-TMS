export default {
  name: "verify:pcmiler-flag-gated",
  run(ctx) {
    ctx.run("node", ["scripts/verify-pcmiler-flag-gated.mjs"]);
  },
};
