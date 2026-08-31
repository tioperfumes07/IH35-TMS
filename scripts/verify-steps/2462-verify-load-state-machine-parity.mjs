export default {
  name: "verify-load-state-machine-parity",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-load-state-machine-parity.mjs"]);
  },
};
