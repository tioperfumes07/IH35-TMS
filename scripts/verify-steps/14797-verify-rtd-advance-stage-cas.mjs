export default {
  name: "verify:rtd-advance-stage-cas",
  run(ctx) {
    ctx.run("node", ["scripts/verify-rtd-advance-stage-cas.mjs"]);
  },
};
