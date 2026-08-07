export default {
  name: "verify-entity-picker-driver-kind-sweep",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-entity-picker-driver-kind-sweep.mjs"]);
  },
};
