export default {
  name: "verify:driver-earnings-tab-error-state",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-earnings-tab-error-state.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-earnings-tab-error-state.mjs"]);
  },
};
