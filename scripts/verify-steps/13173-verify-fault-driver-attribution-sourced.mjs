export default {
  name: "verify:fault-driver-attribution-sourced",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fault-driver-attribution-sourced.mjs"]);
  },
};
