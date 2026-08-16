export default {
  name: "verify:fuel-gl-no-stranded-unposted",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fuel-gl-no-stranded-unposted.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-fuel-gl-no-stranded-unposted.mjs"]);
  },
};
